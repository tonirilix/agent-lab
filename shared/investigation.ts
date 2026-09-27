import type { PendingChangeSet } from "./change-set-contracts.js";

export type InvestigationWorkerId = "code" | "tests";
export type InvestigationWorkerStatus = "queued" | "running" | "completed" | "failed";

export type InvestigationStage = {
  status: InvestigationWorkerStatus;
  report?: string;
  error?: string;
};

export type InvestigationWorker = {
  id: InvestigationWorkerId;
  title: string;
  brief: string;
  status: InvestigationWorkerStatus;
  startedAt?: string;
  finishedAt?: string;
  toolsUsed: string[];
  report?: string;
  error?: string;
};

export type InvestigationRun = {
  id: string;
  objective: string;
  status:
    | "running"
    | "awaiting_approval"
    | "needs_attention"
    | "rejected"
    | "completed"
    | "failed";
  startedAt: string;
  automationFinishedAt?: string;
  finishedAt?: string;
  workers: InvestigationWorker[];
  stages?: {
    assignment: InvestigationStage;
    coordinator: InvestigationStage;
    implementer: InvestigationStage;
    reviewer: InvestigationStage;
  };
  changeSet?: PendingChangeSet;
};
