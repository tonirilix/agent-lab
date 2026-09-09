import {
  mkdtemp,
  mkdir,
  readFile,
  rm,
  symlink,
  writeFile,
} from "node:fs/promises";
import { createHash } from "node:crypto";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { simulateReadableStream } from "ai";
import { MockLanguageModelV4 } from "ai/test";
import { afterEach, describe, expect, it } from "vitest";
import { createAgentSession, MAX_AGENT_STEPS } from "./agent-session.js";
import { resolveWorkspaceRoot } from "./workspace-root.js";

const temporaryWorkspaces: string[] = [];
const usage = {
  inputTokens: {
    total: 5,
    noCache: 5,
    cacheRead: undefined,
    cacheWrite: undefined,
  },
  outputTokens: { total: 4, text: 4, reasoning: undefined },
};

function fingerprint(content: string) {
  return createHash("sha256").update(content).digest("hex");
}

async function workspaceWithSource() {
  const workspace = await mkdtemp(join(tmpdir(), "agent-lab-session-"));
  temporaryWorkspaces.push(workspace);
  await mkdir(join(workspace, "src"));
  await writeFile(
    join(workspace, "src", "tasks.ts"),
    "export const tasks = ['learn'];\n",
  );
  return workspace;
}

async function collectStream(stream: ReadableStream<unknown>) {
  const chunks: unknown[] = [];
  for await (const chunk of stream) chunks.push(chunk);
  return chunks;
}

async function runSingleTool(
  workspace: string,
  toolName: string,
  input: Record<string, unknown>,
) {
  let modelStep = 0;
  const model = new MockLanguageModelV4({
    doStream: async () => {
      modelStep += 1;
      if (modelStep === 1) {
        return {
          stream: simulateReadableStream({
            chunks: [
              {
                type: "tool-call" as const,
                toolCallId: "tool-1",
                toolName,
                input: JSON.stringify(input),
              },
              {
                type: "finish" as const,
                finishReason: {
                  unified: "tool-calls" as const,
                  raw: undefined,
                },
                logprobs: undefined,
                usage,
              },
            ],
          }),
        };
      }
      return {
        stream: simulateReadableStream({
          chunks: [
            { type: "text-start" as const, id: "text-1" },
            {
              type: "text-delta" as const,
              id: "text-1",
              delta: "Inspection complete.",
            },
            { type: "text-end" as const, id: "text-1" },
            {
              type: "finish" as const,
              finishReason: { unified: "stop" as const, raw: undefined },
              logprobs: undefined,
              usage,
            },
          ],
        }),
      };
    },
  });
  const session = await createAgentSession({
    model,
    workspace: await resolveWorkspaceRoot(workspace),
  });
  const chunks = await collectStream(
    await session.startTurn([
      {
        id: "user-1",
        role: "user",
        parts: [{ type: "text", text: "Inspect the Workspace" }],
      },
    ]),
  );
  return { model, trace: JSON.stringify(chunks) };
}

afterEach(async () => {
  await Promise.all(
    temporaryWorkspaces.splice(0).map((workspace) =>
      rm(workspace, { recursive: true, force: true }),
    ),
  );
});

describe("Agent session", () => {
  it("executes a Workspace Tool and returns its exact result to the model and Tool Trace", async () => {
    const workspace = await workspaceWithSource();
    let modelStep = 0;
    const model = new MockLanguageModelV4({
      doStream: async () => {
        modelStep += 1;
        if (modelStep === 1) {
          return {
            stream: simulateReadableStream({
              chunks: [
                {
                  type: "tool-call" as const,
                  toolCallId: "read-1",
                  toolName: "readFile",
                  input: JSON.stringify({ path: "src/tasks.ts" }),
                },
                {
                  type: "finish" as const,
                  finishReason: {
                    unified: "tool-calls" as const,
                    raw: undefined,
                  },
                  logprobs: undefined,
                  usage,
                },
              ],
            }),
          };
        }
        return {
          stream: simulateReadableStream({
            chunks: [
              { type: "text-start" as const, id: "text-1" },
              {
                type: "text-delta" as const,
                id: "text-1",
                delta: "I found the task list.",
              },
              { type: "text-end" as const, id: "text-1" },
              {
                type: "finish" as const,
                finishReason: { unified: "stop" as const, raw: undefined },
                logprobs: undefined,
                usage,
              },
            ],
          }),
        };
      },
    });
    const session = await createAgentSession({
      model,
      workspace: await resolveWorkspaceRoot(workspace),
    });

    const chunks = await collectStream(
      await session.startTurn([
        {
          id: "user-1",
          role: "user",
          parts: [{ type: "text", text: "Inspect the task list" }],
        },
      ]),
    );
    const trace = JSON.stringify(chunks);

    expect(model.doStreamCalls).toHaveLength(2);
    expect(JSON.stringify(model.doStreamCalls[0]?.tools)).not.toContain(
      "proposeChangeSet",
    );
    expect(trace).toContain('"toolName":"readFile"');
    expect(trace).toContain("export const tasks = ['learn'];");
    expect(trace).toContain("I found the task list.");
    expect(JSON.stringify(model.doStreamCalls[1]?.prompt)).toContain(
      "export const tasks = ['learn'];",
    );
  });

  it("stops a Tool loop at the Agent Turn step Safety Limit", async () => {
    const workspace = await workspaceWithSource();
    let modelStep = 0;
    const model = new MockLanguageModelV4({
      doStream: async () => {
        modelStep += 1;
        return {
          stream: simulateReadableStream({
            chunks: [
              {
                type: "tool-call" as const,
                toolCallId: `list-${modelStep}`,
                toolName: "listFiles",
                input: "{}",
              },
              {
                type: "finish" as const,
                finishReason: {
                  unified: "tool-calls" as const,
                  raw: undefined,
                },
                logprobs: undefined,
                usage,
              },
            ],
          }),
        };
      },
    });
    const session = await createAgentSession({
      model,
      workspace: await resolveWorkspaceRoot(workspace),
    });

    await collectStream(
      await session.startTurn([
        {
          id: "user-1",
          role: "user",
          parts: [{ type: "text", text: "Keep listing forever" }],
        },
      ]),
    );

    expect(model.doStreamCalls).toHaveLength(MAX_AGENT_STEPS);
  });

  it("returns bounded inspection failures and truncation through the Tool Trace", async () => {
    const workspace = await workspaceWithSource();
    const outside = await mkdtemp(join(tmpdir(), "agent-lab-session-outside-"));
    temporaryWorkspaces.push(outside);
    await writeFile(join(outside, "outside.ts"), "export const outside = true;\n");
    await symlink(join(outside, "outside.ts"), join(workspace, "escape.ts"));
    await writeFile(join(workspace, ".env"), "TOKEN=secret\n");
    await writeFile(join(workspace, "large.txt"), "x".repeat(256 * 1024 + 1));
    await writeFile(
      join(workspace, "src", "many.ts"),
      Array.from({ length: 225 }, (_, index) => `const hit${index} = 'needle';`).join(
        "\n",
      ),
    );

    for (const [path, expectedError] of [
      ["../outside.ts", "escapes the Workspace"],
      ["escape.ts", "symlink"],
      [".env", "Sensitive file"],
      ["large.txt", "Safety Limit"],
    ]) {
      const { trace, model } = await runSingleTool(workspace, "readFile", {
        path,
      });
      expect(trace).toContain('"ok":false');
      expect(trace).toContain(expectedError);
      expect(JSON.stringify(model.doStreamCalls[1]?.prompt)).toContain(
        expectedError,
      );
    }

    const { trace, model } = await runSingleTool(workspace, "searchCode", {
      query: "needle",
    });
    expect(trace).toContain('"truncated":true');
    expect(trace).toContain('"limit":200');
    expect(JSON.stringify(model.doStreamCalls[1]?.prompt)).toContain(
      '"truncated":true',
    );
  });

  it("does not execute a subsequent Tool Call after cancellation", async () => {
    const workspace = await workspaceWithSource();
    let modelStep = 0;
    const model = new MockLanguageModelV4({
      doStream: async () => {
        modelStep += 1;
        const toolName = modelStep === 1 ? "listFiles" : "readFile";
        const input = modelStep === 1 ? "{}" : '{"path":"src/tasks.ts"}';
        return {
          stream: simulateReadableStream({
            initialDelayInMs: modelStep === 1 ? null : 10_000,
            chunks: [
              {
                type: "tool-call" as const,
                toolCallId: `tool-${modelStep}`,
                toolName,
                input,
              },
              {
                type: "finish" as const,
                finishReason: {
                  unified: "tool-calls" as const,
                  raw: undefined,
                },
                logprobs: undefined,
                usage,
              },
            ],
          }),
        };
      },
    });
    const session = await createAgentSession({
      model,
      workspace: await resolveWorkspaceRoot(workspace),
    });
    const abortController = new AbortController();
    const stream = await session.startTurn(
      [
        {
          id: "user-1",
          role: "user",
          parts: [{ type: "text", text: "Inspect repeatedly" }],
        },
      ],
      abortController.signal,
    );
    const reader = stream.getReader();
    const received: unknown[] = [];

    while (true) {
      const chunk = await reader.read();
      if (chunk.done) break;
      received.push(chunk.value);
      if (JSON.stringify(chunk.value).includes('"type":"tool-output-available"')) {
        break;
      }
    }
    abortController.abort();
    await reader.cancel();

    expect(JSON.stringify(received)).toContain('"toolName":"listFiles"');
    expect(JSON.stringify(received)).not.toContain('"toolName":"readFile"');
    expect(model.doStreamCalls.length).toBeLessThanOrEqual(2);
  });

  it("prepares and rejects a Change Set only in an explicit Proposal Request", async () => {
    const workspace = await workspaceWithSource();
    const original = "export const tasks = ['learn'];\n";
    let modelCall = 0;
    const model = new MockLanguageModelV4({
      doStream: async () => {
        modelCall += 1;
        if (modelCall === 1) {
          return {
            stream: simulateReadableStream({
              chunks: [
                { type: "text-start" as const, id: "discussion" },
                {
                  type: "text-delta" as const,
                  id: "discussion",
                  delta: "We can add a second task without writing yet.",
                },
                { type: "text-end" as const, id: "discussion" },
                {
                  type: "finish" as const,
                  finishReason: { unified: "stop" as const, raw: undefined },
                  logprobs: undefined,
                  usage,
                },
              ],
            }),
          };
        }
        return {
          stream: simulateReadableStream({
            chunks: [
              {
                type: "tool-call" as const,
                toolCallId: "proposal-1",
                toolName: "proposeChangeSet",
                input: JSON.stringify({
                  summary: "Add a second task",
                  operations: [
                    {
                      kind: "modify",
                      path: "src/tasks.ts",
                      originalFingerprint: createHash("sha256")
                        .update(original)
                        .digest("hex"),
                      content: "export const tasks = ['learn', 'build'];\n",
                    },
                  ],
                }),
              },
              {
                type: "finish" as const,
                finishReason: {
                  unified: "tool-calls" as const,
                  raw: undefined,
                },
                logprobs: undefined,
                usage,
              },
            ],
          }),
        };
      },
    });
    const session = await createAgentSession({
      model,
      workspace: await resolveWorkspaceRoot(workspace),
    });

    const discussion = await collectStream(
      await session.startTurn([
        {
          id: "user-1",
          role: "user",
          parts: [{ type: "text", text: "Could we add another task?" }],
        },
      ]),
    );
    expect(JSON.stringify(discussion)).toContain("without writing yet");
    expect(JSON.stringify(model.doStreamCalls[0]?.tools)).not.toContain(
      "proposeChangeSet",
    );
    expect(await readFile(join(workspace, "src", "tasks.ts"), "utf8")).toBe(
      original,
    );

    const trace = JSON.stringify(
      await collectStream(
        await session.startTurn(
          [
            {
              id: "user-1",
              role: "user",
              parts: [{ type: "text", text: "We agreed on a second task." }],
            },
          ],
          undefined,
          { proposalRequested: true },
        ),
      ),
    );
    const pending = session.getPendingChangeSet();

    expect(JSON.stringify(model.doStreamCalls[1]?.tools)).toContain(
      "proposeChangeSet",
    );
    expect(trace).toContain("Add a second task");
    expect(trace).toContain("--- a/src/tasks.ts");
    expect(pending?.status).toBe("pending");
    expect(await readFile(join(workspace, "src", "tasks.ts"), "utf8")).toBe(
      original,
    );

    await session.rejectChangeSet(pending!.id, "Keep the example smaller.");
    expect(session.getPendingChangeSet()).toBeNull();
    expect(await readFile(join(workspace, "src", "tasks.ts"), "utf8")).toBe(
      original,
    );
  });

  it("returns malformed Change Set fields as a visible Tool error and accepts a corrected proposal", async () => {
    const workspace = await workspaceWithSource();
    const original = "export const tasks = ['learn'];\n";
    let modelCall = 0;
    const model = new MockLanguageModelV4({
      doStream: async () => {
        modelCall += 1;
        const operation =
          modelCall === 1
            ? {
                kind: "delete",
                path: "src/tasks.ts",
                originalFingerprint: fingerprint(original),
                content: "delete operations must not carry content",
              }
            : {
                kind: "modify",
                path: "src/tasks.ts",
                originalFingerprint: fingerprint(original),
                content: "export const tasks = ['learn', 'correct'];\n",
              };
        return {
          stream: simulateReadableStream({
            chunks: [
              {
                type: "tool-call" as const,
                toolCallId: `proposal-${modelCall}`,
                toolName: "proposeChangeSet",
                input: JSON.stringify({
                  summary: modelCall === 1 ? "Malformed" : "Corrected",
                  operations: [operation],
                }),
              },
              {
                type: "finish" as const,
                finishReason: {
                  unified: "tool-calls" as const,
                  raw: undefined,
                },
                logprobs: undefined,
                usage,
              },
            ],
          }),
        };
      },
    });
    const session = await createAgentSession({
      model,
      workspace: await resolveWorkspaceRoot(workspace),
    });

    const trace = JSON.stringify(
      await collectStream(
        await session.startTurn(
          [
            {
              id: "user-1",
              role: "user",
              parts: [{ type: "text", text: "Prepare the agreed change." }],
            },
          ],
          undefined,
          { proposalRequested: true },
        ),
      ),
    );

    expect(model.doStreamCalls).toHaveLength(2);
    expect(trace).toContain('"code":"invalid_change_set"');
    expect(trace).toContain("Unrecognized key");
    expect(session.getPendingChangeSet()?.summary).toBe("Corrected");
    expect(await readFile(join(workspace, "src", "tasks.ts"), "utf8")).toBe(
      original,
    );
  });
});
