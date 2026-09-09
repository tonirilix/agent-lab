import { mkdtemp, realpath, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { createApp } from "./app.js";
import { resolveAgentConfiguration } from "./config.js";

const temporaryWorkspaces: string[] = [];

afterEach(async () => {
  await Promise.all(
    temporaryWorkspaces.splice(0).map((workspace) =>
      rm(workspace, { recursive: true, force: true }),
    ),
  );
});

describe("Agent Lab startup", () => {
  it("publishes safe configuration for a valid Workspace", async () => {
    const workspace = await mkdtemp(join(tmpdir(), "agent-lab-"));
    temporaryWorkspaces.push(workspace);

    const config = await resolveAgentConfiguration({
      workspace,
      openAiApiKey: "secret-key",
      openAiModel: "test-model",
    });
    const response = await createApp(config).request("/api/config");

    const body = await response.text();

    expect(response.status).toBe(200);
    expect(JSON.parse(body)).toEqual({
      status: "ready",
      workspace: await realpath(workspace),
      provider: "OpenAI",
      model: "test-model",
      git: null,
    });
    expect(body).not.toContain("secret-key");
  });

  it("publishes an actionable error for an invalid Workspace", async () => {
    const requestedWorkspace = join(
      tmpdir(),
      "missing-agent-lab-workspace",
    );
    const config = await resolveAgentConfiguration({
      workspace: requestedWorkspace,
      openAiApiKey: "secret-key",
      openAiModel: "test-model",
    });
    const response = await createApp(config).request("/api/config");

    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({
      status: "invalid-workspace",
      requestedWorkspace,
      provider: "OpenAI",
      model: "test-model",
      git: null,
      error: `Workspace does not exist or is not a directory: ${requestedWorkspace}`,
    });
  });
});
