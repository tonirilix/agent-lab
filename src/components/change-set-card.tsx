import {
  AlertTriangle,
  FileDiff,
  FileMinus2,
  FilePenLine,
  FilePlus2,
  Loader2,
  ShieldCheck,
  X,
} from "lucide-react";
import type { PendingChangeSet } from "../../shared/change-set-contracts";
import type { AppliedChangeSet } from "../../shared/change-set-contracts";
import { useChangeSetApproval } from "../lib/use-change-set-approval";
import { useChangeSetRejection } from "../lib/use-change-set-rejection";
import { Button } from "./ui/button";
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetFooter,
  SheetHeader,
  SheetTitle,
  SheetTrigger,
} from "./ui/sheet";
import { Textarea } from "./ui/textarea";

function OperationIcon({ kind }: { kind: "create" | "modify" | "delete" }) {
  if (kind === "create") return <FilePlus2 className="size-4 text-emerald-500" />;
  if (kind === "delete") return <FileMinus2 className="size-4 text-destructive" />;
  return <FilePenLine className="size-4 text-amber-500" />;
}

function DiffBlock({ diff }: { diff: string }) {
  return (
    <pre className="overflow-x-auto rounded-xl border border-border bg-code p-3 font-mono text-[11px] leading-5">
      {diff.split("\n").map((line, index) => (
        <span
          className={
            line.startsWith("+") && !line.startsWith("+++")
              ? "block bg-emerald-500/10 text-emerald-700 dark:text-emerald-300"
              : line.startsWith("-") && !line.startsWith("---")
                ? "block bg-destructive/10 text-destructive"
                : "block"
          }
          key={index}
        >
          {line || " "}
        </span>
      ))}
    </pre>
  );
}

export function ChangeSetCard({
  changeSet,
  toolInput,
  toolOutput,
  onRejected,
  onApplied,
}: {
  changeSet: PendingChangeSet;
  toolInput: unknown;
  toolOutput: unknown;
  onRejected: (id: string, feedback: string) => void;
  onApplied: (result: AppliedChangeSet) => void;
}) {
  const { error, feedback, reject, setFeedback, state } =
    useChangeSetRejection({ changeSetId: changeSet.id, onRejected });
  const approval = useChangeSetApproval({
    changeSetId: changeSet.id,
    onApplied,
  });
  const visibleState =
    state === "rejected" ? "rejected" : approval.state;

  return (
    <Sheet>
      <div className="my-2 rounded-2xl border border-border bg-muted/40 p-4">
        <div className="flex items-start gap-3">
          <span className="grid size-9 shrink-0 place-items-center rounded-xl bg-background">
            <FileDiff className="size-4" />
          </span>
          <div className="min-w-0 flex-1">
            <div className="flex flex-wrap items-center gap-2">
              <p className="font-medium">Change Set</p>
              <span
                className="rounded-full border border-border px-2 py-0.5 text-[10px] uppercase tracking-wide text-muted-foreground"
                role="status"
                aria-live="polite"
              >
                {visibleState}
              </span>
            </div>
            <p className="mt-1 text-sm text-muted-foreground">
              {changeSet.summary}
            </p>
            <p className="mt-2 text-xs text-muted-foreground">
              {changeSet.files.length} affected {changeSet.files.length === 1 ? "file" : "files"}
            </p>
          </div>
        </div>
        <SheetTrigger
          render={
            <Button className="mt-4 w-full" variant="outline" size="sm" />
          }
        >
          Review Change Set
        </SheetTrigger>
      </div>

      <SheetContent className="w-full sm:max-w-3xl">
        <SheetHeader className="border-b border-border pr-12">
          <SheetTitle>Review Change Set</SheetTitle>
          <SheetDescription>{changeSet.summary}</SheetDescription>
        </SheetHeader>
        <div className="min-h-0 flex-1 space-y-6 overflow-y-auto px-4 pb-4">
          <section>
            <h3 className="mb-2 text-xs font-medium uppercase tracking-wide text-muted-foreground">
              Affected files
            </h3>
            <div className="divide-y divide-border rounded-xl border border-border">
              {changeSet.files.map((file) => (
                <div className="flex items-center gap-2 px-3 py-2" key={file.path}>
                  <OperationIcon kind={file.kind} />
                  <code className="min-w-0 flex-1 truncate text-xs">{file.path}</code>
                  <span className="text-[10px] uppercase text-muted-foreground">
                    {file.kind}
                  </span>
                </div>
              ))}
            </div>
          </section>

          {changeSet.warnings.length ? (
            <section className="rounded-xl border border-amber-500/30 bg-amber-500/10 p-3">
              <h3 className="flex items-center gap-2 text-sm font-medium">
                <AlertTriangle className="size-4" /> Warnings
              </h3>
              <ul className="mt-2 list-disc space-y-1 pl-5 text-xs">
                {changeSet.warnings.map((warning) => (
                  <li key={warning}>{warning}</li>
                ))}
              </ul>
            </section>
          ) : null}

          <section className="space-y-5">
            <h3 className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
              Server-generated diff
            </h3>
            {changeSet.files.map((file) => (
              <div className="space-y-2" key={file.path}>
                <p className="font-mono text-xs font-medium">{file.path}</p>
                <DiffBlock diff={file.diff} />
              </div>
            ))}
          </section>

          {approval.result ? (
            <section className="space-y-3">
              <h3 className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
                Application result
              </h3>
              <div className="flex flex-wrap gap-2" aria-label="Change Set lifecycle">
                {approval.result.lifecycle.map((item) => (
                  <span
                    className="rounded-full border border-emerald-500/30 bg-emerald-500/10 px-2 py-1 text-[10px] uppercase text-emerald-700 dark:text-emerald-300"
                    key={item}
                  >
                    {item}
                  </span>
                ))}
              </div>
              <div className="divide-y divide-border rounded-xl border border-border">
                {approval.result.files.map((file) => (
                  <div className="flex items-center gap-2 px-3 py-2" key={file.path}>
                    <OperationIcon kind={file.kind} />
                    <code className="min-w-0 flex-1 truncate text-xs">
                      {file.path}
                    </code>
                    <span className="text-[10px] uppercase text-emerald-700 dark:text-emerald-300">
                      {file.status}
                    </span>
                  </div>
                ))}
              </div>
              {approval.result.files.map((file) => (
                <div className="space-y-2" key={file.path}>
                  <p className="font-mono text-xs font-medium">{file.path}</p>
                  <DiffBlock diff={file.actualDiff} />
                </div>
              ))}
            </section>
          ) : null}

          <details className="rounded-xl border border-border">
            <summary className="cursor-pointer px-3 py-2 text-xs font-medium">
              Advanced · exact Tool arguments
            </summary>
            <pre className="max-h-96 overflow-auto border-t border-border bg-code p-3 text-[11px]">
              {JSON.stringify(toolInput, null, 2)}
            </pre>
          </details>
          <details className="rounded-xl border border-border">
            <summary className="cursor-pointer px-3 py-2 text-xs font-medium">
              Advanced · exact Tool result
            </summary>
            <pre className="max-h-96 overflow-auto border-t border-border bg-code p-3 text-[11px]">
              {JSON.stringify(toolOutput, null, 2)}
            </pre>
          </details>
        </div>

        <SheetFooter className="border-t border-border bg-popover">
          {state === "rejected" ? (
            <p className="flex items-center gap-2 text-sm text-muted-foreground">
              <X className="size-4" /> Rejected. No Workspace files changed.
            </p>
          ) : approval.result ? (
            <p className="flex items-center gap-2 text-sm text-emerald-700 dark:text-emerald-300">
              <ShieldCheck className="size-4" /> Applied and verified. OpenAI is preparing the final summary.
            </p>
          ) : (
            <>
              <Textarea
                value={feedback}
                onChange={(event) => setFeedback(event.target.value)}
                placeholder="Optional rejection feedback"
                aria-label="Rejection feedback"
                maxLength={2_000}
              />
              {error || approval.error ? (
                <p className="text-xs text-destructive">{error ?? approval.error}</p>
              ) : null}
              <div className="flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
                <Button
                  variant="outline"
                  onClick={() => void reject()}
                  disabled={state === "rejecting"}
                >
                  {state === "rejecting" ? <Loader2 className="animate-spin" /> : <X />}
                  Reject
                </Button>
                <Button
                  onClick={() => void approval.approve()}
                  disabled={state === "rejecting" || approval.state === "approved"}
                >
                  {approval.state === "approved" ? (
                    <Loader2 className="animate-spin" />
                  ) : (
                    <ShieldCheck />
                  )}
                  {approval.state === "approved" ? "Applying…" : "Approve Change Set"}
                </Button>
              </div>
            </>
          )}
        </SheetFooter>
      </SheetContent>
    </Sheet>
  );
}
