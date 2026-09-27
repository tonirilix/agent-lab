import {
  convertToModelMessages,
  generateText,
  isStepCount,
  jsonSchema,
  streamText,
  tool,
  type LanguageModel,
  type UIMessage,
  zodSchema,
} from "ai";
import {
  changeSetProposalSchema,
  workflowChangeSetDraftSchema,
  type PendingChangeSet,
} from "../shared/change-set-contracts.js";
import {
  ChangeSetValidationError,
  createChangeSetService,
} from "./change-set.js";
import { createWorkspaceTools } from "./workspace-tools.js";
import { createReadOnlyAgentTools } from "./read-only-agent-tools.js";
import type { WorkspaceRoot } from "./workspace-root.js";
import {
  BASE_AGENT_INSTRUCTIONS,
  CONTEXT_WARNING_CHARACTERS,
  MAX_AGENT_STEPS,
} from "../shared/agent-policy.js";
import { createDiagnosticUIStream } from "./turn-diagnostics.js";

export { MAX_AGENT_STEPS } from "../shared/agent-policy.js";

export class ActiveAgentTurnError extends Error {
  constructor() {
    super("An Agent Turn is already active.");
    this.name = "ActiveAgentTurnError";
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

  const readOnlyTools = createReadOnlyAgentTools(workspaceTools);

  return {
    async startTurn(
      messages: UIMessage[],
      abortSignal?: AbortSignal,
      options: {
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
        const tools = {
          ...readOnlyTools,
          proposeChangeSet: tool({
            description:
              "Prepare one structured Change Set for review. This creates no files and grants no write permission.",
            inputSchema: jsonSchema(zodSchema(changeSetProposalSchema).jsonSchema),
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
        };
        const result = streamText({
          model,
          instructions: [
            ...BASE_AGENT_INSTRUCTIONS.slice(0, 2),
            completedChangeSet
              ? "Agent Lab already applied and verified the user-approved Change Set. Describe that result accurately without implying an unverified action."
              : "Never claim that you changed files: this Agent Turn has no write capability.",
            "Call proposeChangeSet only after the user clearly agrees in chat that they want a Change Set prepared. It prepares review data only; it never writes files. Otherwise, discuss or inspect the Workspace without proposing a Change Set.",
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
          streamRetries: 1,
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

    async prepareWorkflowChangeSet(input: {
      objective: string;
      plan: string;
      findings: string[];
    }): Promise<PendingChangeSet> {
      if (activeTurn) throw new ActiveAgentTurnError();
      activeTurn = true;
      let prepared: PendingChangeSet | undefined;
      let validationError: string | undefined;
      const observedFingerprints = new Map<string, string>();
      try {
        await generateText({
          model,
          instructions: [
            "You are the implementation worker in Agent Lab.",
            "Read every existing file you intend to modify or delete before proposing one complete Change Set.",
            "Do not calculate or copy originalFingerprint values; the server binds proposals to the file versions returned by readFile.",
            "The Change Set should satisfy the objective and include appropriate tests.",
            "You cannot write files. proposeChangeSet only prepares a reviewable proposal; the user must approve it separately.",
          ].join(" "),
          prompt: [
            `Objective: ${input.objective}`,
            `Coordinator plan: ${input.plan}`,
            ...input.findings.map((finding, index) =>
              `Investigation ${index + 1}: ${finding}`,
            ),
          ].join("\n\n"),
          tools: {
            ...createReadOnlyAgentTools(workspaceTools, undefined, (file) => {
              observedFingerprints.set(file.path, file.fingerprint);
            }),
            proposeChangeSet: tool({
              description:
                "Prepare one structured Change Set for human review. Read existing files first; omit originalFingerprint. This never writes files.",
              inputSchema: jsonSchema(zodSchema(workflowChangeSetDraftSchema).jsonSchema),
              execute: async (candidate) => {
                try {
                  const parsed = workflowChangeSetDraftSchema.safeParse(candidate);
                  if (!parsed.success) {
                    throw new ChangeSetValidationError(
                      `Invalid Change Set structure: ${parsed.error.issues
                        .map((issue) => `${issue.path.join(".")}: ${issue.message}`)
                        .join("; ")}`,
                    );
                  }
                  const operations = parsed.data.operations.map((operation) => {
                    if (operation.kind === "create") return operation;
                    const originalFingerprint = observedFingerprints.get(operation.path);
                    if (!originalFingerprint) {
                      throw new ChangeSetValidationError(
                        `Read ${operation.path} before proposing a ${operation.kind} operation.`,
                      );
                    }
                    const { originalFingerprint: _ignored, ...draft } = operation;
                    return { ...draft, originalFingerprint };
                  });
                  prepared = await changeSets.prepare({
                    summary: parsed.data.summary,
                    operations,
                  });
                  return { ok: true, changeSet: prepared };
                } catch (error) {
                  if (error instanceof ChangeSetValidationError) {
                    validationError = error.message;
                    return {
                      ok: false,
                      error: { code: "invalid_change_set", message: error.message },
                    };
                  }
                  throw error;
                }
              },
            }),
          },
          stopWhen: [isStepCount(MAX_AGENT_STEPS), () => !!prepared],
          maxOutputTokens: 8_000,
          abortSignal: AbortSignal.timeout(180_000),
        });
        if (!prepared) {
          throw new ChangeSetValidationError(
            validationError
              ? `Implementation worker did not prepare a valid Change Set: ${validationError}`
              : "Implementation worker did not prepare a Change Set.",
          );
        }
        return prepared;
      } finally {
        activeTurn = false;
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
