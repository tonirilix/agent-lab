import { mkdir, mkdtemp, realpath, rm, writeFile } from "node:fs/promises";
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
      agent: {
        instructions: expect.arrayContaining([
          expect.stringContaining("read-only Workspace Tools"),
          expect.stringContaining("Approval"),
        ]),
        turnInstructions: expect.arrayContaining([
          expect.stringContaining("filesystem writes"),
          expect.stringContaining("Proposal Request"),
          expect.stringContaining("verified application result"),
        ]),
        tools: [
          "listFiles",
          "readFile",
          "searchCode",
          "proposeChangeSet (Proposal Request only)",
        ],
        safetyLimits: {
          maxSteps: 12,
          maxFileBytes: 262_144,
          maxSearchMatches: 200,
          maxChangeOperations: 20,
          maxChangeSetBytes: 1_048_576,
          contextWarningCharacters: 100_000,
        },
        telemetry: false,
      },
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

  it("rejects agent and filesystem requests outside the expected browser origin", async () => {
    const workspace = await mkdtemp(join(tmpdir(), "agent-lab-origin-"));
    temporaryWorkspaces.push(workspace);
    const config = await resolveAgentConfiguration({ workspace });
    const app = createApp(config, {
      allowedOrigins: [
        "http://127.0.0.1:8787",
        "http://localhost:8787",
      ],
    });
    const request = (origin?: string) =>
      app.request("/api/chat", {
        method: "POST",
        headers: {
          "content-type": "application/json",
          ...(origin ? { origin } : {}),
        },
        body: JSON.stringify({ messages: [] }),
      });

    expect((await request("https://hostile.example")).status).toBe(403);
    expect((await request()).status).toBe(403);
    expect(
      (
        await app.request("/api/change-sets/example/approve", {
          method: "POST",
          headers: { origin: "https://hostile.example" },
        })
      ).status,
    ).toBe(403);
    expect((await request("http://127.0.0.1:8787")).status).toBe(503);
    expect((await request("http://localhost:8787")).status).toBe(503);
  });

  it("serves the production client and its assets from the local app", async () => {
    const workspace = await mkdtemp(join(tmpdir(), "agent-lab-static-"));
    const clientRoot = join(workspace, "dist");
    temporaryWorkspaces.push(workspace);
    await mkdir(join(clientRoot, "assets"), { recursive: true });
    await writeFile(join(clientRoot, "index.html"), "<main>Agent Lab</main>");
    await writeFile(join(clientRoot, "assets", "app.js"), "export {};");
    const config = await resolveAgentConfiguration({ workspace });
    const app = createApp(config, { clientRoot });

    const page = await app.request("/");
    const asset = await app.request("/assets/app.js");

    expect(page.status).toBe(200);
    expect(await page.text()).toContain("Agent Lab");
    expect(asset.status).toBe(200);
    expect(await asset.text()).toBe("export {};");
  });
});
