import {
  convertToModelMessages,
  isStepCount,
  jsonSchema,
  streamText,
  toUIMessageStream,
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

export const MAX_AGENT_STEPS = 12;
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
  workspace,
}: {
  model: LanguageModel;
  workspace: WorkspaceRoot;
}) {
  const workspaceTools = await createWorkspaceTools(workspace);
  const changeSets = createChangeSetService(workspaceTools);
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
      options: { proposalRequested?: boolean } = {},
    ) {
      if (activeTurn) throw new ActiveAgentTurnError();
      activeTurn = true;
      let proposalCreatedThisTurn = false;

      try {
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
            "You are the Coding Agent in Agent Lab.",
            "Use the read-only Workspace Tools to investigate code when needed.",
            "Never claim that you changed files: this Agent Turn has no write capability.",
            options.proposalRequested
              ? "The user made a Proposal Request. After enough inspection, call proposeChangeSet once with the complete Change Set. This prepares review data only."
              : "No Proposal Request was made. You cannot prepare a Change Set in this Agent Turn.",
            "Be concise and explain conclusions using the evidence you inspected.",
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
          toUIMessageStream({ stream: result.stream }),
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
      return changeSets.reject(id, feedback);
    },
  };
}

export type AgentSession = Awaited<ReturnType<typeof createAgentSession>>;
