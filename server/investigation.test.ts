import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it, vi } from "vitest";
import { MockLanguageModelV4 } from "ai/test";
import type { InvestigationRun } from "../shared/investigation.js";
import type { PendingChangeSet } from "../shared/change-set-contracts.js";
import { createApp } from "./app.js";
import { resolveAgentConfiguration } from "./config.js";
import {
  createInvestigationService,
  createModelInvestigationStages,
  createModelInvestigationWorker,
  type InvestigationWorkerRunner,
} from "./investigation.js";
import { resolveWorkspaceRoot } from "./workspace-root.js";

const temporaryWorkspaces: string[] = [];
const preparedChangeSet: PendingChangeSet = {
  id: "prepared-1",
  summary: "Add task priority",
  status: "pending",
  operations: [{ kind: "create", path: "src/priority.ts", content: "export {};\n" }],
  files: [{ kind: "create", path: "src/priority.ts", diff: "+export {};" }],
  warnings: [],
};

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

  it("uses structured coordinator output to assign two distinct briefs", async () => {
    const workspace = await mkdtemp(join(tmpdir(), "agent-lab-investigation-"));
    temporaryWorkspaces.push(workspace);
    const model = new MockLanguageModelV4({
      doGenerate: async () => ({
        content: [{
          type: "text",
          text: JSON.stringify({
            code: "Trace the task model and summary implementation.",
            tests: "Find current tests and priority edge cases.",
          }),
        }],
        finishReason: { unified: "stop", raw: undefined },
        warnings: [],
        usage: {
          inputTokens: { total: 5, noCache: 5, cacheRead: undefined, cacheWrite: undefined },
          outputTokens: { total: 4, text: 4, reasoning: undefined },
        },
      }),
    });
    const stages = createModelInvestigationStages(
      model,
      await resolveWorkspaceRoot(workspace),
      async () => preparedChangeSet,
    );
    expect(await stages.assign!("Add task priority")).toEqual({
      code: "Trace the task model and summary implementation.",
      tests: "Find current tests and priority edge cases.",
    });
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

  it("waits for both findings, then plans, prepares, reviews, and waits for a decision", async () => {
    const order: string[] = [];
    const service = createInvestigationService(
      async (worker) => {
        order.push(worker.id);
        expect(worker.brief).toBe(`${worker.id} assignment`);
        return `${worker.id} findings`;
      },
      {
        assign: async () => {
          order.push("assignment");
          return { code: "code assignment", tests: "tests assignment" };
        },
        plan: async (_objective, findings) => {
          order.push("coordinator");
          expect(findings).toEqual(["code findings", "tests findings"]);
          return "Implementation plan";
        },
        implement: async ({ plan }) => {
          order.push("implementer");
          expect(plan).toBe("Implementation plan");
          return preparedChangeSet;
        },
        review: async ({ changeSet }) => {
          order.push("reviewer");
          expect(changeSet.id).toBe("prepared-1");
          return "Ready for human review";
        },
      },
    );
    const run = service.start("Add task priority");
    await vi.waitFor(() =>
      expect(service.get(run.id)?.status).toBe("awaiting_approval"),
    );
    expect(order).toEqual([
      "assignment",
      "code",
      "tests",
      "coordinator",
      "implementer",
      "reviewer",
    ]);
    expect(service.get(run.id)?.stages?.reviewer.report).toBe(
      "Ready for human review",
    );
    expect(() => service.start("Another feature")).toThrow(
      "Decide the pending Change Set before starting another workflow.",
    );
    service.markChangeSetDecision("prepared-1", "rejected");
    expect(service.get(run.id)?.status).toBe("rejected");
    expect(service.start("Another feature").status).toBe("running");
  });

  it("keeps a prepared proposal available when review fails and allows retry after rejection", async () => {
    const service = createInvestigationService(
      async (worker) => `${worker.id} findings`,
      {
        plan: async () => "Plan",
        implement: async () => preparedChangeSet,
        review: async () => { throw new Error("Reviewer timed out"); },
      },
    );
    const run = service.start("Add priority");
    await vi.waitFor(() =>
      expect(service.get(run.id)?.status).toBe("needs_attention"),
    );
    expect(service.get(run.id)?.changeSet?.id).toBe(preparedChangeSet.id);
    expect(service.get(run.id)?.stages?.reviewer.error).toBe("Reviewer timed out");
    expect(() => service.start("Retry")).toThrow(
      "Decide the pending Change Set before starting another workflow.",
    );
    service.markChangeSetDecision(preparedChangeSet.id, "rejected");
    expect(service.start("Retry").status).toBe("running");
  });

  it("stops before spawning workers when task assignment fails", async () => {
    const worker = vi.fn(async () => "Unexpected findings");
    const service = createInvestigationService(worker, {
      assign: async () => { throw new Error("Assignment failed"); },
      plan: async () => "Unexpected plan",
      implement: async () => preparedChangeSet,
      review: async () => "Unexpected review",
    });
    const run = service.start("Add priority");
    await vi.waitFor(() => expect(service.get(run.id)?.status).toBe("failed"));
    expect(worker).not.toHaveBeenCalled();
    expect(service.get(run.id)?.stages?.assignment.error).toBe("Assignment failed");
    expect(service.get(run.id)?.workers.map((item) => item.status)).toEqual([
      "queued",
      "queued",
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
      investigationStages: {
        plan: async () => "Plan",
        implement: async () => preparedChangeSet,
        review: async () => "Review",
      },
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
      expect(((await progress.json()) as InvestigationRun).status).toBe("awaiting_approval");
    });
    const final = await app.request(`/api/investigations/${run.id}`);
    expect(((await final.json()) as InvestigationRun).workers).toMatchObject([
      { id: "code", report: "Code path findings" },
      { id: "tests", report: "Tests and risks findings" },
    ]);
  });
});
