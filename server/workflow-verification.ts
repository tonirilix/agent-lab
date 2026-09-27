import { execFile } from "node:child_process";
import { createHash } from "node:crypto";
import { cp, lstat, mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { dirname, isAbsolute, join, relative, resolve, sep } from "node:path";
import { fileURLToPath } from "node:url";
import type { PendingChangeSet } from "../shared/change-set-contracts.js";
import type { WorkspaceRoot } from "./workspace-root.js";
import { MAX_FILE_BYTES } from "../shared/agent-policy.js";

const projectRoot = fileURLToPath(new URL("../", import.meta.url));
const exampleWorkspace = resolve(projectRoot, "examples/task-list");
const vitestCli = resolve(projectRoot, "node_modules/vitest/vitest.mjs");

function plainOutput(output: string) {
  return output.replace(/\u001b\[[0-?]*[ -/]*[@-~]/g, "");
}

function inside(root: string, path: string) {
  const displacement = relative(root, path);
  return displacement !== "" && displacement !== ".." &&
    !displacement.startsWith(`..${sep}`) && !isAbsolute(displacement);
}

function fingerprint(content: Buffer) {
  return createHash("sha256").update(content).digest("hex");
}

async function applyProposal(root: string, changeSet: PendingChangeSet) {
  for (const operation of changeSet.operations) {
    const target = resolve(root, operation.path);
    if (!inside(root, target) || operation.path.split(/[\\/]/).includes("..")) {
      throw new Error(`Verification rejected an unsafe path: ${operation.path}`);
    }
    let existing: Buffer | undefined;
    try {
      const metadata = await lstat(target);
      if (!metadata.isFile()) throw new Error(`Verification cannot change a non-file: ${operation.path}`);
      existing = await readFile(target);
    } catch (error) {
      if (!(error instanceof Error && "code" in error && error.code === "ENOENT")) throw error;
    }
    if (operation.kind === "create") {
      if (existing) throw new Error(`Verification found an existing file: ${operation.path}`);
      await mkdir(dirname(target), { recursive: true });
      await writeFile(target, operation.content);
    } else {
      if (!existing || fingerprint(existing) !== operation.originalFingerprint) {
        throw new Error(`Verification found a stale file: ${operation.path}`);
      }
      if (operation.kind === "delete") await rm(target);
      else await writeFile(target, operation.content);
    }
  }
}

/** Runs the bundled example's tests against the proposal, never the live Workspace. */
export async function verifyWorkflowChangeSet(
  workspace: WorkspaceRoot,
  changeSet: PendingChangeSet,
): Promise<string> {
  if (workspace.canonicalPath !== exampleWorkspace) {
    return "Automated verification is available for the bundled task-list Workspace only. Inspect and run this Workspace's tests manually before approval.";
  }
  const disposable = await mkdtemp(join(projectRoot, ".agent-lab-verify-"));
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
    await applyProposal(disposable, changeSet);
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
