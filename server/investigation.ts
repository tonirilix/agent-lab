import { randomUUID } from "node:crypto";
import { generateText, isStepCount, Output, type LanguageModel } from "ai";
import { z } from "zod";
import type {
  InvestigationRun,
  InvestigationWorker,
} from "../shared/investigation.js";
import type { PendingChangeSet } from "../shared/change-set-contracts.js";
import type { WorkspaceRoot } from "./workspace-root.js";
import { createWorkspaceTools } from "./workspace-tools.js";
import { createReadOnlyAgentTools } from "./read-only-agent-tools.js";
import { verifyWorkflowChangeSet } from "./workflow-verification.js";
import { createToolTrace, type ToolTrace } from "./tool-trace.js";
import {
  AgentLifecycleBusyError,
  type AgentLifecycle,
} from "./agent-lifecycle.js";

const BRIEFS = [
  {
    id: "code" as const,
    title: "Code path",
    brief: "Find the current data model and implementation paths relevant to the request. Identify concrete files, functions, and likely change points. Do not edit files.",
  },
  {
    id: "tests" as const,
    title: "Tests and risks",
    brief: "Find existing tests and behavior relevant to the request. Identify missing cases, compatibility concerns, and a way to verify the change. Do not edit files.",
  },
];

export type InvestigationWorkerRunner = (
  worker: Pick<InvestigationWorker, "id" | "title" | "brief">,
  objective: string,
  trace: ToolTrace,
) => Promise<string>;

export type InvestigationStages = {
  assign?: (objective: string) => Promise<{ code: string; tests: string }>;
  plan: (objective: string, findings: string[]) => Promise<string>;
  implement: (input: {
    objective: string;
    plan: string;
    findings: string[];
  }, trace: ToolTrace) => Promise<PendingChangeSet>;
  verify?: (changeSet: PendingChangeSet) => Promise<string>;
  review: (input: {
    objective: string;
    plan: string;
    findings: string[];
    changeSet: PendingChangeSet;
    verification: string;
  }, trace: ToolTrace) => Promise<string>;
};

export class ActiveInvestigationError extends Error {
  constructor(message = "An investigation is already running.") {
    super(message);
    this.name = "ActiveInvestigationError";
  }
}

export class InvestigationRetryError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "InvestigationRetryError";
  }
}

export function createModelInvestigationWorker(
  model: LanguageModel,
  workspace: WorkspaceRoot,
): InvestigationWorkerRunner {
  let workspaceTools: ReturnType<typeof createWorkspaceTools> | undefined;
  return async (worker, objective, trace) => {
    workspaceTools ??= createWorkspaceTools(workspace);
    const tools = createReadOnlyAgentTools(await workspaceTools);
    const result = await generateText({
      model,
      instructions: [
        "You are a read-only investigation worker in Agent Lab.",
        "Use Workspace tools to inspect evidence before reporting.",
        "You cannot write files, propose a Change Set, or run commands.",
        "Report concise findings with relative file paths and clearly mark uncertainty.",
        worker.brief,
      ].join(" "),
      prompt: `User objective: ${objective}`,
      tools,
      onToolExecutionStart: trace.onStart,
      onToolExecutionEnd: trace.onEnd,
      stopWhen: isStepCount(6),
      maxOutputTokens: 1_000,
      abortSignal: AbortSignal.timeout(90_000),
    });
    return result.text.trim() || "The worker finished without a written report.";
  };
}

export function createModelInvestigationStages(
  model: LanguageModel,
  workspace: WorkspaceRoot,
  implement: InvestigationStages["implement"],
): InvestigationStages {
  let workspaceTools: ReturnType<typeof createWorkspaceTools> | undefined;
  return {
    async assign(objective) {
      const result = await generateText({
        model,
        instructions:
          "You coordinate a coding task. Write two distinct, concrete read-only investigation briefs. The code worker should locate implementation paths. The tests worker should locate tests, expected behavior, and risks. Neither worker may edit files. Do not invent file paths you have not inspected.",
        prompt: `Objective: ${objective}`,
        output: Output.object({
          schema: z.object({
            code: z.string().trim().min(20).max(700),
            tests: z.string().trim().min(20).max(700),
          }),
        }),
        maxOutputTokens: 500,
        abortSignal: AbortSignal.timeout(90_000),
      });
      return result.output;
    },
    async plan(objective, findings) {
      const result = await generateText({
        model,
        instructions:
          "You coordinate a coding workflow. Use the two investigation reports to write a short implementation plan with concrete files, dependencies, and verification steps. If evidence is missing, say so. Do not claim work is done.",
        prompt: `Objective: ${objective}\n\nCode findings: ${findings[0]}\n\nTest findings: ${findings[1]}`,
        maxOutputTokens: 1_000,
        abortSignal: AbortSignal.timeout(90_000),
      });
      if (!result.text.trim()) throw new Error("Coordinator returned no plan.");
      return result.text.trim();
    },
    implement,
    verify: (changeSet) => verifyWorkflowChangeSet(workspace, changeSet),
    async review({ objective, plan, findings, changeSet, verification }, trace) {
      workspaceTools ??= createWorkspaceTools(workspace);
      const proposedDiff = changeSet.files
        .map((file) => `${file.path}\n${file.diff}`)
        .join("\n\n");
      if (proposedDiff.length > 60_000) {
        throw new Error(
          "Change Set is too large for automatic review. Review the diff manually.",
        );
      }
      const result = await generateText({
        model,
        instructions: [
          "You are an independent read-only reviewer.",
          "Inspect the proposed Change Set against the objective, plan, and current Workspace files.",
          "Look for logic errors, missed edge cases, inadequate tests, and unrelated changes.",
          "State specific concerns with file paths. Say whether the proposal appears ready for human review.",
          "You cannot approve or apply changes. Report verification accurately; do not claim tests ran unless the verification report says they did.",
        ].join(" "),
        prompt: [
          `Objective: ${objective}`,
          `Plan: ${plan}`,
          ...findings.map((finding, index) => `Investigation ${index + 1}: ${finding}`),
          `Proposed Change Set summary: ${changeSet.summary}`,
          `Verification: ${verification}`,
          `Proposed diff:\n${proposedDiff}`,
        ].join("\n\n"),
        tools: createReadOnlyAgentTools(await workspaceTools),
        onToolExecutionStart: trace.onStart,
        onToolExecutionEnd: trace.onEnd,
        stopWhen: isStepCount(6),
        maxOutputTokens: 1_200,
        abortSignal: AbortSignal.timeout(90_000),
      });
      if (!result.text.trim()) throw new Error("Reviewer returned no assessment.");
      return result.text.trim();
    },
  };
}

export function createInvestigationService(
  runWorker: InvestigationWorkerRunner,
  stages?: InvestigationStages,
  lifecycle?: Pick<
    AgentLifecycle,
    "beginWorkflow" | "registerWorkflowChangeSet" | "markWorkflowReady"
  >,
) {
  const runs = new Map<string, InvestigationRun>();
  let activeId: string | null = null;

  function snapshot(run: InvestigationRun): InvestigationRun {
    return structuredClone(run);
  }

  async function executeStage(
    stage: NonNullable<InvestigationRun["stages"]>[keyof NonNullable<InvestigationRun["stages"]>],
    task: () => Promise<string>,
  ) {
    if (stage.status === "completed") return;
    stage.status = "running";
    stage.error = undefined;
    try {
      stage.report = await task();
      stage.status = "completed";
    } catch (error) {
      stage.status = "failed";
      stage.error = error instanceof Error ? error.message : String(error);
      throw error;
    }
  }

  async function advance(run: InvestigationRun, releaseWorkflow?: () => void) {
    try {
      if (run.stages) {
        await executeStage(run.stages.assignment, async () => {
          if (!stages?.assign) return "Used the default investigation briefs.";
          const briefs = await stages.assign(run.objective);
          run.workers[0].brief = briefs.code;
          run.workers[1].brief = briefs.tests;
          return "Assigned separate code and test investigations.";
        });
      }

      await Promise.all(run.workers.filter((worker) => worker.status !== "completed").map(async (worker) => {
        worker.status = "running";
        worker.error = undefined;
        worker.toolTrace = [];
        worker.startedAt = new Date().toISOString();
        try {
          worker.report = await runWorker(
            worker,
            run.objective,
            createToolTrace(worker.toolTrace),
          );
          worker.status = "completed";
        } catch (error) {
          worker.error = error instanceof Error ? error.message : String(error);
          worker.status = "failed";
        } finally {
          worker.finishedAt = new Date().toISOString();
        }
      }));
      if (run.workers.some((worker) => worker.status === "failed")) {
        run.status = "failed";
        return;
      }
      if (!stages || !run.stages) {
        run.status = "completed";
        return;
      }

      const findings = run.workers.map((worker) => {
        if (worker.report === undefined) {
          throw new Error(`${worker.title} finished without a report.`);
        }
        return worker.report;
      });
      const { coordinator, implementer, verification, reviewer } = run.stages;
      await executeStage(coordinator, () => stages.plan(run.objective, findings));
      const plan = coordinator.report;
      if (plan === undefined) throw new Error("Coordinator finished without a plan.");
      await executeStage(implementer, async () => {
        implementer.toolTrace = [];
        run.changeSet = await stages.implement({
          objective: run.objective,
          plan,
          findings,
        }, createToolTrace(implementer.toolTrace));
        lifecycle?.registerWorkflowChangeSet(run.changeSet.id, (decision) => {
          run.status = decision === "approved" ? "completed" : "rejected";
          run.finishedAt = new Date().toISOString();
        });
        return `Prepared Change Set ${run.changeSet.id}.`;
      });
      const changeSet = run.changeSet;
      if (changeSet === undefined) throw new Error("Implementer finished without a Change Set.");
      await executeStage(verification, () =>
        stages.verify
          ? stages.verify(changeSet)
          : Promise.resolve("Automated verification is not configured."),
      );
      const verificationReport = verification.report;
      if (verificationReport === undefined) {
        throw new Error("Verification finished without a report.");
      }
      await executeStage(reviewer, () => {
        reviewer.toolTrace = [];
        return stages.review({
          objective: run.objective,
          plan,
          findings,
          changeSet,
          verification: verificationReport,
        }, createToolTrace(reviewer.toolTrace));
      });
      run.status = "awaiting_approval";
      lifecycle?.markWorkflowReady(changeSet.id);
    } catch {
      run.status = run.changeSet ? "needs_attention" : "failed";
    } finally {
      run.automationFinishedAt = new Date().toISOString();
      if (run.status === "failed" || run.status === "completed") {
        run.finishedAt = run.automationFinishedAt;
      }
      activeId = null;
      releaseWorkflow?.();
    }
  }

  function launch(run: InvestigationRun) {
    let releaseWorkflow: (() => void) | undefined;
    try {
      releaseWorkflow = lifecycle?.beginWorkflow();
    } catch (error) {
      if (error instanceof AgentLifecycleBusyError) {
        throw new ActiveInvestigationError(error.message);
      }
      throw error;
    }
    run.status = "running";
    run.automationFinishedAt = undefined;
    run.finishedAt = undefined;
    activeId = run.id;
    void advance(run, releaseWorkflow);
    return snapshot(run);
  }

  return {
    start(objective: string) {
      if (activeId) throw new ActiveInvestigationError();
      if (
        [...runs.values()].some(
          (run) =>
            run.changeSet &&
            (run.status === "awaiting_approval" || run.status === "needs_attention"),
        )
      ) {
        throw new ActiveInvestigationError(
          "Decide the pending Change Set before starting another workflow.",
        );
      }
      const now = new Date().toISOString();
      const run: InvestigationRun = {
        id: randomUUID(),
        objective,
        status: "running",
        startedAt: now,
        workers: BRIEFS.map((brief) => ({
          ...brief,
          status: "queued",
          toolTrace: [],
        })),
        ...(stages
          ? {
              stages: {
                assignment: { status: "queued" as const },
                coordinator: { status: "queued" as const },
                implementer: { status: "queued" as const },
                verification: { status: "queued" as const },
                reviewer: { status: "queued" as const },
              },
            }
          : {}),
      };
      runs.set(run.id, run);
      try {
        const started = launch(run);
        while (runs.size > 10) {
          const oldest = runs.keys().next().value;
          if (oldest) runs.delete(oldest);
        }
        return started;
      } catch (error) {
        runs.delete(run.id);
        throw error;
      }
    },

    retry(id: string) {
      const run = runs.get(id);
      if (!run) throw new InvestigationRetryError("Investigation not found.");
      if (activeId) throw new ActiveInvestigationError();
      if (run.status !== "failed" && run.status !== "needs_attention") {
        throw new InvestigationRetryError("Only a failed workflow can be retried.");
      }
      const failed = run.workers.some((worker) => worker.status === "failed") ||
        Object.values(run.stages ?? {}).some((stage) => stage.status === "failed");
      if (!failed) throw new InvestigationRetryError("No failed step to retry.");
      return launch(run);
    },

    get(id: string) {
      const run = runs.get(id);
      return run ? snapshot(run) : null;
    },
  };
}
