import { Hono } from "hono";
import {
  convertToModelMessages,
  createUIMessageStreamResponse,
  streamText,
  toUIMessageStream,
  type LanguageModel,
  type UIMessage,
} from "ai";
import {
  publicAgentConfiguration,
  type AgentConfiguration,
} from "./config.js";
import { createConfiguredModel } from "./model.js";

type AppDependencies = {
  model?: LanguageModel;
};

function releaseWhenFinished<T>(
  stream: ReadableStream<T>,
  release: () => void,
): ReadableStream<T> {
  const reader = stream.getReader();
  let released = false;
  const releaseOnce = () => {
    if (!released) {
      released = true;
      release();
    }
  };

  return new ReadableStream<T>({
    async pull(controller) {
      try {
        const chunk = await reader.read();
        if (chunk.done) {
          releaseOnce();
          controller.close();
        } else {
          controller.enqueue(chunk.value);
        }
      } catch (error) {
        releaseOnce();
        controller.error(error);
      }
    },
    async cancel(reason) {
      try {
        await reader.cancel(reason);
      } finally {
        releaseOnce();
      }
    },
  });
}

export function createApp(
  config: AgentConfiguration,
  dependencies: AppDependencies = {},
) {
  const app = new Hono();
  const model = dependencies.model ?? createConfiguredModel(config);
  let activeTurn = false;

  app.get("/api/config", (context) =>
    context.json(publicAgentConfiguration(config)),
  );

  app.post("/api/chat", async (context) => {
    if (!model) {
      return context.json(
        {
          error:
            config.status === "invalid-workspace"
              ? config.error
              : "OPENAI_API_KEY is required to start an Agent Turn.",
        },
        503,
      );
    }

    if (activeTurn) {
      return context.json({ error: "An Agent Turn is already active." }, 409);
    }
    activeTurn = true;

    let body: { messages?: UIMessage[] };
    try {
      body = (await context.req.json()) as { messages?: UIMessage[] };
    } catch {
      activeTurn = false;
      return context.json({ error: "Request body must be valid JSON." }, 400);
    }
    if (!Array.isArray(body.messages)) {
      activeTurn = false;
      return context.json({ error: "messages must be an array" }, 400);
    }

    try {
      const result = streamText({
        model,
        instructions:
          "You are the Coding Agent in Agent Lab. Be concise and explain your conclusions. You cannot inspect or modify the Workspace yet.",
        messages: await convertToModelMessages(body.messages),
        abortSignal: context.req.raw.signal,
      });

      return createUIMessageStreamResponse({
        stream: releaseWhenFinished(
          toUIMessageStream({ stream: result.stream }),
          () => {
            activeTurn = false;
          },
        ),
      });
    } catch (error) {
      activeTurn = false;
      throw error;
    }
  });

  return app;
}
