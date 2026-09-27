import { useEffect, useState } from "react";
import { ChevronDown, ChevronRight, FlaskConical, LoaderCircle } from "lucide-react";
import type { InvestigationRun } from "../../shared/investigation";
import { ChangeSetCard } from "./change-set-card";
import { MessageMarkdown } from "./message-markdown";
import { Button } from "./ui/button";
import { Textarea } from "./ui/textarea";

const EXAMPLE_OBJECTIVE =
  "Add an optional low, normal, or high priority to tasks and show how many high-priority tasks remain.";

async function readRun(response: Response): Promise<InvestigationRun> {
  const body = await response.json();
  if (!response.ok) {
    throw new Error(body.error ?? "Investigation request failed.");
  }
  return body as InvestigationRun;
}

export function InvestigationPanel() {
  const [open, setOpen] = useState(false);
  const [objective, setObjective] = useState(EXAMPLE_OBJECTIVE);
  const [run, setRun] = useState<InvestigationRun | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!run || run.status !== "running") return;
    let cancelled = false;
    const timer = window.setInterval(() => {
      void fetch(`/api/investigations/${run.id}`)
        .then(readRun)
        .then((next) => {
          if (!cancelled) setRun(next);
        })
        .catch((reason: unknown) => {
          if (!cancelled) {
            setError(reason instanceof Error ? reason.message : String(reason));
            window.clearInterval(timer);
          }
        });
    }, 750);
    return () => {
      cancelled = true;
      window.clearInterval(timer);
    };
  }, [run?.id, run?.status]);

  async function start() {
    if (
      !objective.trim() ||
      submitting ||
      run?.status === "running" ||
      run?.status === "awaiting_approval" ||
      run?.status === "needs_attention"
    ) return;
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

  const canRetry = run && (run.status === "failed" || run.status === "needs_attention") &&
    (run.workers.some((worker) => worker.status === "failed") ||
      Object.values(run.stages ?? {}).some((stage) => stage.status === "failed"));

  return (
    <section className="shrink-0 border-b border-border bg-card" aria-label="Agent workflow">
      <button
        type="button"
        className="flex w-full items-center gap-2 px-5 py-3 text-left text-sm font-medium hover:bg-subtle sm:px-8"
        onClick={() => setOpen((current) => !current)}
        aria-expanded={open}
      >
        {open ? <ChevronDown className="size-4" /> : <ChevronRight className="size-4" />}
        <FlaskConical className="size-4" />
        Agent workflow
        {run ? <span className="ml-auto text-xs text-muted-foreground">{run.status}</span> : null}
      </button>
      {open ? (
        <div className="max-h-[48vh] space-y-3 overflow-y-auto border-t border-border px-5 py-4 sm:px-8">
          <p className="text-xs leading-5 text-muted-foreground">
            Two workers inspect in parallel. A coordinator plans, an implementer prepares a Change Set, verification tests the proposal in a disposable copy when supported, and a reviewer assesses it before your approval.
          </p>
          <form
            className="space-y-2"
            onSubmit={(event) => {
              event.preventDefault();
              void start();
            }}
          >
            <Textarea
              value={objective}
              onChange={(event) => setObjective(event.target.value)}
              maxLength={2_000}
              aria-label="Investigation objective"
              className="min-h-20"
            />
            <Button
              type="submit"
              size="sm"
              disabled={
                !objective.trim() ||
                submitting ||
                run?.status === "running" ||
                run?.status === "awaiting_approval" ||
                run?.status === "needs_attention"
              }
            >
              {submitting || run?.status === "running" ? (
                <LoaderCircle className="size-4 animate-spin" />
              ) : null}
              {run?.status === "running"
                ? "Running workflow"
                : "Run workflow"}
            </Button>
            {canRetry ? (
              <Button type="button" size="sm" variant="outline" disabled={submitting} onClick={() => void retry()}>
                Retry failed step
              </Button>
            ) : null}
          </form>
          {error ? <p className="text-sm text-destructive" role="alert">{error}</p> : null}
          {run ? (
            <div className="space-y-3" aria-live="polite">
              <div className="grid gap-3 md:grid-cols-2">
                {run.workers.map((worker) => (
                <article key={worker.id} className="rounded-xl border border-border bg-background p-4">
                  <div className="flex items-center justify-between gap-2">
                    <h3 className="text-sm font-semibold">{worker.title}</h3>
                    <span className="text-xs text-muted-foreground">{worker.status}</span>
                  </div>
                  <p className="mt-1 text-xs leading-5 text-muted-foreground">{worker.brief}</p>
                  {worker.toolsUsed.length ? (
                    <p className="mt-3 text-xs text-muted-foreground">
                      Workspace tools: {worker.toolsUsed.join(" → ")}
                    </p>
                  ) : null}
                  {worker.report ? (
                    <div className="message-markdown mt-3 border-t border-border pt-3 text-sm">
                      <MessageMarkdown>{worker.report}</MessageMarkdown>
                    </div>
                  ) : null}
                  {worker.error ? (
                    <p className="mt-3 text-sm text-destructive" role="alert">{worker.error}</p>
                  ) : null}
                </article>
                ))}
              </div>
              {run.stages ? (
                <div className="grid gap-3 md:grid-cols-2">
                  {([
                    ["assignment", "Assignment"],
                    ["coordinator", "Coordinator"],
                    ["implementer", "Implementer"],
                    ["verification", "Verification"],
                    ["reviewer", "Reviewer"],
                  ] as const).map(([id, title]) => {
                    const stage = run.stages![id];
                    return (
                      <article key={id} className="rounded-xl border border-border bg-background p-4">
                        <div className="flex items-center justify-between gap-2">
                          <h3 className="text-sm font-semibold">{title}</h3>
                          <span className="text-xs text-muted-foreground">{stage.status}</span>
                        </div>
                        {stage.report ? (
                          <div className="message-markdown mt-3 text-sm">
                            <MessageMarkdown>{stage.report}</MessageMarkdown>
                          </div>
                        ) : null}
                        {stage.error ? (
                          <p className="mt-3 text-sm text-destructive" role="alert">{stage.error}</p>
                        ) : null}
                      </article>
                    );
                  })}
                </div>
              ) : null}
              {run.changeSet && (run.status === "awaiting_approval" || run.status === "needs_attention" || run.status === "completed" || run.status === "rejected") ? (
                <div>
                  {run.status === "needs_attention" ? (
                    <p className="mb-2 text-sm text-amber-700 dark:text-amber-300" role="alert">
                      Automation needs attention. Inspect the failed step and proposal before deciding or retrying.
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
                </div>
              ) : null}
            </div>
          ) : null}
        </div>
      ) : null}
    </section>
  );
}
