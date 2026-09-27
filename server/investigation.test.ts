import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it, vi } from "vitest";
import { MockLanguageModelV4 } from "ai/test";
import type { InvestigationRun } from "../shared/investigation.js";
import { createApp } from "./app.js";
import { resolveAgentConfiguration } from "./config.js";
import {
  createInvestigationService,
  createModelInvestigationWorker,
  type InvestigationWorkerRunner,
} from "./investigation.js";
import { resolveWorkspaceRoot } from "./workspace-root.js";

const temporaryWorkspaces: string[] = [];

afterEach(async () => {
  await Promise.all(
    temporaryWorkspaces.splice(0).map((path) =>
      rm(path, { recursive: true, force: true }),
    ),
  );
});

describe("parallel investigation", () => {
  it("offers the model only read-only Workspace tools", async () => {
    const workspace = await mkdtemp(join(tmpdir(), "agent-lab-investigation-"));
    temporaryWorkspaces.push(workspace);
    const model = new MockLanguageModelV4({
      doGenerate: async (options) => {
        expect(options.tools?.map((item) => item.name)).toEqual([
          "listFiles",
          "readFile",
          "searchCode",
        ]);
        return {
          content: [{ type: "text", text: "Read-only findings" }],
          finishReason: { unified: "stop", raw: undefined },
          warnings: [],
          usage: {
            inputTokens: {
              total: 5,
              noCache: 5,
              cacheRead: undefined,
              cacheWrite: undefined,
            },
            outputTokens: { total: 4, text: 4, reasoning: undefined },
          },
        };
      },
    });
    const worker = createModelInvestigationWorker(
      model,
      await resolveWorkspaceRoot(workspace),
    );
    expect(
      await worker(
        { id: "code", title: "Code path", brief: "Inspect code" },
        "Add priority",
        () => {},
      ),
    ).toBe("Read-only findings");
  });

  it("starts both workers before either completes and keeps their reports separate", async () => {
    const started: string[] = [];
    const release = new Map<string, (value: string) => void>();
    const runWorker: InvestigationWorkerRunner = (worker, _objective, onToolUse) => {
      started.push(worker.id);
      onToolUse("readFile");
      return new Promise<string>((resolve) => release.set(worker.id, resolve));
    };
    const service = createInvestigationService(runWorker);
    const run = service.start("Add task priority");

    expect(started).toEqual(["code", "tests"]);
    expect(service.get(run.id)?.workers.map((worker) => worker.status)).toEqual([
      "running",
      "running",
    ]);
    expect(() => service.start("Another objective")).toThrow(
      "An investigation is already running.",
    );

    release.get("tests")?.("Tests report");
    await vi.waitFor(() =>
      expect(service.get(run.id)?.workers[1].status).toBe("completed"),
    );
    expect(service.get(run.id)?.status).toBe("running");
    release.get("code")?.("Code report");
    await vi.waitFor(() =>
      expect(service.get(run.id)?.status).toBe("completed"),
    );
    expect(service.get(run.id)?.workers.map((worker) => worker.report)).toEqual([
      "Code report",
      "Tests report",
    ]);
    expect(service.get(run.id)?.workers[0].toolsUsed).toEqual(["readFile"]);
    expect(service.start("Next objective").status).toBe("running");
  });

  it("reports a worker failure without hiding the other worker's result", async () => {
    const service = createInvestigationService(async (worker) => {
      if (worker.id === "code") throw new Error("Model request failed");
      return "Independent test findings";
    });
    const run = service.start("Inspect a feature");
    await vi.waitFor(() => expect(service.get(run.id)?.status).toBe("failed"));
    expect(service.get(run.id)?.workers).toMatchObject([
      { status: "failed", error: "Model request failed" },
      { status: "completed", report: "Independent test findings" },
    ]);
  });

  it("validates input and exposes worker progress through HTTP", async () => {
    const workspace = await mkdtemp(join(tmpdir(), "agent-lab-investigation-"));
    temporaryWorkspaces.push(workspace);
    const config = await resolveAgentConfiguration({
      workspace,
      openAiApiKey: "test-key",
    });
    const app = createApp(config, {
      investigationWorker: async (worker) => `${worker.title} findings`,
    });
    const bad = await app.request("/api/investigations", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ objective: " " }),
    });
    expect(bad.status).toBe(400);

    const response = await app.request("/api/investigations", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ objective: "Trace the task model" }),
    });
    expect(response.status).toBe(201);
    const run = (await response.json()) as InvestigationRun;
    await vi.waitFor(async () => {
      const progress = await app.request(`/api/investigations/${run.id}`);
      expect(((await progress.json()) as InvestigationRun).status).toBe("completed");
    });
    const final = await app.request(`/api/investigations/${run.id}`);
    expect(((await final.json()) as InvestigationRun).workers).toMatchObject([
      { id: "code", report: "Code path findings" },
      { id: "tests", report: "Tests and risks findings" },
    ]);
  });
});
