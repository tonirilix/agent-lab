import { randomUUID } from "node:crypto";
import { generateText, isStepCount, type LanguageModel } from "ai";
import type {
  InvestigationRun,
  InvestigationWorker,
  InvestigationWorkerId,
} from "../shared/investigation.js";
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

export class ActiveInvestigationError extends Error {
  constructor() {
    super("An investigation is already running.");
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

export function createInvestigationService(runWorker: InvestigationWorkerRunner) {
  const runs = new Map<string, InvestigationRun>();
  let activeId: string | null = null;

  function snapshot(run: InvestigationRun): InvestigationRun {
    return structuredClone(run);
  }

  return {
    start(objective: string) {
      if (activeId) throw new ActiveInvestigationError();
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
      };
      runs.set(run.id, run);
      activeId = run.id;
      while (runs.size > 10) {
        const oldest = runs.keys().next().value;
        if (oldest) runs.delete(oldest);
      }

      void Promise.all(
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
      ).then(() => {
        run.status = run.workers.every((worker) => worker.status === "completed")
          ? "completed"
          : "failed";
        run.finishedAt = new Date().toISOString();
        activeId = null;
      });
      return snapshot(run);
    },

    get(id: string) {
      const run = runs.get(id);
      return run ? snapshot(run) : null;
    },
  };
}
