import {
  chmod,
  link,
  lstat,
  mkdtemp,
  readFile,
  rename,
  rm,
  writeFile,
} from "node:fs/promises";
import { dirname, resolve } from "node:path";
import type {
  AppliedChangeSet,
  ChangeOperation,
} from "../shared/change-set-contracts.js";
import { createChangeSetDiff } from "./change-set-diff.js";
import type { WorkspaceTools } from "./workspace-tools.js";
import type { WorkspaceRoot } from "./workspace-root.js";

type Snapshot = {
  operation: ChangeOperation;
  target: string;
  content: Buffer | null;
  mode: number;
  transactionDirectory: string;
  stagedPath?: string;
  backupPath?: string;
  targetCreated?: boolean;
};

async function removeIfPresent(path: string | undefined, recursive = false) {
  if (path) await rm(path, { force: true, recursive });
}

async function rollback(snapshots: Snapshot[]) {
  for (const snapshot of [...snapshots].reverse()) {
    if (snapshot.targetCreated) await removeIfPresent(snapshot.target);
    if (snapshot.backupPath) {
      await removeIfPresent(snapshot.target);
      await rename(snapshot.backupPath, snapshot.target);
      snapshot.backupPath = undefined;
    }
    await removeIfPresent(snapshot.stagedPath);
    await removeIfPresent(snapshot.transactionDirectory, true);
  }
}

function assertCurrentFingerprint(
  operation: Exclude<ChangeOperation, { kind: "create" }>,
  fingerprint: string,
) {
  if (fingerprint !== operation.originalFingerprint) {
    throw new Error(`Workspace file changed after review: ${operation.path}`);
  }
}

export function createWorkspaceTransaction(
  workspaceTools: WorkspaceTools,
  workspace: WorkspaceRoot,
) {
  return {
    async apply(
      changeSetId: string,
      operations: ChangeOperation[],
    ): Promise<AppliedChangeSet["files"]> {
      const snapshots: Snapshot[] = [];
      let verified = false;

      try {
        for (const [index, operation] of operations.entries()) {
          const target = resolve(workspace.canonicalPath, operation.path);
          if (operation.kind === "create") {
            await workspaceTools.validateCreatePath({ path: operation.path });
            workspaceTools.validateProposedContent(operation);
            const transactionDirectory = await mkdtemp(
              resolve(dirname(target), `.agent-lab-${changeSetId}-${index}-`),
            );
            snapshots.push({
              operation,
              target,
              content: null,
              mode: 0o644,
              transactionDirectory,
            });
          } else {
            const current = await workspaceTools.readFile({
              path: operation.path,
            });
            assertCurrentFingerprint(operation, current.fingerprint);
            if (operation.kind === "modify") {
              workspaceTools.validateProposedContent(operation);
            }
            const content = await readFile(target);
            const mode = (await lstat(target)).mode & 0o777;
            const transactionDirectory = await mkdtemp(
              resolve(dirname(target), `.agent-lab-${changeSetId}-${index}-`),
            );
            snapshots.push({
              operation,
              target,
              content,
              mode,
              transactionDirectory,
            });
          }

          const snapshot = snapshots.at(-1)!;
          if (operation.kind !== "delete") {
            snapshot.stagedPath = resolve(snapshot.transactionDirectory, "staged");
            await writeFile(snapshot.stagedPath, operation.content, { flag: "wx" });
            await chmod(snapshot.stagedPath, snapshot.mode);
          }
        }

        // Staging can take time, so validate every assumption again at the
        // narrowest point immediately before the transaction begins to commit.
        for (const snapshot of snapshots) {
          if (snapshot.operation.kind === "create") {
            await workspaceTools.validateCreatePath({
              path: snapshot.operation.path,
            });
          } else {
            const current = await workspaceTools.readFile({
              path: snapshot.operation.path,
            });
            assertCurrentFingerprint(snapshot.operation, current.fingerprint);
          }
        }

        for (const snapshot of snapshots) {
          if (snapshot.operation.kind === "create") {
            await link(snapshot.stagedPath!, snapshot.target);
            snapshot.targetCreated = true;
            await removeIfPresent(snapshot.stagedPath);
            snapshot.stagedPath = undefined;
            await new Promise<void>((ready) => setImmediate(ready));
            continue;
          }
          const backupPath = resolve(snapshot.transactionDirectory, "backup");
          await rename(snapshot.target, backupPath);
          snapshot.backupPath = backupPath;
          if (snapshot.operation.kind === "modify") {
            await rename(snapshot.stagedPath!, snapshot.target);
            snapshot.stagedPath = undefined;
          }
          await new Promise<void>((ready) => setImmediate(ready));
        }

        const files: AppliedChangeSet["files"] = [];
        for (const snapshot of snapshots) {
          if (snapshot.operation.kind === "delete") {
            try {
              await lstat(snapshot.target);
              throw new Error(
                `Verification failed; deleted path still exists: ${snapshot.operation.path}`,
              );
            } catch (error) {
              if (
                !(error instanceof Error && "code" in error && error.code === "ENOENT")
              ) {
                throw error;
              }
            }
          } else {
            const actualContent = await readFile(snapshot.target, "utf8");
            if (actualContent !== snapshot.operation.content) {
              throw new Error(`Verification failed for ${snapshot.operation.path}`);
            }
          }
          files.push({
            kind: snapshot.operation.kind,
            path: snapshot.operation.path,
            status: "verified",
            actualDiff: createChangeSetDiff(
              snapshot.operation,
              snapshot.content?.toString("utf8") ?? "",
            ),
          });
        }

        verified = true;
        return files;
      } catch (error) {
        await rollback(snapshots);
        throw error;
      } finally {
        if (verified) {
          await Promise.allSettled(
            snapshots.map((snapshot) =>
              removeIfPresent(snapshot.transactionDirectory, true),
            ),
          );
        }
      }
    },
  };
}
