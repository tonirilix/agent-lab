import { createHash } from "node:crypto";
import { mkdtemp, mkdir, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { createChangeSetService } from "./change-set.js";
import { resolveWorkspaceRoot } from "./workspace-root.js";
import { createWorkspaceTools } from "./workspace-tools.js";

const temporaryWorkspaces: string[] = [];

function fingerprint(content: string) {
  return createHash("sha256").update(content).digest("hex");
}

async function createWorkspace() {
  const workspace = await mkdtemp(join(tmpdir(), "agent-lab-change-set-"));
  temporaryWorkspaces.push(workspace);
  await mkdir(join(workspace, "src"));
  await Promise.all([
    writeFile(join(workspace, "src", "modify.ts"), "export const value = 1;\n"),
    writeFile(join(workspace, "src", "delete.ts"), "export const old = true;\n"),
  ]);
  return workspace;
}

afterEach(async () => {
  await Promise.all(
    temporaryWorkspaces.splice(0).map((workspace) =>
      rm(workspace, { recursive: true, force: true }),
    ),
  );
});

describe("Change Set review", () => {
  it("validates create, modify, and delete operations and derives their diffs without writing", async () => {
    const workspace = await createWorkspace();
    const originalModify = await readFile(
      join(workspace, "src", "modify.ts"),
      "utf8",
    );
    const originalDelete = await readFile(
      join(workspace, "src", "delete.ts"),
      "utf8",
    );
    const tools = await createWorkspaceTools(await resolveWorkspaceRoot(workspace));
    const changeSets = createChangeSetService(
      tools,
      await resolveWorkspaceRoot(workspace),
    );

    const pending = await changeSets.prepare({
      summary: "Update the task implementation",
      operations: [
        {
          kind: "create",
          path: "src/create.ts",
          content: "export const created = true;\n",
        },
        {
          kind: "modify",
          path: "src/modify.ts",
          originalFingerprint: fingerprint(originalModify),
          content: "export const value = 2;\n",
        },
        {
          kind: "delete",
          path: "src/delete.ts",
          originalFingerprint: fingerprint(originalDelete),
        },
      ],
    });

    expect(pending.summary).toBe("Update the task implementation");
    expect(pending.files.map((file) => [file.kind, file.path])).toEqual([
      ["create", "src/create.ts"],
      ["modify", "src/modify.ts"],
      ["delete", "src/delete.ts"],
    ]);
    expect(pending.files.every((file) => file.diff.includes("---"))).toBe(true);
    expect(await readFile(join(workspace, "src", "modify.ts"), "utf8")).toBe(
      originalModify,
    );
    expect(await readFile(join(workspace, "src", "delete.ts"), "utf8")).toBe(
      originalDelete,
    );
    await expect(readFile(join(workspace, "src", "create.ts"))).rejects.toThrow();
  });

  it("rejects stale, duplicate, unsafe, and concurrent proposals without writing", async () => {
    const workspace = await createWorkspace();
    const original = await readFile(join(workspace, "src", "modify.ts"), "utf8");
    const tools = await createWorkspaceTools(await resolveWorkspaceRoot(workspace));
    const changeSets = createChangeSetService(
      tools,
      await resolveWorkspaceRoot(workspace),
    );

    await expect(
      changeSets.prepare({
        summary: "Stale",
        operations: [
          {
            kind: "modify",
            path: "src/modify.ts",
            originalFingerprint: "0".repeat(64),
            content: "changed\n",
          },
        ],
      }),
    ).rejects.toThrow("fingerprint");
    await expect(
      changeSets.prepare({
        summary: "Duplicate",
        operations: [
          { kind: "delete", path: "src/modify.ts", originalFingerprint: fingerprint(original) },
          { kind: "delete", path: "src/modify.ts", originalFingerprint: fingerprint(original) },
        ],
      }),
    ).rejects.toThrow("Duplicate");
    await expect(
      changeSets.prepare({
        summary: "Unsafe",
        operations: [
          { kind: "create", path: "../escape.ts", content: "unsafe\n" },
        ],
      }),
    ).rejects.toThrow("Workspace");

    const attempts = await Promise.allSettled([
      changeSets.prepare({
        summary: "Valid",
        operations: [
          {
            kind: "modify",
            path: "src/modify.ts",
            originalFingerprint: fingerprint(original),
            content: "export const value = 2;\n",
          },
        ],
      }),
      changeSets.prepare({
        summary: "Another",
        operations: [
          { kind: "create", path: "src/another.ts", content: "another\n" },
        ],
      }),
    ]);
    expect(attempts.map((attempt) => attempt.status).sort()).toEqual([
      "fulfilled",
      "rejected",
    ]);
    const pending = changeSets.getPending()!;

    await changeSets.reject(pending.id, "Please use a clearer name.");
    expect(changeSets.getPending()).toBeNull();
    expect(await readFile(join(workspace, "src", "modify.ts"), "utf8")).toBe(
      original,
    );
  });
});
