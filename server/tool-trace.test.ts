import { describe, expect, it } from "vitest";
import type { ToolTraceRecord } from "../shared/tool-trace.js";
import { createToolTrace } from "./tool-trace.js";

type StartEvent = Parameters<ReturnType<typeof createToolTrace>["onStart"]>[0];
type EndEvent = Parameters<ReturnType<typeof createToolTrace>["onEnd"]>[0];

function call(id: string, name: string, input: unknown) {
  return { toolCallId: id, toolName: name, input };
}

function startEvent(toolCall: ReturnType<typeof call>): StartEvent {
  return { toolCall } as StartEvent;
}

function endEvent(toolCall: ReturnType<typeof call>, toolOutput: unknown): EndEvent {
  return { toolCall, toolOutput } as EndEvent;
}

describe("Tool Trace", () => {
  it("keeps Tool Calls in start order with the exact bounded results", () => {
    const records: ToolTraceRecord[] = [];
    const trace = createToolTrace(records);
    const first = call("first", "readFile", { path: "src/tasks.ts" });
    const second = call("second", "searchCode", { query: "priority" });
    trace.onStart(startEvent(first));
    trace.onStart(startEvent(second));

    expect(records.map((record) => record.name)).toEqual(["readFile", "searchCode"]);
    expect(records[0]).toMatchObject({
      status: "running",
      input: { path: "src/tasks.ts" },
    });
    trace.onEnd(endEvent(second, {
      type: "tool-result",
      output: { ok: true, result: { matches: [] } },
    }));
    trace.onEnd(endEvent(first, {
      type: "tool-result",
      output: { ok: true, result: "bounded file contents" },
    }));
    expect(records[0]).toMatchObject({
      status: "completed",
      output: { ok: true, result: "bounded file contents" },
    });
    expect(records[1]).toMatchObject({
      status: "completed",
      output: { ok: true, result: { matches: [] } },
    });
  });

  it("records structured tool failures and thrown errors", () => {
    const records: ToolTraceRecord[] = [];
    const trace = createToolTrace(records);
    const denied = call("denied", "readFile", { path: "../secret" });
    const interrupted = call("interrupted", "searchCode", { query: "priority" });
    trace.onStart(startEvent(denied));
    trace.onEnd(endEvent(denied, {
      type: "tool-result",
      output: { ok: false, error: { code: "workspace_access_denied" } },
    }));
    trace.onStart(startEvent(interrupted));
    trace.onEnd(endEvent(interrupted, {
      type: "tool-error",
      error: new Error("Search interrupted"),
    }));

    expect(records[0]).toMatchObject({
      status: "failed",
      output: { ok: false, error: { code: "workspace_access_denied" } },
    });
    expect(records[1]).toMatchObject({ status: "failed", error: "Search interrupted" });
  });
});
