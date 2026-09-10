import { Activity, AlertTriangle } from "lucide-react";
import type { TurnDiagnostics } from "../../shared/agent-messages";

function tokenValue(value: number | null) {
  return value === null ? "Unavailable" : value.toLocaleString();
}

export function TurnDiagnosticsFooter({
  diagnostics,
}: {
  diagnostics: TurnDiagnostics;
}) {
  return (
    <details className="mt-3 border-t border-border pt-2 text-xs text-muted-foreground">
      <summary className="flex cursor-pointer list-none items-center gap-2 [&::-webkit-details-marker]:hidden">
        <Activity className="size-3.5" />
        Turn diagnostics · {diagnostics.stepCount} {diagnostics.stepCount === 1 ? "step" : "steps"} · {diagnostics.toolCallCount} {diagnostics.toolCallCount === 1 ? "Tool Call" : "Tool Calls"}
      </summary>
      <dl className="mt-3 grid grid-cols-2 gap-x-4 gap-y-2 rounded-lg bg-muted/50 p-3">
        <dt>Status</dt><dd>{diagnostics.status}</dd>
        <dt>Duration</dt><dd>{(diagnostics.durationMs / 1_000).toFixed(2)}s</dd>
        <dt>Model</dt><dd className="break-all">{diagnostics.model}</dd>
        <dt>Input tokens</dt><dd>{tokenValue(diagnostics.usage.inputTokens)}</dd>
        <dt>Output tokens</dt><dd>{tokenValue(diagnostics.usage.outputTokens)}</dd>
        <dt>Total tokens</dt><dd>{tokenValue(diagnostics.usage.totalTokens)}</dd>
      </dl>
      {diagnostics.contextWarning ? (
        <p className="mt-2 flex items-start gap-2 rounded-lg border border-amber-500/30 bg-amber-500/10 p-2 text-foreground">
          <AlertTriangle className="mt-0.5 size-3.5 shrink-0" /> This transcript is becoming large. Start a new session before another complex Agent Turn.
        </p>
      ) : null}
    </details>
  );
}
