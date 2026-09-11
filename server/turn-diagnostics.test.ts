import { simulateReadableStream } from "ai";
import { describe, expect, it } from "vitest";
import { createDiagnosticUIStream } from "./turn-diagnostics.js";

async function collectStream(stream: ReadableStream<unknown>) {
  const chunks: unknown[] = [];
  for await (const chunk of stream) chunks.push(chunk);
  return chunks;
}

describe("Diagnostic UI stream", () => {
  it("returns a useful, safe message when the model stream fails", async () => {
    const chunks = await collectStream(
      createDiagnosticUIStream({
        stream: simulateReadableStream({
          chunks: [
            {
              type: "error" as const,
              error: new Error("upstream connection reset"),
            },
          ],
        }),
        model: "test-model",
        contextWarning: false,
      }),
    );

    expect(JSON.stringify(chunks)).toContain(
      "The model stream stopped before the Coding Agent could finish. Retry the Agent Turn; completed Tool Calls are preserved above.",
    );
  });
});
