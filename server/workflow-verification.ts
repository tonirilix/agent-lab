import { execFile } from "node:child_process";
import { cp, lstat, mkdtemp, rm, symlink } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, relative, resolve, sep } from "node:path";
import { fileURLToPath } from "node:url";
import type { PendingChangeSet } from "../shared/change-set-contracts.js";
import { resolveWorkspaceRoot, type WorkspaceRoot } from "./workspace-root.js";
import { MAX_FILE_BYTES } from "../shared/agent-policy.js";
import { createWorkspaceTools } from "./workspace-tools.js";
import { createWorkspaceTransaction } from "./workspace-transaction.js";

const projectRoot = fileURLToPath(new URL("../", import.meta.url));
const exampleWorkspace = resolve(projectRoot, "examples/task-list");
const vitestCli = resolve(projectRoot, "node_modules/vitest/vitest.mjs");

function plainOutput(output: string) {
  return output.replace(/\u001b\[[0-?]*[ -/]*[@-~]/g, "");
}

/** Runs the bundled example's tests against the proposal, never the live Workspace. */
export async function verifyWorkflowChangeSet(
  workspace: WorkspaceRoot,
  changeSet: PendingChangeSet,
): Promise<string> {
  if (workspace.canonicalPath !== exampleWorkspace) {
    return "Automated verification is available for the bundled task-list Workspace only. Inspect and run this Workspace's tests manually before approval.";
  }
  const disposable = await mkdtemp(join(tmpdir(), "agent-lab-verify-"));
  try {
    await cp(exampleWorkspace, disposable, {
      recursive: true,
      filter: async (source) => {
        const path = relative(exampleWorkspace, source);
        if (!path) return true;
        if (path.split(sep).some((part) => part.startsWith(".") || part === "node_modules")) return false;
        const metadata = await lstat(source);
        return metadata.isDirectory() || (metadata.isFile() && metadata.size <= MAX_FILE_BYTES);
      },
    });
    await symlink(resolve(projectRoot, "node_modules"), resolve(disposable, "node_modules"), "dir");
    const disposableWorkspace = await resolveWorkspaceRoot(disposable);
    const workspaceTools = await createWorkspaceTools(disposableWorkspace);
    await createWorkspaceTransaction(workspaceTools, disposableWorkspace)
      .apply(changeSet.id, changeSet.operations);
    const output = await new Promise<{ stdout: string; stderr: string }>((resolveOutput, reject) => {
      execFile(process.execPath, [vitestCli, "run", "--root", disposable], {
        cwd: disposable,
        timeout: 60_000,
        maxBuffer: 512_000,
        env: { PATH: process.env.PATH, CI: "true" },
      }, (error, stdout, stderr) => {
        if (error) {
          reject(new Error(`Proposed Change Set failed the example test suite.\n${plainOutput(stdout + stderr).slice(-8_000) || error.message}`));
        } else resolveOutput({ stdout, stderr });
      });
    });
    return `Passed the example test suite in a disposable copy.\n${plainOutput(output.stdout + output.stderr).slice(-8_000)}`;
  } finally {
    await rm(disposable, { recursive: true, force: true });
  }
}
