import { CheckCircle2, ChevronRight, CircleEllipsis, XCircle } from "lucide-react";
import { getToolName } from "ai";

type VisibleToolPart = Parameters<typeof getToolName>[0];

function formatted(value: unknown) {
  return JSON.stringify(value, null, 2) ?? "null";
}

function isStructuredToolError(value: unknown) {
  return (
    typeof value === "object" &&
    value !== null &&
    "ok" in value &&
    value.ok === false
  );
}

export function ToolTraceEntry({ part }: { part: VisibleToolPart }) {
  const toolName = getToolName(part);
  const finished = part.state === "output-available";
  const failed =
    part.state === "output-error" ||
    part.state === "output-denied" ||
    (part.state === "output-available" && isStructuredToolError(part.output));

  return (
    <details className="group/tool my-2 overflow-hidden rounded-xl border border-border bg-muted/40 text-sm">
      <summary className="flex cursor-pointer list-none items-center gap-2 px-3 py-2 font-medium [&::-webkit-details-marker]:hidden">
        <ChevronRight className="size-4 shrink-0 transition-transform group-open/tool:rotate-90" />
        {failed ? (
          <XCircle className="size-4 text-destructive" />
        ) : finished ? (
          <CheckCircle2 className="size-4 text-emerald-600 dark:text-emerald-400" />
        ) : (
          <CircleEllipsis className="size-4 animate-pulse text-muted-foreground" />
        )}
        <span>Tool Call · {toolName}</span>
        <span className="ml-auto text-xs font-normal text-muted-foreground">
          {failed ? "failed" : finished ? "complete" : "running"}
        </span>
      </summary>
      <div className="space-y-3 border-t border-border px-3 py-3">
        <div>
          <p className="mb-1 text-xs font-medium text-muted-foreground">
            Arguments sent by the model
          </p>
          <pre className="max-h-64 overflow-auto rounded-lg bg-background p-3 text-xs">
            {formatted(part.input)}
          </pre>
        </div>
        {part.state === "output-available" ? (
          <div>
            <p className="mb-1 text-xs font-medium text-muted-foreground">
              Bounded result returned to the model
            </p>
            <pre className="max-h-80 overflow-auto rounded-lg bg-background p-3 text-xs">
              {formatted(part.output)}
            </pre>
          </div>
        ) : null}
        {part.state === "output-error" ? (
          <div className="rounded-lg bg-destructive/10 p-3 text-xs text-destructive">
            {part.errorText}
          </div>
        ) : null}
      </div>
    </details>
  );
}
