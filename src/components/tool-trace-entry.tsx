import { memo, useState } from "react";
import { CheckCircle2, ChevronRight, CircleEllipsis, XCircle } from "lucide-react";
import { getToolName } from "ai";
import { isToolResultError, type ToolTraceRecord } from "../../shared/tool-trace";

type VisibleToolPart = Parameters<typeof getToolName>[0];
type ToolTraceViewProps = Omit<ToolTraceRecord, "id">;

function formatted(value: unknown) {
  return JSON.stringify(value, null, 2) ?? "null";
}

export function ToolTraceView({
  name,
  status,
  input,
  output,
  error,
}: ToolTraceViewProps) {
  const [open, setOpen] = useState(false);
  const finished = status === "completed";
  const failed = status === "failed";

  return (
    <details
      className="group/tool my-2 overflow-hidden rounded-xl border border-border bg-muted/40 text-sm"
      onToggle={(event) => setOpen(event.currentTarget.open)}
    >
      <summary className="flex cursor-pointer list-none items-center gap-2 px-3 py-2 font-medium [&::-webkit-details-marker]:hidden">
        <ChevronRight className="size-4 shrink-0 transition-transform group-open/tool:rotate-90" />
        {failed ? (
          <XCircle className="size-4 text-destructive" />
        ) : finished ? (
          <CheckCircle2 className="size-4 text-emerald-600 dark:text-emerald-400" />
        ) : (
          <CircleEllipsis className="size-4 animate-pulse text-muted-foreground" />
        )}
        <span>Tool Call · {name}</span>
        <span className="ml-auto text-xs font-normal text-muted-foreground">
          {failed ? "failed" : finished ? "complete" : "running"}
        </span>
      </summary>
      {open ? <div className="space-y-3 border-t border-border px-3 py-3">
        <div>
          <p className="mb-1 text-xs font-medium text-muted-foreground">
            Arguments sent by the model
          </p>
          <pre className="max-h-64 overflow-auto rounded-lg bg-background p-3 text-xs">
            {formatted(input)}
          </pre>
        </div>
        {output === undefined ? null : (
          <div>
            <p className="mb-1 text-xs font-medium text-muted-foreground">
              Bounded result returned to the model
            </p>
            <pre className="max-h-80 overflow-auto rounded-lg bg-background p-3 text-xs">
              {formatted(output)}
            </pre>
          </div>
        )}
        {error ? (
          <div className="rounded-lg bg-destructive/10 p-3 text-xs text-destructive">
            {error}
          </div>
        ) : null}
      </div> : null}
    </details>
  );
}

export const ToolTraceEntry = memo(function ToolTraceEntry({
  part,
}: {
  part: VisibleToolPart;
}) {
  const status = part.state === "output-available"
    ? isToolResultError(part.output) ? "failed" : "completed"
    : part.state === "output-error" || part.state === "output-denied"
      ? "failed"
      : "running";
  return (
    <ToolTraceView
      name={getToolName(part)}
      status={status}
      input={part.input}
      output={part.state === "output-available" ? part.output : undefined}
      error={part.state === "output-error" ? part.errorText : undefined}
    />
  );
});
