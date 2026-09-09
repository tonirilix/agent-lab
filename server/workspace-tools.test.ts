import {
  mkdir,
  mkdtemp,
  rm,
  symlink,
  writeFile,
} from "node:fs/promises";
import { execFile } from "node:child_process";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { promisify } from "node:util";
import { afterEach, describe, expect, it } from "vitest";
import {
  MAX_FILE_BYTES,
  MAX_SEARCH_MATCHES,
  WorkspaceAccessError,
  createWorkspaceTools,
} from "./workspace-tools.js";
import { resolveWorkspaceRoot } from "./workspace-root.js";

const temporaryDirectories: string[] = [];
const execFileAsync = promisify(execFile);

async function createWorkspace() {
  const workspace = await mkdtemp(join(tmpdir(), "agent-lab-workspace-"));
  temporaryDirectories.push(workspace);
  await mkdir(join(workspace, "src"));
  return workspace;
}

afterEach(async () => {
  await Promise.all(
    temporaryDirectories.splice(0).map((directory) =>
      rm(directory, { recursive: true, force: true }),
    ),
  );
});

describe("Workspace inspection Tools", () => {
  it("lists and reads eligible UTF-8 source while filtering unsafe content", async () => {
    const workspace = await createWorkspace();
    await Promise.all([
      writeFile(join(workspace, "src", "tasks.ts"), "export const tasks = [];\n"),
      writeFile(join(workspace, ".env"), "OPENAI_API_KEY=secret\n"),
      writeFile(join(workspace, ".env.example"), "OPENAI_API_KEY=\n"),
      writeFile(join(workspace, "private.pem"), "-----BEGIN PRIVATE KEY-----\n"),
      writeFile(join(workspace, "binary.dat"), Buffer.from([0, 159, 146, 150])),
      writeFile(join(workspace, "ignored.txt"), "ignore me\n"),
      writeFile(join(workspace, ".gitignore"), "ignored.txt\n"),
    ]);
    const tools = await createWorkspaceTools(await resolveWorkspaceRoot(workspace));

    const listing = await tools.listFiles({});
    const source = await tools.readFile({ path: "src/tasks.ts" });
    const template = await tools.readFile({ path: ".env.example" });

    expect(listing.files).toContain("src/tasks.ts");
    expect(listing.files).toContain(".env.example");
    expect(listing.files).not.toEqual(
      expect.arrayContaining([
        ".env",
        "private.pem",
        "binary.dat",
        "ignored.txt",
      ]),
    );
    expect(source.content).toBe("export const tasks = [];\n");
    expect(template.content).toBe("OPENAI_API_KEY=\n");
  });

  it("rejects traversal, symlink escape, secrets, invalid text, and oversized files", async () => {
    const workspace = await createWorkspace();
    const outside = await mkdtemp(join(tmpdir(), "agent-lab-outside-"));
    temporaryDirectories.push(outside);
    await writeFile(join(outside, "outside.ts"), "export const outside = true;\n");
    await symlink(join(outside, "outside.ts"), join(workspace, "escape.ts"));
    await Promise.all([
      writeFile(join(workspace, ".env.local"), "TOKEN=secret\n"),
      writeFile(join(workspace, "invalid.txt"), Buffer.from([0xc3, 0x28])),
      writeFile(join(workspace, "large.txt"), "x".repeat(MAX_FILE_BYTES + 1)),
    ]);
    const tools = await createWorkspaceTools(await resolveWorkspaceRoot(workspace));

    for (const path of [
      "../outside.ts",
      "escape.ts",
      ".env.local",
      "invalid.txt",
      "large.txt",
    ]) {
      await expect(tools.readFile({ path })).rejects.toBeInstanceOf(
        WorkspaceAccessError,
      );
    }
  });

  it("bounds search results and reports truncation explicitly", async () => {
    const workspace = await createWorkspace();
    await writeFile(
      join(workspace, "src", "many.ts"),
      Array.from(
        { length: MAX_SEARCH_MATCHES + 25 },
        (_, index) => `export const match${index} = "needle";`,
      ).join("\n"),
    );
    const tools = await createWorkspaceTools(await resolveWorkspaceRoot(workspace));

    const result = await tools.searchCode({ query: "needle" });

    expect(result.matches).toHaveLength(MAX_SEARCH_MATCHES);
    expect(result.truncated).toBe(true);
    expect(result.totalMatches).toBeGreaterThan(MAX_SEARCH_MATCHES);
  });

  it("honors nested and effective Git ignore rules", async () => {
    const workspace = await createWorkspace();
    await execFileAsync("git", ["init", "--quiet", workspace]);
    await Promise.all([
      writeFile(join(workspace, "src", ".gitignore"), "nested.txt\n"),
      writeFile(join(workspace, "src", "nested.txt"), "nested ignore\n"),
      writeFile(join(workspace, "git-excluded.txt"), "git exclude\n"),
      writeFile(
        join(workspace, ".git", "info", "exclude"),
        "git-excluded.txt\n",
      ),
    ]);
    const tools = await createWorkspaceTools(await resolveWorkspaceRoot(workspace));

    const listing = await tools.listFiles({});

    expect(listing.files).not.toEqual(
      expect.arrayContaining(["src/nested.txt", "git-excluded.txt"]),
    );
    await expect(
      tools.readFile({ path: "src/nested.txt" }),
    ).rejects.toThrow("Ignored file");
    await expect(
      tools.readFile({ path: "git-excluded.txt" }),
    ).rejects.toThrow("Ignored file");
  });
});
