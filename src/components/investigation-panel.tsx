import { useEffect, useState } from "react";
import { ChevronDown, ChevronRight, FlaskConical, LoaderCircle } from "lucide-react";
import type { InvestigationRun } from "../../shared/investigation";
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
    if (!objective.trim() || submitting || run?.status === "running") return;
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

  return (
    <section className="shrink-0 border-b border-border bg-card" aria-label="Parallel investigation">
      <button
        type="button"
        className="flex w-full items-center gap-2 px-5 py-3 text-left text-sm font-medium hover:bg-subtle sm:px-8"
        onClick={() => setOpen((current) => !current)}
        aria-expanded={open}
      >
        {open ? <ChevronDown className="size-4" /> : <ChevronRight className="size-4" />}
        <FlaskConical className="size-4" />
        Parallel investigation
        {run ? <span className="ml-auto text-xs text-muted-foreground">{run.status}</span> : null}
      </button>
      {open ? (
        <div className="max-h-[48vh] space-y-3 overflow-y-auto border-t border-border px-5 py-4 sm:px-8">
          <p className="text-xs leading-5 text-muted-foreground">
            Two workers inspect the Workspace at the same time. They can read files but cannot change them.
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
              disabled={!objective.trim() || submitting || run?.status === "running"}
            >
              {submitting || run?.status === "running" ? (
                <LoaderCircle className="size-4 animate-spin" />
              ) : null}
              {run?.status === "running" ? "Investigating" : "Run investigation"}
            </Button>
          </form>
          {error ? <p className="text-sm text-destructive" role="alert">{error}</p> : null}
          {run ? (
            <div className="grid gap-3 md:grid-cols-2" aria-live="polite">
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
          ) : null}
        </div>
      ) : null}
    </section>
  );
}
