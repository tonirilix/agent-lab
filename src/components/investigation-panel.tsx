import { useEffect, useState } from "react";
import {
  AlertCircle,
  CheckCircle2,
  ChevronDown,
  Circle,
  FlaskConical,
  LoaderCircle,
  RotateCcw,
  Sparkles,
} from "lucide-react";
import type {
  InvestigationRun,
  InvestigationStage,
  InvestigationWorker,
  InvestigationWorkerStatus,
} from "../../shared/investigation";
import type { ToolTraceRecord } from "../../shared/tool-trace";
import { ChangeSetCard } from "./change-set-card";
import { MessageMarkdown } from "./message-markdown";
import { ToolTraceView } from "./tool-trace-entry";
import { Button } from "./ui/button";
import { Textarea } from "./ui/textarea";

const EXAMPLE_OBJECTIVE =
  "Add an optional low, normal, or high priority to tasks and show how many high-priority tasks remain.";

type StepStatus = InvestigationWorkerStatus;

async function readRun(response: Response): Promise<InvestigationRun> {
  const body = await response.json();
  if (!response.ok) throw new Error(body.error ?? "Workflow request failed.");
  return body as InvestigationRun;
}

function statusLabel(status: StepStatus) {
  return status === "completed" ? "Done" : status === "running" ? "Working" : status === "failed" ? "Failed" : "Waiting";
}

function StepIcon({ status }: { status: StepStatus }) {
  if (status === "completed") return <CheckCircle2 className="size-4 text-emerald-600 dark:text-emerald-400" />;
  if (status === "running") return <LoaderCircle className="size-4 animate-spin text-foreground" />;
  if (status === "failed") return <AlertCircle className="size-4 text-destructive" />;
  return <Circle className="size-4 text-muted-foreground/60" />;
}

function ToolTraceList({ records }: { records?: ToolTraceRecord[] }) {
  if (records === undefined || records.length === 0) return null;
  return (
    <section className="mt-4 border-t border-border pt-3" aria-label="Tool Trace">
      <p className="mb-2 text-xs font-semibold text-muted-foreground">
        Tool Trace · {records.length} {records.length === 1 ? "call" : "calls"}
      </p>
      {records.map(({ id, ...record }) => <ToolTraceView key={id} {...record} />)}
    </section>
  );
}

function workerStatus(workers: InvestigationWorker[]): StepStatus {
  if (workers.some((worker) => worker.status === "failed")) return "failed";
  if (workers.every((worker) => worker.status === "completed")) return "completed";
  if (workers.some((worker) => worker.status === "running")) return "running";
  return "queued";
}

function ProgressStrip({ run }: { run: InvestigationRun }) {
  const steps: { title: string; status: StepStatus }[] = [
    { title: "Assign", status: run.stages?.assignment.status ?? "queued" },
    { title: "Investigate", status: workerStatus(run.workers) },
    { title: "Plan", status: run.stages?.coordinator.status ?? "queued" },
    { title: "Propose", status: run.stages?.implementer.status ?? "queued" },
    { title: "Verify", status: run.stages?.verification.status ?? "queued" },
    { title: "Review", status: run.stages?.reviewer.status ?? "queued" },
    {
      title: "Decide",
      status: run.status === "completed" || run.status === "rejected"
        ? "completed"
        : run.status === "awaiting_approval" ? "running" : "queued",
    },
  ];
  return (
    <div className="overflow-x-auto pb-1" aria-label="Workflow progress">
      <ol className="grid min-w-[710px] grid-cols-7 gap-2">
        {steps.map((step, index) => (
          <li
            key={step.title}
            className={`rounded-xl border px-3 py-3 ${step.status === "running" ? "border-foreground/30 bg-subtle" : step.status === "failed" ? "border-destructive/35 bg-destructive/5" : "border-border bg-card"}`}
            aria-current={step.status === "running" ? "step" : undefined}
          >
            <div className="flex items-center justify-between gap-2">
              <StepIcon status={step.status} />
              <span className="text-[10px] tabular-nums text-muted-foreground">{String(index + 1).padStart(2, "0")}</span>
            </div>
            <p className="mt-2 text-xs font-semibold">{step.title}</p>
            <p className="mt-0.5 text-[11px] text-muted-foreground">
              {step.title === "Decide" && run.status === "awaiting_approval" ? "Your turn" : statusLabel(step.status)}
            </p>
          </li>
        ))}
      </ol>
    </div>
  );
}

function StageCard({
  title,
  description,
  stage,
  code = false,
}: {
  title: string;
  description: string;
  stage: InvestigationStage;
  code?: boolean;
}) {
  return (
    <details
      key={`${title}-${stage.status}`}
      className="group overflow-hidden rounded-2xl border border-border bg-card open:shadow-sm"
      open={stage.status === "running" || stage.status === "failed"}
    >
      <summary className="flex cursor-pointer list-none items-center gap-3 px-4 py-4 hover:bg-subtle/60 [&::-webkit-details-marker]:hidden sm:px-5">
        <span className="grid size-9 shrink-0 place-items-center rounded-xl border border-border bg-background">
          <StepIcon status={stage.status} />
        </span>
        <span className="min-w-0 flex-1">
          <span className="block text-sm font-semibold">{title}</span>
          <span className="block truncate text-xs text-muted-foreground">{description}</span>
        </span>
        <span className={`text-xs ${stage.status === "failed" ? "text-destructive" : "text-muted-foreground"}`}>{statusLabel(stage.status)}</span>
        <ChevronDown className="size-4 shrink-0 text-muted-foreground transition-transform group-open:rotate-180" />
      </summary>
      <div className="border-t border-border px-4 py-4 sm:px-5">
        {stage.error ? (
          code ? (
            <pre className="max-h-72 overflow-auto whitespace-pre-wrap rounded-xl border border-destructive/20 bg-destructive/5 p-4 font-mono text-xs leading-5 text-destructive" role="alert">{stage.error}</pre>
          ) : (
            <p className="text-sm text-destructive" role="alert">{stage.error}</p>
          )
        ) : null}
        {stage.report ? (
          code ? (
            <pre className="max-h-72 overflow-auto whitespace-pre-wrap rounded-xl bg-code p-4 font-mono text-xs leading-5 text-slate-100">{stage.report}</pre>
          ) : (
            <div className="message-markdown text-sm"><MessageMarkdown>{stage.report}</MessageMarkdown></div>
          )
        ) : !stage.error ? (
          <p className="text-sm text-muted-foreground">{stage.status === "running" ? "This step is in progress." : "This step starts after the earlier work finishes."}</p>
        ) : null}
        <ToolTraceList records={stage.toolTrace} />
      </div>
    </details>
  );
}

function WorkerCard({ worker }: { worker: InvestigationWorker }) {
  return (
    <details
      key={`${worker.id}-${worker.status}`}
      className="group min-w-0 overflow-hidden rounded-xl border border-border bg-background open:shadow-sm"
      open={worker.status === "running" || worker.status === "failed"}
    >
      <summary className="flex cursor-pointer list-none items-start gap-3 p-4 [&::-webkit-details-marker]:hidden">
        <span className="grid size-8 shrink-0 place-items-center rounded-lg bg-subtle"><StepIcon status={worker.status} /></span>
        <span className="min-w-0 flex-1">
          <span className="block text-sm font-semibold">{worker.title}</span>
          <span className="mt-1 block text-xs leading-5 text-muted-foreground">{worker.brief}</span>
        </span>
        <ChevronDown className="mt-1 size-4 shrink-0 text-muted-foreground transition-transform group-open:rotate-180" />
      </summary>
      <div className="space-y-3 border-t border-border p-4">
        {worker.report ? <div className="message-markdown text-sm"><MessageMarkdown>{worker.report}</MessageMarkdown></div> : null}
        {worker.error ? <p className="text-sm text-destructive" role="alert">{worker.error}</p> : null}
        {!worker.report && !worker.error ? <p className="text-sm text-muted-foreground">{worker.status === "running" ? "Inspecting the Workspace…" : "Waiting for assignment."}</p> : null}
        <ToolTraceList records={worker.toolTrace} />
      </div>
    </details>
  );
}

export function InvestigationPanel({
  isExampleWorkspace,
  onStatusChange,
}: {
  isExampleWorkspace: boolean;
  onStatusChange?: (status: InvestigationRun["status"] | null) => void;
}) {
  const [objective, setObjective] = useState(isExampleWorkspace ? EXAMPLE_OBJECTIVE : "");
  const [run, setRun] = useState<InvestigationRun | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => onStatusChange?.(run?.status ?? null), [run?.status, onStatusChange]);

  useEffect(() => {
    if (!run || run.status !== "running") return;
    let cancelled = false;
    const timer = window.setInterval(() => {
      void fetch(`/api/investigations/${run.id}`)
        .then(readRun)
        .then((next) => {
          if (!cancelled) {
            setRun(next);
            setError(null);
          }
        })
        .catch((reason: unknown) => {
          if (!cancelled) setError(reason instanceof Error ? reason.message : String(reason));
        });
    }, 750);
    return () => {
      cancelled = true;
      window.clearInterval(timer);
    };
  }, [run?.id, run?.status]);

  const running = run?.status === "running";
  const awaitingDecision = run?.status === "awaiting_approval" || run?.status === "needs_attention";
  const canStart = !!objective.trim() && !submitting && !running && !awaitingDecision;
  const canRetry = run && (run.status === "failed" || run.status === "needs_attention") &&
    (run.workers.some((worker) => worker.status === "failed") ||
      Object.values(run.stages ?? {}).some((stage) => stage.status === "failed"));

  async function start() {
    if (!canStart) return;
    setSubmitting(true);
    setError(null);
    try {
      const response = await fetch("/api/investigations", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ objective: objective.trim() }),
      });
      setRun(await readRun(response));
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : String(reason));
    } finally {
      setSubmitting(false);
    }
  }

  async function retry() {
    if (!run || submitting) return;
    setSubmitting(true);
    setError(null);
    try {
      setRun(await readRun(await fetch(`/api/investigations/${run.id}/retry`, { method: "POST" })));
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : String(reason));
    } finally {
      setSubmitting(false);
    }
  }

  const runTitle = run?.status === "awaiting_approval" ? "Ready for your review"
    : run?.status === "needs_attention" ? "A step needs attention"
      : run?.status === "failed" ? "Workflow stopped"
        : run?.status === "completed" ? "Change Set applied"
          : run?.status === "rejected" ? "Change Set rejected"
            : "Workflow in progress";
  const runStatusLabel = run?.status === "awaiting_approval" ? "Needs your review"
    : run?.status === "needs_attention" ? "Needs attention"
      : run?.status === "completed" ? "Applied"
        : run?.status === "rejected" ? "Rejected"
          : run?.status === "failed" ? "Failed" : "Running";

  return (
    <section className="flex min-h-0 flex-1 flex-col bg-background" aria-label="Agent workflow">
      <div className="min-h-0 flex-1 overflow-y-auto">
        <div className="mx-auto w-full max-w-4xl space-y-7 px-5 py-7 sm:px-8 sm:py-9">
          <header className="flex items-start gap-4">
            <span className="grid size-12 shrink-0 place-items-center rounded-2xl border border-border bg-card shadow-sm">
              <FlaskConical className="size-5" />
            </span>
            <div>
              <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-muted-foreground">Agent orchestration</p>
              <h2 className="mt-1 text-2xl font-semibold tracking-tight">Agent workflow</h2>
              <p className="mt-2 max-w-2xl text-sm leading-6 text-muted-foreground">
                Follow one change from parallel investigation through a reviewable proposal. You decide whether any Workspace files change.
              </p>
            </div>
          </header>

          {run && (running || awaitingDecision) ? (
            <section className="rounded-2xl border border-border bg-card px-5 py-4 shadow-sm sm:px-6" aria-label="Current objective">
              <p className="text-[11px] font-semibold uppercase tracking-[0.15em] text-muted-foreground">Objective</p>
              <p className="mt-1 text-sm leading-6">{run.objective}</p>
            </section>
          ) : (
          <section className="rounded-2xl border border-border bg-card p-5 shadow-sm sm:p-6" aria-labelledby="workflow-objective-heading">
            <div className="mb-4 flex flex-wrap items-start justify-between gap-3">
              <div>
                <h3 id="workflow-objective-heading" className="text-sm font-semibold">Objective</h3>
                <p className="mt-1 text-xs leading-5 text-muted-foreground">Give the workers one concrete change to investigate.</p>
              </div>
              {isExampleWorkspace ? <span className="rounded-full border border-border bg-background px-2.5 py-1 text-[11px] text-muted-foreground">Suggested task</span> : null}
            </div>
            <form onSubmit={(event) => { event.preventDefault(); void start(); }}>
              <Textarea
                value={objective}
                onChange={(event) => setObjective(event.target.value)}
                maxLength={2_000}
                aria-label="Workflow objective"
                placeholder="Describe one change you want the agents to investigate…"
                className="min-h-28 resize-y bg-background text-sm leading-6"
              />
              <div className="mt-4 flex flex-wrap items-center justify-between gap-3">
                <p className="text-xs text-muted-foreground">The workflow prepares a Change Set; it cannot apply one without you.</p>
                <Button type="submit" disabled={!canStart} size="lg">
                  {submitting || running ? <LoaderCircle className="size-4 animate-spin" /> : <Sparkles className="size-4" />}
                  {running ? "Running workflow" : run ? "Run another workflow" : "Start workflow"}
                </Button>
              </div>
            </form>
          </section>
          )}

          {error ? <p className="rounded-xl border border-destructive/30 bg-destructive/5 p-4 text-sm text-destructive" role="alert">{error}</p> : null}

          {!run ? (
            <section className="grid gap-3 sm:grid-cols-3" aria-label="Workflow overview">
              {[
                ["01", "Investigate", "Two read-only workers inspect code and tests at the same time."],
                ["02", "Prepare", "A coordinator plans and an implementer proposes one Change Set."],
                ["03", "Decide", "Verification and review inform your final approval."],
              ].map(([number, title, description]) => (
                <article key={number} className="rounded-2xl border border-border bg-card p-5">
                  <span className="text-xs font-semibold text-muted-foreground">{number}</span>
                  <h3 className="mt-3 text-sm font-semibold">{title}</h3>
                  <p className="mt-2 text-xs leading-5 text-muted-foreground">{description}</p>
                </article>
              ))}
            </section>
          ) : (
            <div className="space-y-7">
              <section className="space-y-4" aria-labelledby="workflow-progress-heading">
                <div className="flex flex-wrap items-center justify-between gap-3">
                  <div>
                    <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-muted-foreground">Current run</p>
                    <h3 id="workflow-progress-heading" className="mt-1 text-lg font-semibold" aria-live="polite">{runTitle}</h3>
                  </div>
                  <div className="flex items-center gap-2">
                    {canRetry ? (
                      <Button type="button" variant="outline" size="sm" disabled={submitting} onClick={() => void retry()}>
                        <RotateCcw className="size-3.5" /> Retry failed step
                      </Button>
                    ) : null}
                    <span className={`rounded-full border px-3 py-1 text-xs font-medium ${run.status === "needs_attention" || run.status === "failed" ? "border-amber-500/30 bg-amber-500/10 text-amber-700 dark:text-amber-300" : run.status === "awaiting_approval" ? "border-emerald-500/30 bg-emerald-500/10 text-emerald-700 dark:text-emerald-300" : "border-border bg-card text-muted-foreground"}`}>
                      {runStatusLabel}
                    </span>
                  </div>
                </div>
                <ProgressStrip run={run} />
              </section>

              {run.stages ? (
                <section className="space-y-3" aria-labelledby="workflow-steps-heading">
                  <div className="pb-1">
                    <h3 id="workflow-steps-heading" className="text-base font-semibold">Execution details</h3>
                    <p className="mt-1 text-xs text-muted-foreground">Open any step to inspect its report or error.</p>
                  </div>
                  <StageCard title="Assignment" description="The coordinator defines separate investigation briefs." stage={run.stages.assignment} />
                  <div className="rounded-2xl border border-border bg-card p-4 sm:p-5">
                    <div className="mb-4 flex items-center gap-3">
                      <span className="grid size-9 place-items-center rounded-xl border border-border bg-background"><StepIcon status={workerStatus(run.workers)} /></span>
                      <div className="min-w-0 flex-1">
                        <h4 className="text-sm font-semibold">Parallel investigation</h4>
                        <p className="text-xs text-muted-foreground">Two independent read-only reports</p>
                      </div>
                      <span className="text-xs text-muted-foreground">{statusLabel(workerStatus(run.workers))}</span>
                    </div>
                    <div className="grid gap-3 md:grid-cols-2">
                      {run.workers.map((worker) => <WorkerCard key={worker.id} worker={worker} />)}
                    </div>
                  </div>
                  <StageCard title="Coordinator" description="Combines findings into an implementation plan." stage={run.stages.coordinator} />
                  <StageCard title="Implementer" description="Prepares a validated, unapplied Change Set." stage={run.stages.implementer} />
                  <StageCard title="Verification" description="Tests the proposal in a disposable copy when supported." stage={run.stages.verification} code />
                  <StageCard title="Reviewer" description="Inspects the proposed diff and verification result." stage={run.stages.reviewer} />
                </section>
              ) : null}

              {run.changeSet && ["awaiting_approval", "needs_attention", "completed", "rejected"].includes(run.status) ? (
                <section className="rounded-2xl border border-border bg-card p-5 shadow-sm sm:p-6" aria-labelledby="workflow-decision-heading">
                  <div className="mb-4">
                    <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-muted-foreground">Decision point</p>
                    <h3 id="workflow-decision-heading" className="mt-1 text-lg font-semibold">Review the proposed Change Set</h3>
                    <p className="mt-1 text-sm text-muted-foreground">Inspect the diff and reports before applying anything to the Workspace.</p>
                  </div>
                  {run.status === "needs_attention" ? (
                    <p className="mb-4 rounded-xl border border-amber-500/30 bg-amber-500/10 p-3 text-sm text-amber-800 dark:text-amber-200" role="alert">
                      Verification or review did not complete. Retry reruns the same proposal. If its tests failed, reject it and start a new workflow with a revised objective.
                    </p>
                  ) : null}
                  <ChangeSetCard
                    key={run.changeSet.id}
                    changeSet={run.changeSet}
                    toolInput={{ objective: run.objective }}
                    toolOutput={{ coordinator: run.stages?.coordinator.report, verification: run.stages?.verification.report, reviewer: run.stages?.reviewer.report }}
                    onRejected={() => setRun((current) => current ? { ...current, status: "rejected" } : current)}
                    onApplied={() => setRun((current) => current ? { ...current, status: "completed" } : current)}
                    approvalDisabled={run.status !== "awaiting_approval"}
                    completionMessage="Applied and verified."
                  />
                </section>
              ) : null}
            </div>
          )}
        </div>
      </div>
    </section>
  );
}
