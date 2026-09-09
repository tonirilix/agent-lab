import { Hono } from "hono";
import {
  publicAgentConfiguration,
  type AgentConfiguration,
} from "./config.js";

export function createApp(config: AgentConfiguration) {
  const app = new Hono();

  app.get("/api/config", (context) =>
    context.json(publicAgentConfiguration(config)),
  );

  return app;
}
