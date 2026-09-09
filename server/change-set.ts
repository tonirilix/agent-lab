import { createHash } from "node:crypto";
import { createTwoFilesPatch } from "diff";
import {
  MAX_CHANGE_SET_BYTES,
  changeSetProposalSchema,
  type ChangeOperation,
  type ChangeSetProposal,
  type PendingChangeSet,
} from "../shared/change-set-contracts.js";
import type { WorkspaceTools } from "./workspace-tools.js";

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

function reviewDiff(
  operation: ChangeOperation,
  originalContent: string,
): string {
  const resultingContent = operation.kind === "delete" ? "" : operation.content;
  const beforePath = operation.kind === "create" ? "/dev/null" : `a/${operation.path}`;
  const afterPath = operation.kind === "delete" ? "/dev/null" : `b/${operation.path}`;
  return createTwoFilesPatch(
    beforePath,
    afterPath,
    originalContent,
    resultingContent,
    "",
    "",
    { context: 3 },
  );
}

export function createChangeSetService(workspaceTools: WorkspaceTools) {
  let pendingChangeSet: PendingChangeSet | null = null;
  let preparingChangeSet = false;

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
            diff: reviewDiff(operation, originalContent),
          });
        }

        const id = createHash("sha256")
          .update(JSON.stringify({ proposal, files }))
          .digest("hex")
          .slice(0, 16);
        pendingChangeSet = {
          ...proposal,
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
  };
}

export type ChangeSetService = ReturnType<typeof createChangeSetService>;
