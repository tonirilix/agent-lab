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
  onToolUse: (name: string) => void,
) => Promise<string>;

export type InvestigationStages = {
  assign?: (objective: string) => Promise<{ code: string; tests: string }>;
  plan: (objective: string, findings: string[]) => Promise<string>;
  implement: (input: {
    objective: string;
    plan: string;
    findings: string[];
  }) => Promise<PendingChangeSet>;
  review: (input: {
    objective: string;
    plan: string;
    findings: string[];
    changeSet: PendingChangeSet;
  }) => Promise<string>;
};

export class ActiveInvestigationError extends Error {
  constructor(message = "An investigation is already running.") {
    super(message);
    this.name = "ActiveInvestigationError";
  }
}

export function createModelInvestigationWorker(
  model: LanguageModel,
  workspace: WorkspaceRoot,
): InvestigationWorkerRunner {
  let workspaceTools: ReturnType<typeof createWorkspaceTools> | undefined;
  return async (worker, objective, onToolUse) => {
    workspaceTools ??= createWorkspaceTools(workspace);
    const tools = createReadOnlyAgentTools(await workspaceTools, onToolUse);
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
    async review({ objective, plan, findings, changeSet }) {
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
          "You cannot approve or apply changes. Do not claim that tests ran.",
        ].join(" "),
        prompt: [
          `Objective: ${objective}`,
          `Plan: ${plan}`,
          ...findings.map((finding, index) => `Investigation ${index + 1}: ${finding}`),
          `Proposed Change Set summary: ${changeSet.summary}`,
          `Proposed diff:\n${proposedDiff}`,
        ].join("\n\n"),
        tools: createReadOnlyAgentTools(await workspaceTools),
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
) {
  const runs = new Map<string, InvestigationRun>();
  let activeId: string | null = null;

  function snapshot(run: InvestigationRun): InvestigationRun {
    return structuredClone(run);
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
          toolsUsed: [],
        })),
        ...(stages
          ? {
              stages: {
                assignment: { status: "queued" as const },
                coordinator: { status: "queued" as const },
                implementer: { status: "queued" as const },
                reviewer: { status: "queued" as const },
              },
            }
          : {}),
      };
      runs.set(run.id, run);
      activeId = run.id;
      while (runs.size > 10) {
        const oldest = runs.keys().next().value;
        if (oldest) runs.delete(oldest);
      }

      void (async () => {
        try {
          if (stages?.assign && run.stages) {
            const assignment = run.stages.assignment;
            assignment.status = "running";
            try {
              const briefs = await stages.assign(objective);
              run.workers[0].brief = briefs.code;
              run.workers[1].brief = briefs.tests;
              assignment.report = "Assigned separate code and test investigations.";
              assignment.status = "completed";
            } catch (error) {
              assignment.status = "failed";
              assignment.error = error instanceof Error ? error.message : String(error);
              throw error;
            }
          } else if (run.stages) {
            run.stages.assignment.status = "completed";
            run.stages.assignment.report = "Used the default investigation briefs.";
          }

          await Promise.all(
            run.workers.map(async (worker) => {
              worker.status = "running";
              worker.startedAt = new Date().toISOString();
              try {
                worker.report = await runWorker(worker, objective, (name) => {
                  worker.toolsUsed.push(name);
                });
                worker.status = "completed";
              } catch (error) {
                worker.error =
                  error instanceof Error ? error.message : "Investigation failed.";
                worker.status = "failed";
              } finally {
                worker.finishedAt = new Date().toISOString();
              }
            }),
          );
          if (run.workers.some((worker) => worker.status === "failed")) {
            run.status = "failed";
            return;
          }
          if (!stages || !run.stages) {
            run.status = "completed";
            return;
          }
          const findings = run.workers.map((worker) => worker.report!);
          const coordinator = run.stages.coordinator;
          coordinator.status = "running";
          try {
            coordinator.report = await stages.plan(objective, findings);
            coordinator.status = "completed";
          } catch (error) {
            coordinator.status = "failed";
            coordinator.error = error instanceof Error ? error.message : String(error);
            throw error;
          }
          const implementer = run.stages.implementer;
          implementer.status = "running";
          try {
            run.changeSet = await stages.implement({
              objective,
              plan: coordinator.report,
              findings,
            });
            implementer.report = `Prepared Change Set ${run.changeSet.id}.`;
            implementer.status = "completed";
          } catch (error) {
            implementer.status = "failed";
            implementer.error = error instanceof Error ? error.message : String(error);
            throw error;
          }
          const reviewer = run.stages.reviewer;
          reviewer.status = "running";
          try {
            reviewer.report = await stages.review({
              objective,
              plan: coordinator.report,
              findings,
              changeSet: run.changeSet,
            });
            reviewer.status = "completed";
            run.status = "awaiting_approval";
          } catch (error) {
            reviewer.status = "failed";
            reviewer.error = error instanceof Error ? error.message : String(error);
            run.status = "needs_attention";
          }
        } catch {
          run.status = run.changeSet ? "needs_attention" : "failed";
        } finally {
          run.automationFinishedAt = new Date().toISOString();
          if (run.status === "failed" || run.status === "completed") {
            run.finishedAt = run.automationFinishedAt;
          }
          activeId = null;
        }
      })();
      return snapshot(run);
    },

    get(id: string) {
      const run = runs.get(id);
      return run ? snapshot(run) : null;
    },

    markChangeSetDecision(changeSetId: string, decision: "approved" | "rejected") {
      const run = [...runs.values()].find(
        (item) => item.changeSet?.id === changeSetId,
      );
      if (run) {
        run.status = decision === "approved" ? "completed" : "rejected";
        run.finishedAt = new Date().toISOString();
      }
    },
  };
}
