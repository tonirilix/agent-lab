import {
  convertToModelMessages,
  isStepCount,
  jsonSchema,
  streamText,
  tool,
  type LanguageModel,
  type UIMessage,
  zodSchema,
} from "ai";
import { z } from "zod";
import { changeSetProposalSchema } from "../shared/change-set-contracts.js";
import {
  ChangeSetValidationError,
  createChangeSetService,
} from "./change-set.js";
import {
  WorkspaceAccessError,
  createWorkspaceTools,
} from "./workspace-tools.js";
import type { WorkspaceRoot } from "./workspace-root.js";
import {
  BASE_AGENT_INSTRUCTIONS,
  CONTEXT_WARNING_CHARACTERS,
  MAX_AGENT_STEPS,
} from "../shared/agent-policy.js";
import { createDiagnosticUIStream } from "./turn-diagnostics.js";

export { MAX_AGENT_STEPS } from "../shared/agent-policy.js";
const MAX_TOOL_PATH_LENGTH = 4_096;
const MAX_SEARCH_QUERY_LENGTH = 1_000;

export class ActiveAgentTurnError extends Error {
  constructor() {
    super("An Agent Turn is already active.");
    this.name = "ActiveAgentTurnError";
  }
}

async function runWorkspaceTool<T>(
  operation: () => Promise<T>,
  abortSignal?: AbortSignal,
) {
  try {
    return { ok: true as const, result: await operation() };
  } catch (error) {
    if (abortSignal?.aborted) throw error;
    if (error instanceof WorkspaceAccessError) {
      return {
        ok: false as const,
        error: { code: "workspace_access_denied", message: error.message },
      };
    }
    throw error;
  }
}

function releaseWhenFinished<T>(
  stream: ReadableStream<T>,
  release: () => void,
): ReadableStream<T> {
  const reader = stream.getReader();
  let released = false;
  const releaseOnce = () => {
    if (!released) {
      released = true;
      release();
    }
  };

  return new ReadableStream<T>({
    async pull(controller) {
      try {
        const chunk = await reader.read();
        if (chunk.done) {
          releaseOnce();
          controller.close();
        } else {
          controller.enqueue(chunk.value);
        }
      } catch (error) {
        releaseOnce();
        controller.error(error);
      }
    },
    async cancel(reason) {
      try {
        await reader.cancel(reason);
      } finally {
        releaseOnce();
      }
    },
  });
}

export async function createAgentSession({
  model,
  modelName,
  workspace,
}: {
  model: LanguageModel;
  modelName?: string;
  workspace: WorkspaceRoot;
}) {
  const workspaceTools = await createWorkspaceTools(workspace);
  const changeSets = createChangeSetService(workspaceTools, workspace);
  let activeTurn = false;

  const readOnlyTools = {
    listFiles: tool({
      description:
        "List eligible UTF-8 text files in the Workspace, optionally below a relative directory.",
      inputSchema: z.object({
        path: z
          .string()
          .max(MAX_TOOL_PATH_LENGTH)
          .optional()
          .describe("Relative directory; defaults to ."),
      }),
      execute: (input, { abortSignal }) =>
        runWorkspaceTool(
          () => workspaceTools.listFiles(input, { signal: abortSignal }),
          abortSignal,
        ),
    }),
    readFile: tool({
      description:
        "Read one eligible UTF-8 text file from the Workspace, up to the visible file-size Safety Limit.",
      inputSchema: z.object({
        path: z
          .string()
          .max(MAX_TOOL_PATH_LENGTH)
          .describe("Relative file path in the Workspace"),
      }),
      execute: (input, { abortSignal }) =>
        runWorkspaceTool(
          () => workspaceTools.readFile(input, { signal: abortSignal }),
          abortSignal,
        ),
    }),
    searchCode: tool({
      description:
        "Search eligible Workspace files for plain text and return bounded line matches.",
      inputSchema: z.object({
        query: z
          .string()
          .min(1)
          .max(MAX_SEARCH_QUERY_LENGTH)
          .describe("Plain text to find"),
        path: z
          .string()
          .max(MAX_TOOL_PATH_LENGTH)
          .optional()
          .describe("Optional relative directory"),
        caseSensitive: z.boolean().optional(),
      }),
      execute: (input, { abortSignal }) =>
        runWorkspaceTool(
          () => workspaceTools.searchCode(input, { signal: abortSignal }),
          abortSignal,
        ),
    }),
  };

  return {
    async startTurn(
      messages: UIMessage[],
      abortSignal?: AbortSignal,
      options: {
        proposalRequested?: boolean;
        completedChangeSetId?: string;
      } = {},
    ) {
      if (activeTurn) throw new ActiveAgentTurnError();
      activeTurn = true;
      const startedAt = Date.now();
      let proposalCreatedThisTurn = false;

      try {
        const completedChangeSet = options.completedChangeSetId
          ? changeSets.getCompleted(options.completedChangeSetId)
          : null;
        if (options.completedChangeSetId && !completedChangeSet) {
          throw new ChangeSetValidationError(
            "Verified Change Set result does not match this Agent Turn.",
          );
        }
        const tools = options.proposalRequested
          ? {
              ...readOnlyTools,
              proposeChangeSet: tool({
                description:
                  "Prepare one structured Change Set for review. This creates no files and grants no write permission.",
                inputSchema: jsonSchema(
                  zodSchema(changeSetProposalSchema).jsonSchema,
                ),
                execute: async (proposal) => {
                  try {
                    const changeSet = await changeSets.prepare(proposal);
                    proposalCreatedThisTurn = true;
                    return { ok: true as const, changeSet };
                  } catch (error) {
                    if (error instanceof ChangeSetValidationError) {
                      return {
                        ok: false as const,
                        error: {
                          code: "invalid_change_set",
                          message: error.message,
                        },
                      };
                    }
                    throw error;
                  }
                },
              }),
            }
          : readOnlyTools;
        const result = streamText({
          model,
          instructions: [
            ...BASE_AGENT_INSTRUCTIONS.slice(0, 2),
            completedChangeSet
              ? "Agent Lab already applied and verified the user-approved Change Set. Describe that result accurately without implying an unverified action."
              : "Never claim that you changed files: this Agent Turn has no write capability.",
            options.proposalRequested
              ? "The user made a Proposal Request. After enough inspection, call proposeChangeSet once with the complete Change Set. This prepares review data only."
              : "No Proposal Request was made. You cannot prepare a Change Set in this Agent Turn.",
            completedChangeSet
              ? `The user approved a Change Set that Agent Lab applied and verified. Base your final summary on this authoritative application result: ${JSON.stringify(completedChangeSet)}`
              : "No verified application result is attached to this Agent Turn.",
            ...BASE_AGENT_INSTRUCTIONS.slice(2),
          ].join(" "),
          messages: await convertToModelMessages(messages),
          tools,
          stopWhen: [
            isStepCount(MAX_AGENT_STEPS),
            () => proposalCreatedThisTurn,
          ],
          abortSignal,
        });

        return releaseWhenFinished(
          createDiagnosticUIStream({
            stream: result.stream,
            model:
              modelName ?? (typeof model === "string" ? model : model.modelId),
            contextWarning:
              JSON.stringify(messages).length >= CONTEXT_WARNING_CHARACTERS,
            startedAt,
          }),
          () => {
            activeTurn = false;
          },
        );
      } catch (error) {
        activeTurn = false;
        throw error;
      }
    },

    getPendingChangeSet() {
      return changeSets.getPending();
    },

    rejectChangeSet(id: string, feedback?: string) {
      if (activeTurn) throw new ActiveAgentTurnError();
      return changeSets.reject(id, feedback);
    },

    async approveChangeSet(id: string) {
      if (activeTurn) throw new ActiveAgentTurnError();
      activeTurn = true;
      try {
        return await changeSets.approve(id);
      } finally {
        activeTurn = false;
      }
    },
  };
}

export type AgentSession = Awaited<ReturnType<typeof createAgentSession>>;
