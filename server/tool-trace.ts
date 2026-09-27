import { randomUUID } from "node:crypto";
import type { ToolExecutionEndEvent, ToolExecutionStartEvent } from "ai";
import { isToolResultError, type ToolTraceRecord } from "../shared/tool-trace.js";

/** Captures the Tool Calls and outcomes reported by one model invocation. */
export function createToolTrace(records: ToolTraceRecord[]) {
  const byCallId = new Map<string, ToolTraceRecord>();

  function recordCall(call: { toolCallId: string; toolName: string; input: unknown }) {
    const record: ToolTraceRecord = {
      id: randomUUID(),
      name: call.toolName,
      status: "running",
      input: call.input,
    };
    records.push(record);
    byCallId.set(call.toolCallId, record);
    return record;
  }

  return {
    onStart(event: ToolExecutionStartEvent) {
      recordCall(event.toolCall);
    },

    onEnd(event: ToolExecutionEndEvent) {
      const record = byCallId.get(event.toolCall.toolCallId) ?? recordCall(event.toolCall);
      if (event.toolOutput.type === "tool-result") {
        record.output = event.toolOutput.output;
        record.status = isToolResultError(record.output) ? "failed" : "completed";
      } else {
        record.error = event.toolOutput.error instanceof Error
          ? event.toolOutput.error.message
          : String(event.toolOutput.error);
        record.status = "failed";
      }
      byCallId.delete(event.toolCall.toolCallId);
    },
  };
}

export type ToolTrace = ReturnType<typeof createToolTrace>;
