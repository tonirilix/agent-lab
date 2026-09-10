import { isToolUIPart } from "ai";
import { useCallback, useEffect, useRef, useState } from "react";
import type {
  AgentUIMessage,
  TurnDiagnostics,
} from "../../shared/agent-messages";

function localDiagnostics(
  status: "stopped" | "failed",
  model: string,
  startedAt: number,
  messages: AgentUIMessage[],
  contextWarning: boolean,
): TurnDiagnostics {
  const assistantMessages = messages.filter(
    (message) => message.role === "assistant",
  );
  return {
    status,
    durationMs: Math.max(0, Date.now() - startedAt),
    stepCount: assistantMessages.reduce(
      (count, message) =>
        count + message.parts.filter((part) => part.type === "step-start").length,
      0,
    ),
    toolCallCount: assistantMessages.reduce(
      (count, message) =>
        count + message.parts.filter((part) => isToolUIPart(part)).length,
      0,
    ),
    model,
    usage: { inputTokens: null, outputTokens: null, totalTokens: null },
    contextWarning,
  };
}

function latestAssistantIndex(messages: AgentUIMessage[]) {
  for (let index = messages.length - 1; index >= 0; index -= 1) {
    if (messages[index]?.role === "assistant") return index;
  }
  return 0;
}

export function useTurnDiagnostics({
  contextWarningCharacters,
  error,
  messages,
  model,
}: {
  contextWarningCharacters: number;
  error: Error | undefined;
  messages: AgentUIMessage[];
  model: string;
}) {
  const [terminalDiagnostics, setTerminalDiagnostics] =
    useState<TurnDiagnostics | null>(null);
  const turnStartedAt = useRef(Date.now());
  const turnMessageStart = useRef(0);
  const contextWarning = JSON.stringify(messages).length >= contextWarningCharacters;

  const beginTurn = useCallback((mode: "append" | "regenerate" = "append") => {
    setTerminalDiagnostics(null);
    turnStartedAt.current = Date.now();
    turnMessageStart.current =
      mode === "regenerate"
        ? latestAssistantIndex(messages)
        : messages.length;
  }, [messages]);

  const finishLocally = useCallback(
    (status: "stopped" | "failed") => {
      setTerminalDiagnostics(
        localDiagnostics(
          status,
          model,
          turnStartedAt.current,
          messages.slice(turnMessageStart.current),
          contextWarning,
        ),
      );
    },
    [contextWarning, messages, model],
  );

  useEffect(() => {
    if (error && !terminalDiagnostics) finishLocally("failed");
  }, [error, finishLocally, terminalDiagnostics]);

  return {
    beginTurn,
    contextWarning,
    finishLocally,
    terminalDiagnostics,
  };
}
