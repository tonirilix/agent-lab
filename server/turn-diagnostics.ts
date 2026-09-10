import {
  toUIMessageStream,
  type TextStreamPart,
  type ToolSet,
  type UIMessageChunk,
} from "ai";
import type {
  AgentUIMessage,
  TurnDiagnostics,
} from "../shared/agent-messages.js";

export function createDiagnosticUIStream<TOOLS extends ToolSet>({
  stream,
  model,
  contextWarning,
  startedAt = Date.now(),
}: {
  stream: ReadableStream<TextStreamPart<TOOLS>>;
  model: string;
  contextWarning: boolean;
  startedAt?: number;
}) {
  let stepCount = 0;
  let toolCallCount = 0;
  let diagnostics: TurnDiagnostics | null = null;
  const baseDiagnostics = () => ({
    durationMs: Math.max(0, Date.now() - startedAt),
    stepCount,
    toolCallCount,
    model,
    contextWarning,
  });

  const observed = stream.pipeThrough(
    new TransformStream<TextStreamPart<TOOLS>, TextStreamPart<TOOLS>>({
      transform(part, controller) {
        if (part.type === "finish-step") stepCount += 1;
        if (part.type === "tool-call") toolCallCount += 1;
        if (part.type === "finish") {
          diagnostics = {
            ...baseDiagnostics(),
            status: "completed",
            usage: {
              inputTokens: part.totalUsage.inputTokens ?? null,
              outputTokens: part.totalUsage.outputTokens ?? null,
              totalTokens: part.totalUsage.totalTokens ?? null,
            },
          };
        } else if (part.type === "abort") {
          diagnostics = {
            ...baseDiagnostics(),
            status: "stopped",
            usage: {
              inputTokens: null,
              outputTokens: null,
              totalTokens: null,
            },
          };
        } else if (part.type === "error") {
          diagnostics = {
            ...baseDiagnostics(),
            status: "failed",
            usage: {
              inputTokens: null,
              outputTokens: null,
              totalTokens: null,
            },
          };
        }
        controller.enqueue(part);
      },
    }),
  );
  const uiStream = toUIMessageStream<TOOLS, AgentUIMessage>({
    stream: observed,
    sendReasoning: false,
  });

  return uiStream.pipeThrough(
    new TransformStream<
      UIMessageChunk<TurnDiagnostics>,
      UIMessageChunk<TurnDiagnostics>
    >({
      transform(chunk, controller) {
        if (
          diagnostics &&
          (chunk.type === "finish" || chunk.type === "abort")
        ) {
          controller.enqueue({
            type: "message-metadata",
            messageMetadata: diagnostics,
          });
        }
        controller.enqueue(chunk);
      },
    }),
  );
}
