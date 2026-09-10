import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { describeEnvironmentFile, loadEnvironmentFile } from "./env.js";

const temporaryDirectories: string[] = [];

async function temporaryDirectory(): Promise<string> {
  const directory = await mkdtemp(join(tmpdir(), "agent-lab-env-"));
  temporaryDirectories.push(directory);
  return directory;
}

afterEach(async () => {
  await Promise.all(
    temporaryDirectories.splice(0).map((directory) =>
      rm(directory, { recursive: true, force: true }),
    ),
  );
});

describe("environment file loading", () => {
  it("loads variables from the file into the target environment", async () => {
    const directory = await temporaryDirectory();
    const path = join(directory, ".env");
    await writeFile(
      path,
      [
        "# Comment lines are ignored",
        "OPENAI_API_KEY=sk-test-from-file",
        'OPENAI_MODEL="quoted-model"',
        "",
        "AGENT_LAB_PORT=9999",
      ].join("\n"),
    );
    const env: NodeJS.ProcessEnv = {};

    const result = loadEnvironmentFile({ path, env });

    expect(result).toEqual({
      path,
      found: true,
      loaded: ["AGENT_LAB_PORT", "OPENAI_API_KEY", "OPENAI_MODEL"],
      kept: [],
    });
    expect(env).toEqual({
      OPENAI_API_KEY: "sk-test-from-file",
      OPENAI_MODEL: "quoted-model",
      AGENT_LAB_PORT: "9999",
    });
  });

  it("never overrides a variable that is already set", async () => {
    const directory = await temporaryDirectory();
    const path = join(directory, ".env");
    await writeFile(path, "OPENAI_API_KEY=sk-from-file\nOPENAI_MODEL=file-model\n");
    const env: NodeJS.ProcessEnv = { OPENAI_API_KEY: "sk-from-shell" };

    const result = loadEnvironmentFile({ path, env });

    expect(env.OPENAI_API_KEY).toBe("sk-from-shell");
    expect(env.OPENAI_MODEL).toBe("file-model");
    expect(result.loaded).toEqual(["OPENAI_MODEL"]);
    expect(result.kept).toEqual(["OPENAI_API_KEY"]);
  });

  it("treats a missing file as an empty file", async () => {
    const directory = await temporaryDirectory();
    const path = join(directory, ".env");
    const env: NodeJS.ProcessEnv = { OPENAI_MODEL: "unchanged" };

    const result = loadEnvironmentFile({ path, env });

    expect(result).toEqual({ path, found: false, loaded: [], kept: [] });
    expect(env).toEqual({ OPENAI_MODEL: "unchanged" });
  });

  it("describes the result with variable names only", async () => {
    const directory = await temporaryDirectory();
    const path = join(directory, ".env");
    await writeFile(path, "OPENAI_API_KEY=sk-secret-value\nOPENAI_MODEL=m\n");
    const env: NodeJS.ProcessEnv = { OPENAI_MODEL: "shell" };

    const description = describeEnvironmentFile(
      loadEnvironmentFile({ path, env }),
    );

    expect(description).toContain("Loaded 1 variable(s)");
    expect(description).toContain("OPENAI_API_KEY");
    expect(description).toContain("kept existing OPENAI_MODEL");
    expect(description).not.toContain("sk-secret-value");
    expect(
      describeEnvironmentFile(
        loadEnvironmentFile({ path: join(directory, "missing.env"), env }),
      ),
    ).toContain("No ");
  });
});
