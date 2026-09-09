import { createHash } from "node:crypto";
import {
  MAX_CHANGE_SET_BYTES,
  changeSetProposalSchema,
  type ChangeOperation,
  type ChangeSetProposal,
  type AppliedChangeSet,
  type PendingChangeSet,
} from "../shared/change-set-contracts.js";
import type { WorkspaceTools } from "./workspace-tools.js";
import type { WorkspaceRoot } from "./workspace-root.js";
import { createChangeSetDiff } from "./change-set-diff.js";
import { createWorkspaceTransaction } from "./workspace-transaction.js";

export class ChangeSetValidationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "ChangeSetValidationError";
  }
}

async function asChangeSetValidation<T>(
  operation: () => T | Promise<T>,
): Promise<T> {
  try {
    return await operation();
  } catch (error) {
    if (error instanceof ChangeSetValidationError) throw error;
    throw new ChangeSetValidationError(
      error instanceof Error ? error.message : String(error),
    );
  }
}

function preserveTextStyle(original: string, proposed: string) {
  const newline = original.includes("\r\n") ? "\r\n" : "\n";
  let normalized = proposed.replace(/\r\n|\r/g, "\n");
  const originalHasFinalNewline = /\r?\n$/.test(original);
  if (originalHasFinalNewline && !normalized.endsWith("\n")) {
    normalized += "\n";
  } else if (!originalHasFinalNewline && normalized.endsWith("\n")) {
    normalized = normalized.replace(/\n+$/, "");
  }
  return newline === "\r\n" ? normalized.replace(/\n/g, "\r\n") : normalized;
}

export function createChangeSetService(
  workspaceTools: WorkspaceTools,
  workspace: WorkspaceRoot,
) {
  let pendingChangeSet: PendingChangeSet | null = null;
  let preparingChangeSet = false;
  let applyingChangeSet = false;
  const completedChangeSets = new Map<string, AppliedChangeSet>();
  const workspaceTransaction = createWorkspaceTransaction(
    workspaceTools,
    workspace,
  );

  return {
    async prepare(candidate: unknown): Promise<PendingChangeSet> {
      if (pendingChangeSet || preparingChangeSet) {
        throw new ChangeSetValidationError("A Change Set is already pending.");
      }
      preparingChangeSet = true;

      try {
        const parsed = changeSetProposalSchema.safeParse(candidate);
        if (!parsed.success) {
          throw new ChangeSetValidationError(
            `Invalid Change Set structure: ${parsed.error.issues
              .map((issue) => `${issue.path.join(".")}: ${issue.message}`)
              .join("; ")}`,
          );
        }
        const proposal: ChangeSetProposal = parsed.data;
        const seenPaths = new Set<string>();
        let proposedBytes = 0;
        const files: PendingChangeSet["files"] = [];
        const validatedOperations: ChangeOperation[] = [];

        for (const operation of proposal.operations) {
          if (seenPaths.has(operation.path)) {
            throw new ChangeSetValidationError(
              `Duplicate Change Set path: ${operation.path}`,
            );
          }
          seenPaths.add(operation.path);

          let originalContent = "";
          if (operation.kind === "create") {
            proposedBytes += await asChangeSetValidation(async () => {
              await workspaceTools.validateCreatePath({ path: operation.path });
              return workspaceTools.validateProposedContent(operation).sizeBytes;
            });
          } else {
            const original = await asChangeSetValidation(() =>
              workspaceTools.readFile({ path: operation.path }),
            );
            originalContent = original.content;
            if (operation.originalFingerprint !== original.fingerprint) {
              throw new ChangeSetValidationError(
                `Original fingerprint does not match the current file: ${operation.path}`,
              );
            }
            if (operation.kind === "modify") {
              operation.content = preserveTextStyle(
                originalContent,
                operation.content,
              );
              proposedBytes += await asChangeSetValidation(
                () => workspaceTools.validateProposedContent(operation).sizeBytes,
              );
            }
          }

          if (proposedBytes > MAX_CHANGE_SET_BYTES) {
            throw new ChangeSetValidationError(
              `Change Set exceeds the ${MAX_CHANGE_SET_BYTES}-byte Safety Limit.`,
            );
          }
          files.push({
            kind: operation.kind,
            path: operation.path,
            diff: createChangeSetDiff(operation, originalContent),
          });
          validatedOperations.push(operation);
        }

        const validatedProposal = { ...proposal, operations: validatedOperations };

        const id = createHash("sha256")
          .update(JSON.stringify({ proposal: validatedProposal, files }))
          .digest("hex")
          .slice(0, 16);
        pendingChangeSet = {
          ...validatedProposal,
          id,
          status: "pending",
          files,
          warnings: proposal.operations
            .filter((operation) => operation.kind === "delete")
            .map((operation) => `This will delete ${operation.path}.`),
        };
        return pendingChangeSet;
      } finally {
        preparingChangeSet = false;
      }
    },

    getPending() {
      return pendingChangeSet;
    },

    async reject(id: string, feedback?: string) {
      if (!pendingChangeSet || pendingChangeSet.id !== id) {
        throw new ChangeSetValidationError("Pending Change Set does not match.");
      }
      if (feedback && feedback.length > 2_000) {
        throw new ChangeSetValidationError(
          "Rejection feedback exceeds 2000 characters.",
        );
      }
      const rejected = pendingChangeSet;
      pendingChangeSet = null;
      return { id: rejected.id, status: "rejected" as const, feedback };
    },

    async approve(id: string): Promise<AppliedChangeSet> {
      if (
        !pendingChangeSet ||
        pendingChangeSet.id !== id ||
        applyingChangeSet
      ) {
        throw new ChangeSetValidationError(
          applyingChangeSet
            ? "A Change Set is already being applied."
            : "Pending Change Set does not match this Approval.",
        );
      }
      applyingChangeSet = true;
      const approved = pendingChangeSet;

      try {
        const files = await workspaceTransaction.apply(
          approved.id,
          approved.operations,
        );
        const result: AppliedChangeSet = {
          id: approved.id,
          summary: approved.summary,
          status: "verified",
          lifecycle: ["proposed", "approved", "applied", "verified"],
          files,
          actualDiff: files.map((file) => file.actualDiff).join("\n"),
        };
        pendingChangeSet = null;
        completedChangeSets.set(result.id, result);
        return result;
      } catch (error) {
        throw error instanceof ChangeSetValidationError
          ? error
          : new ChangeSetValidationError(
              `Change Set application failed: ${error instanceof Error ? error.message : String(error)}`,
            );
      } finally {
        applyingChangeSet = false;
      }
    },

    getCompleted(id: string) {
      return completedChangeSets.get(id) ?? null;
    },
  };
}

export type ChangeSetService = ReturnType<typeof createChangeSetService>;
