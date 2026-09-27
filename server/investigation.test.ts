import { mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { afterEach, describe, expect, it, vi } from "vitest";
import { MockLanguageModelV4 } from "ai/test";
import type { InvestigationRun } from "../shared/investigation.js";
import type { PendingChangeSet } from "../shared/change-set-contracts.js";
import { createApp } from "./app.js";
import { createAgentLifecycle } from "./agent-lifecycle.js";
import { resolveAgentConfiguration } from "./config.js";
import {
  createInvestigationService,
  createModelInvestigationStages,
  createModelInvestigationWorker,
  type InvestigationWorkerRunner,
} from "./investigation.js";
import { resolveWorkspaceRoot } from "./workspace-root.js";
import { createToolTrace } from "./tool-trace.js";
import { verifyWorkflowChangeSet } from "./workflow-verification.js";

const temporaryWorkspaces: string[] = [];
const preparedChangeSet: PendingChangeSet = {
  id: "prepared-1",
  summary: "Add task priority",
  status: "pending",
  operations: [{ kind: "create", path: "src/priority.ts", content: "export {};\n" }],
  files: [{ kind: "create", path: "src/priority.ts", diff: "+export {};" }],
  warnings: [],
};

function createTestLifecycle() {
  return createAgentLifecycle({
    approve: async () => { throw new Error("Approval is not needed in this test."); },
    reject: async (id, feedback) => ({ id, status: "rejected" as const, feedback }),
  });
}

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
        createToolTrace([]),
      ),
    ).toBe("Read-only findings");
  });

  it("records a worker's executed Tool Call beside its report", async () => {
    const workspace = await mkdtemp(join(tmpdir(), "agent-lab-investigation-"));
    temporaryWorkspaces.push(workspace);
    let step = 0;
    const model = new MockLanguageModelV4({
      doGenerate: async () => {
        step += 1;
        return {
          content: step === 1
            ? [{
                type: "tool-call" as const,
                toolCallId: "list-files-1",
                toolName: "listFiles",
                input: JSON.stringify({}),
              }]
            : [{ type: "text" as const, text: "Found the Workspace files." }],
          finishReason: {
            unified: step === 1 ? "tool-calls" as const : "stop" as const,
            raw: undefined,
          },
          warnings: [],
          usage: {
            inputTokens: { total: 5, noCache: 5, cacheRead: undefined, cacheWrite: undefined },
            outputTokens: { total: 4, text: 4, reasoning: undefined },
          },
        };
      },
    });
    const service = createInvestigationService(
      createModelInvestigationWorker(model, await resolveWorkspaceRoot(workspace)),
    );
    const run = service.start("Inspect files");
    await vi.waitFor(() => expect(service.get(run.id)?.status).toBe("completed"));
    expect(service.get(run.id)?.workers[0]).toMatchObject({
      report: "Found the Workspace files.",
      toolTrace: [{
        name: "listFiles",
        status: "completed",
        input: {},
        output: { ok: true, result: { files: [] } },
      }],
    });
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
    if (stages.assign === undefined) throw new Error("Assignment stage is missing.");
    expect(await stages.assign("Add task priority")).toEqual({
      code: "Trace the task model and summary implementation.",
      tests: "Find current tests and priority edge cases.",
    });
  });

  it("starts both workers before either completes and keeps their reports separate", async () => {
    const started: string[] = [];
    const release = new Map<string, (value: string) => void>();
    const runWorker: InvestigationWorkerRunner = (worker, _objective, trace) => {
      started.push(worker.id);
      const toolCall = {
        toolCallId: `${worker.id}-read`,
        toolName: "readFile",
        input: { path: "src/tasks.ts" },
      };
      trace.onStart({ toolCall } as Parameters<typeof trace.onStart>[0]);
      trace.onEnd({
        toolCall,
        toolOutput: {
          type: "tool-result",
          output: { ok: true, result: { content: "task source" } },
        },
      } as Parameters<typeof trace.onEnd>[0]);
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
    expect(service.get(run.id)?.workers[0].toolTrace[0]).toMatchObject({
      name: "readFile",
      status: "completed",
      input: { path: "src/tasks.ts" },
      output: { ok: true, result: { content: "task source" } },
    });
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

  it("retries only the failed worker and preserves completed findings", async () => {
    const attempts = { code: 0, tests: 0 };
    const service = createInvestigationService(async (worker) => {
      attempts[worker.id]++;
      if (worker.id === "code" && attempts.code === 1) throw new Error("Temporary failure");
      return `${worker.id} findings`;
    });
    const run = service.start("Inspect priority");
    await vi.waitFor(() => expect(service.get(run.id)?.status).toBe("failed"));
    expect(service.retry(run.id).id).toBe(run.id);
    await vi.waitFor(() => expect(service.get(run.id)?.status).toBe("completed"));
    expect(attempts).toEqual({ code: 2, tests: 1 });
    expect(service.get(run.id)?.workers.map((worker) => worker.report)).toEqual([
      "code findings", "tests findings",
    ]);
  });

  it("waits for both findings, then plans, prepares, reviews, and waits for a decision", async () => {
    const order: string[] = [];
    const lifecycle = createTestLifecycle();
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
      lifecycle,
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
    await lifecycle.reject("prepared-1");
    expect(service.get(run.id)?.status).toBe("rejected");
    expect(service.start("Another feature").status).toBe("running");
  });

  it("keeps a prepared proposal available when review fails and allows retry after rejection", async () => {
    let reviews = 0;
    let implementations = 0;
    const lifecycle = createTestLifecycle();
    const service = createInvestigationService(
      async (worker) => `${worker.id} findings`,
      {
        plan: async () => "Plan",
        implement: async () => { implementations++; return preparedChangeSet; },
        review: async () => {
          reviews++;
          if (reviews === 1) throw new Error("Reviewer timed out");
          return "Ready";
        },
      },
      lifecycle,
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
    service.retry(run.id);
    await vi.waitFor(() => expect(service.get(run.id)?.status).toBe("awaiting_approval"));
    expect({ reviews, implementations }).toEqual({ reviews: 2, implementations: 1 });
    await lifecycle.reject(preparedChangeSet.id);
    expect(service.start("Retry").status).toBe("running");
  });

  it("stops on failed verification and resumes it without preparing another proposal", async () => {
    let checks = 0;
    let implementations = 0;
    const review = vi.fn(async () => "Reviewed");
    const service = createInvestigationService(async (worker) => `${worker.id} findings`, {
      plan: async () => "Plan",
      implement: async () => { implementations++; return preparedChangeSet; },
      verify: async () => {
        checks++;
        if (checks === 1) throw new Error("Tests failed");
        return "Tests passed";
      },
      review,
    });
    const run = service.start("Add priority");
    await vi.waitFor(() => expect(service.get(run.id)?.status).toBe("needs_attention"));
    expect(service.get(run.id)?.stages?.verification.error).toBe("Tests failed");
    expect(review).not.toHaveBeenCalled();
    service.retry(run.id);
    await vi.waitFor(() => expect(service.get(run.id)?.status).toBe("awaiting_approval"));
    expect({ checks, implementations }).toEqual({ checks: 2, implementations: 1 });
    expect(review).toHaveBeenCalledWith(
      expect.objectContaining({ verification: "Tests passed" }),
      expect.objectContaining({ onStart: expect.any(Function), onEnd: expect.any(Function) }),
    );
  });

  it("runs proposed example tests in a disposable copy", async () => {
    const example = join(dirname(fileURLToPath(import.meta.url)), "../examples/task-list");
    const workspace = await resolveWorkspaceRoot(example);
    const original = await readFile(join(example, "package.json"), "utf8");
    const passing = await verifyWorkflowChangeSet(workspace, preparedChangeSet);
    expect(passing).toContain("Passed the example test suite");
    expect(passing).not.toMatch(/\u001b\[[0-?]*[ -/]*[@-~]/);
    const failing: PendingChangeSet = {
      ...preparedChangeSet,
      operations: [{ kind: "create", path: "tests/failure.test.ts", content: 'import { it, expect } from "vitest"; it("fails", () => expect(1).toBe(2));\n' }],
    };
    const failingReport = await verifyWorkflowChangeSet(workspace, failing).catch((error: unknown) =>
      error instanceof Error ? error.message : String(error),
    );
    expect(failingReport).toContain("failed the example test suite");
    expect(failingReport).not.toMatch(/\u001b\[[0-?]*[ -/]*[@-~]/);
    expect(await readFile(join(example, "package.json"), "utf8")).toBe(original);
    await expect(readFile(join(example, "tests/failure.test.ts"))).rejects.toMatchObject({ code: "ENOENT" });
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
      allowedOrigins: ["http://127.0.0.1:5173"],
      investigationWorker: async (worker) => `${worker.title} findings`,
      investigationStages: {
        plan: async () => "Plan",
        implement: async () => preparedChangeSet,
        review: async () => "Review",
      },
    });
    const bad = await app.request("/api/investigations", {
      method: "POST",
      headers: { "content-type": "application/json", origin: "http://127.0.0.1:5173" },
      body: JSON.stringify({ objective: " " }),
    });
    expect(bad.status).toBe(400);

    const response = await app.request("/api/investigations", {
      method: "POST",
      headers: { "content-type": "application/json", origin: "http://127.0.0.1:5173" },
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

  it("pauses Chat while Workflow automation is active", async () => {
    const workspace = await mkdtemp(join(tmpdir(), "agent-lab-investigation-"));
    temporaryWorkspaces.push(workspace);
    const config = await resolveAgentConfiguration({ workspace, openAiApiKey: "test-key" });
    const releaseWorkers: Array<(report: string) => void> = [];
    const app = createApp(config, {
      investigationWorker: () => new Promise((resolve) => releaseWorkers.push(resolve)),
      investigationStages: {
        plan: async () => "Plan",
        implement: async () => preparedChangeSet,
        review: async () => "Reviewed",
      },
    });

    const response = await app.request("/api/investigations", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ objective: "Add priority" }),
    });
    expect(response.status).toBe(201);
    await vi.waitFor(() => expect(releaseWorkers).toHaveLength(2));

    const chat = await app.request("/api/chat", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ messages: [] }),
    });
    expect(chat.status).toBe(409);
    expect(await chat.json()).toEqual({ error: "Another Agent Turn or workflow is active." });

    releaseWorkers.forEach((release) => release("Findings"));
    const run = (await response.json()) as InvestigationRun;
    await vi.waitFor(async () => {
      const progress = await app.request(`/api/investigations/${run.id}`);
      expect(((await progress.json()) as InvestigationRun).status).toBe("awaiting_approval");
    });
  });

  it("exposes targeted retry and blocks approval while verification has failed", async () => {
    const workspace = await mkdtemp(join(tmpdir(), "agent-lab-investigation-"));
    temporaryWorkspaces.push(workspace);
    const config = await resolveAgentConfiguration({ workspace, openAiApiKey: "test-key" });
    let checks = 0;
    const app = createApp(config, {
      investigationWorker: async (worker) => `${worker.id} findings`,
      investigationStages: {
        plan: async () => "Plan",
        implement: async () => preparedChangeSet,
        verify: async () => {
          checks++;
          if (checks === 1) throw new Error("Test failure");
          return "Tests passed";
        },
        review: async () => "Reviewed",
      },
    });
    const started = await app.request("/api/investigations", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ objective: "Add priority" }),
    });
    const run = (await started.json()) as InvestigationRun;
    await vi.waitFor(async () => {
      const response = await app.request(`/api/investigations/${run.id}`);
      expect(((await response.json()) as InvestigationRun).status).toBe("needs_attention");
    });
    expect((await app.request(`/api/change-sets/${preparedChangeSet.id}/approve`, { method: "POST" })).status).toBe(409);
    expect((await app.request("/api/investigations/missing/retry", { method: "POST" })).status).toBe(404);
    expect((await app.request(`/api/investigations/${run.id}/retry`, { method: "POST" })).status).toBe(200);
    await vi.waitFor(async () => {
      const response = await app.request(`/api/investigations/${run.id}`);
      expect(((await response.json()) as InvestigationRun).status).toBe("awaiting_approval");
    });
    expect(checks).toBe(2);
  });
});
