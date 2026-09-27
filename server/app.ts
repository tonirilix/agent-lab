import { Hono, type MiddlewareHandler } from "hono";
import { serveStatic } from "@hono/node-server/serve-static";
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
import {
  ActiveAgentTurnError,
  createAgentSession,
  type AgentSession,
} from "./agent-session.js";
import {
  AgentLifecycleBusyError,
  createAgentLifecycle,
} from "./agent-lifecycle.js";
import {
  ActiveInvestigationError,
  InvestigationRetryError,
  createInvestigationService,
  createModelInvestigationStages,
  createModelInvestigationWorker,
  type InvestigationStages,
  type InvestigationWorkerRunner,
} from "./investigation.js";

type AppDependencies = {
  model?: LanguageModel;
  allowedOrigins?: readonly string[];
  clientRoot?: string;
  investigationWorker?: InvestigationWorkerRunner;
  investigationStages?: InvestigationStages;
};

type ConfiguredAgent = Exclude<AgentConfiguration, { status: "invalid-workspace" }>;

function createAgentRuntime(
  model: LanguageModel,
  config: ConfiguredAgent,
  dependencies: AppDependencies,
) {
  let session: Promise<AgentSession> | null = null;
  const getSession = () => {
    if (session === null) throw new Error("Agent session is unavailable.");
    return session;
  };
  const lifecycle = createAgentLifecycle({
    approve: (id) => getSession().then((current) => current.approveChangeSet(id)),
    reject: (id, feedback) =>
      getSession().then((current) => current.rejectChangeSet(id, feedback)),
  });
  session = createAgentSession({
    model,
    modelName: config.model,
    workspace: config.workspace,
    lifecycle,
  });
  const investigations = createInvestigationService(
    dependencies.investigationWorker ??
      createModelInvestigationWorker(model, config.workspace),
    dependencies.investigationStages ??
      createModelInvestigationStages(model, config.workspace, (input, trace) =>
        getSession().then((current) => current.prepareWorkflowChangeSet(input, trace)),
      ),
    lifecycle,
  );
  return { session, lifecycle, investigations };
}

function requireBrowserOrigin(
  allowedOrigins: readonly string[],
  allowMissingOriginOnGet = false,
): MiddlewareHandler {
  return async (context, next) => {
    const origin = context.req.header("origin");
    const originlessGetAllowed =
      allowMissingOriginOnGet && context.req.method === "GET" && origin === undefined;
    const trustedOrigin = allowedOrigins.includes(origin ?? "");
    if (originlessGetAllowed === false && trustedOrigin === false) {
      return context.json({ error: "Browser origin is not allowed." }, 403);
    }
    await next();
  };
}

export function createApp(
  config: AgentConfiguration,
  dependencies: AppDependencies = {},
) {
  const app = new Hono();
  const model = dependencies.model ?? createConfiguredModel(config);
  const runtime =
    config.status === "invalid-workspace" || model === null
      ? null
      : createAgentRuntime(model, config, dependencies);
  const investigations = runtime?.investigations ?? null;

  if (dependencies.allowedOrigins?.length) {
    const browserOriginGuard = requireBrowserOrigin(dependencies.allowedOrigins);
    app.use("/api/chat", browserOriginGuard);
    app.use("/api/change-sets/*", browserOriginGuard);
    app.use("/api/investigations", browserOriginGuard);
    app.use("/api/investigations/*", requireBrowserOrigin(dependencies.allowedOrigins, true));
  }

  app.get("/api/config", (context) =>
    context.json(publicAgentConfiguration(config)),
  );

  app.post("/api/investigations", async (context) => {
    if (investigations === null) {
      return context.json({ error: "Investigation is unavailable." }, 503);
    }
    let body: unknown;
    try {
      body = await context.req.json();
    } catch {
      return context.json({ error: "Request body must be valid JSON." }, 400);
    }
    const objective =
      body && typeof body === "object" && "objective" in body
        ? body.objective
        : undefined;
    const normalizedObjective = typeof objective === "string" ? objective.trim() : "";
    if (normalizedObjective.length === 0 || normalizedObjective.length > 2_000) {
      return context.json(
        { error: "objective must be 1 to 2000 characters." },
        400,
      );
    }
    try {
      return context.json(investigations.start(normalizedObjective), 201);
    } catch (error) {
      if (error instanceof ActiveInvestigationError) {
        return context.json({ error: error.message }, 409);
      }
      throw error;
    }
  });

  app.get("/api/investigations/:id", (context) => {
    const run = investigations?.get(context.req.param("id"));
    return run
      ? context.json(run)
      : context.json({ error: "Investigation not found." }, 404);
  });

  app.post("/api/investigations/:id/retry", (context) => {
    if (investigations === null) return context.json({ error: "Investigation is unavailable." }, 503);
    try {
      return context.json(investigations.retry(context.req.param("id")));
    } catch (error) {
      if (error instanceof InvestigationRetryError) {
        return context.json({ error: error.message }, error.message === "Investigation not found." ? 404 : 409);
      }
      if (error instanceof ActiveInvestigationError) return context.json({ error: error.message }, 409);
      throw error;
    }
  });

  app.post("/api/chat", async (context) => {
    if (runtime === null) {
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

    let body: {
      messages?: UIMessage[];
      completedChangeSetId?: string;
    };
    try {
      body = (await context.req.json()) as { messages?: UIMessage[] };
    } catch {
      return context.json({ error: "Request body must be valid JSON." }, 400);
    }
    if (Array.isArray(body.messages) === false) {
      return context.json({ error: "messages must be an array" }, 400);
    }

    try {
      return createUIMessageStreamResponse({
        stream: await (await runtime.session).startTurn(
          body.messages,
          context.req.raw.signal,
          {
            completedChangeSetId: body.completedChangeSetId,
          },
        ),
      });
    } catch (error) {
      if (error instanceof ActiveAgentTurnError || error instanceof AgentLifecycleBusyError) {
        return context.json({ error: error.message }, 409);
      }
      throw error;
    }
  });

  app.post("/api/change-sets/:id/reject", async (context) => {
    if (runtime === null) {
      return context.json({ error: "Agent session is unavailable." }, 503);
    }
    let body: { feedback?: unknown };
    try {
      body = (await context.req.json()) as { feedback?: unknown };
    } catch {
      return context.json({ error: "Request body must be valid JSON." }, 400);
    }
    const validFeedback = body.feedback === undefined || typeof body.feedback === "string";
    if (validFeedback === false) {
      return context.json({ error: "feedback must be a string" }, 400);
    }
    const feedback = typeof body.feedback === "string" ? body.feedback : undefined;
    try {
      const result = await runtime.lifecycle.reject(
        context.req.param("id"),
        feedback,
      );
      return context.json(result);
    } catch (error) {
      if (error instanceof Error) {
        return context.json({ error: error.message }, 409);
      }
      throw error;
    }
  });

  app.post("/api/change-sets/:id/approve", async (context) => {
    if (runtime === null) {
      return context.json({ error: "Agent session is unavailable." }, 503);
    }
    try {
      const result = await runtime.lifecycle.approve(
        context.req.param("id"),
      );
      return context.json(result);
    } catch (error) {
      if (error instanceof Error) {
        return context.json({ error: error.message }, 409);
      }
      throw error;
    }
  });

  app.all("/api/*", (context) => context.json({ error: "Not found." }, 404));

  if (dependencies.clientRoot) {
    app.use("*", serveStatic({ root: dependencies.clientRoot }));
    app.get(
      "*",
      serveStatic({ root: dependencies.clientRoot, path: "index.html" }),
    );
  }

  return app;
}
