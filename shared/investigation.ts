export type InvestigationWorkerId = "code" | "tests";
export type InvestigationWorkerStatus = "queued" | "running" | "completed" | "failed";

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
  status: "running" | "completed" | "failed";
  startedAt: string;
  finishedAt?: string;
  workers: InvestigationWorker[];
};
