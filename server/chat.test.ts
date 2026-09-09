import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { simulateReadableStream } from "ai";
import { MockLanguageModelV4 } from "ai/test";
import { afterEach, describe, expect, it, vi } from "vitest";
import { createApp } from "./app.js";
import { resolveAgentConfiguration } from "./config.js";

const temporaryWorkspaces: string[] = [];

afterEach(async () => {
  await Promise.all(
    temporaryWorkspaces.splice(0).map((workspace) =>
      rm(workspace, { recursive: true, force: true }),
    ),
  );
});

describe("OpenAI conversation", () => {
  it("keeps the production route unavailable when the server has no API key", async () => {
    const workspace = await mkdtemp(join(tmpdir(), "agent-lab-chat-"));
    temporaryWorkspaces.push(workspace);
    const config = await resolveAgentConfiguration({ workspace });
    const app = createApp(config);

    const response = await app.request("/api/chat", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ messages: [] }),
    });

    expect(response.status).toBe(503);
    expect(await response.json()).toEqual({
      error: "OPENAI_API_KEY is required to start an Agent Turn.",
    });
  });

  it("streams a Coding Agent response through the chat boundary", async () => {
    const workspace = await mkdtemp(join(tmpdir(), "agent-lab-chat-"));
    temporaryWorkspaces.push(workspace);
    const config = await resolveAgentConfiguration({
      workspace,
      openAiApiKey: "test-key",
      openAiModel: "test-model",
    });
    const model = new MockLanguageModelV4({
      doStream: async () => ({
        stream: simulateReadableStream({
          chunks: [
            { type: "text-start", id: "text-1" },
            {
              type: "text-delta",
              id: "text-1",
              delta: "Hello from Agent Lab",
            },
            { type: "text-end", id: "text-1" },
            {
              type: "finish",
              finishReason: { unified: "stop", raw: undefined },
              logprobs: undefined,
              usage: {
                inputTokens: {
                  total: 5,
                  noCache: 5,
                  cacheRead: undefined,
                  cacheWrite: undefined,
                },
                outputTokens: {
                  total: 4,
                  text: 4,
                  reasoning: undefined,
                },
              },
            },
          ],
        }),
      }),
    });
    const app = createApp(config, { model });

    const response = await app.request("/api/chat", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        messages: [
          {
            id: "user-1",
            role: "user",
            parts: [{ type: "text", text: "Say hello" }],
          },
        ],
      }),
    });
    const body = await response.text();

    expect(response.status).toBe(200);
    expect(response.headers.get("content-type")).toContain("text/event-stream");
    expect(body).toContain("Hello from Agent Lab");
    expect(model.doStreamCalls).toHaveLength(1);
  });

  it("rejects a concurrent Agent Turn until the active stream is cancelled", async () => {
    const workspace = await mkdtemp(join(tmpdir(), "agent-lab-chat-"));
    temporaryWorkspaces.push(workspace);
    const config = await resolveAgentConfiguration({
      workspace,
      openAiApiKey: "test-key",
    });
    const model = new MockLanguageModelV4({
      doStream: async () => ({
        stream: simulateReadableStream({
          initialDelayInMs: 10_000,
          chunks: [],
        }),
      }),
    });
    const app = createApp(config, { model });
    const turnBody = JSON.stringify({
      messages: [
        {
          id: "user-1",
          role: "user",
          parts: [{ type: "text", text: "Wait" }],
        },
      ],
    });

    const activeResponse = await app.request("/api/chat", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: turnBody,
    });
    const concurrentResponse = await app.request("/api/chat", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: turnBody,
    });

    expect(activeResponse.status).toBe(200);
    expect(concurrentResponse.status).toBe(409);
    expect(await concurrentResponse.json()).toEqual({
      error: "An Agent Turn is already active.",
    });

    await activeResponse.body?.cancel();
  });

  it("forwards cancellation to the active model request", async () => {
    const workspace = await mkdtemp(join(tmpdir(), "agent-lab-chat-"));
    temporaryWorkspaces.push(workspace);
    const config = await resolveAgentConfiguration({
      workspace,
      openAiApiKey: "test-key",
    });
    let modelSignal: AbortSignal | undefined;
    const model = new MockLanguageModelV4({
      doStream: async (options) => {
        modelSignal = options.abortSignal;
        return {
          stream: simulateReadableStream({
            initialDelayInMs: 10_000,
            chunks: [],
          }),
        };
      },
    });
    const app = createApp(config, { model });
    const controller = new AbortController();
    const request = new Request("http://localhost/api/chat", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        messages: [
          {
            id: "user-1",
            role: "user",
            parts: [{ type: "text", text: "Wait" }],
          },
        ],
      }),
      signal: controller.signal,
    });

    const response = await app.request(request);
    const reader = response.body!.getReader();
    const pendingRead = reader.read();
    await vi.waitFor(() => expect(modelSignal).toBeDefined());
    controller.abort();
    await reader.cancel();
    await pendingRead;

    expect(modelSignal?.aborted).toBe(true);
    expect(model.doStreamCalls).toHaveLength(1);
  });
});
