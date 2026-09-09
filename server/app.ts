import { Hono } from "hono";
import {
  createUIMessageStreamResponse,
  type LanguageModel,
  type UIMessage,
} from "ai";
import {
  publicAgentConfiguration,
  type AgentConfiguration,
} from "./config.js";
import { createConfiguredModel } from "./model.js";
import { ActiveAgentTurnError, createAgentSession } from "./agent-session.js";

type AppDependencies = {
  model?: LanguageModel;
};

export function createApp(
  config: AgentConfiguration,
  dependencies: AppDependencies = {},
) {
  const app = new Hono();
  const model = dependencies.model ?? createConfiguredModel(config);
  const agentSession =
    model && config.status !== "invalid-workspace"
      ? createAgentSession({ model, workspace: config.workspace })
      : null;

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

    let body: { messages?: UIMessage[]; proposalRequested?: boolean };
    try {
      body = (await context.req.json()) as { messages?: UIMessage[] };
    } catch {
      return context.json({ error: "Request body must be valid JSON." }, 400);
    }
    if (!Array.isArray(body.messages)) {
      return context.json({ error: "messages must be an array" }, 400);
    }

    try {
      return createUIMessageStreamResponse({
        stream: await (await agentSession!).startTurn(
          body.messages,
          context.req.raw.signal,
          { proposalRequested: body.proposalRequested === true },
        ),
      });
    } catch (error) {
      if (error instanceof ActiveAgentTurnError) {
        return context.json({ error: error.message }, 409);
      }
      throw error;
    }
  });

  app.post("/api/change-sets/:id/reject", async (context) => {
    if (!agentSession) {
      return context.json({ error: "Agent session is unavailable." }, 503);
    }
    let body: { feedback?: unknown };
    try {
      body = (await context.req.json()) as { feedback?: unknown };
    } catch {
      return context.json({ error: "Request body must be valid JSON." }, 400);
    }
    if (body.feedback !== undefined && typeof body.feedback !== "string") {
      return context.json({ error: "feedback must be a string" }, 400);
    }
    try {
      return context.json(
        await (await agentSession).rejectChangeSet(
          context.req.param("id"),
          body.feedback,
        ),
      );
    } catch (error) {
      if (error instanceof Error) {
        return context.json({ error: error.message }, 409);
      }
      throw error;
    }
  });

  return app;
}
