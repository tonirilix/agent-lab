import { serve } from "@hono/node-server";
import { resolve } from "node:path";
import { createApp } from "./app.js";
import { resolveAgentConfiguration } from "./config.js";

function readArgument(name: string): string | undefined {
  const index = process.argv.indexOf(`--${name}`);
  return index >= 0 ? process.argv[index + 1] : undefined;
}

const workspace =
  readArgument("workspace") ??
  process.env.AGENT_LAB_WORKSPACE ??
  resolve("examples/task-list");
const serveClient = process.argv.includes("--serve-client");
const port = Number(process.env.AGENT_LAB_PORT ?? 8787);
const browserPort = serveClient ? port : 5173;
const browserOrigins = process.env.AGENT_LAB_BROWSER_ORIGIN
  ? [process.env.AGENT_LAB_BROWSER_ORIGIN]
  : [
      `http://127.0.0.1:${browserPort}`,
      `http://localhost:${browserPort}`,
    ];

try {
  const config = await resolveAgentConfiguration({
    workspace,
    openAiApiKey: process.env.OPENAI_API_KEY,
    openAiModel: process.env.OPENAI_MODEL,
  });
  const app = createApp(config, {
    allowedOrigins: browserOrigins,
    clientRoot: serveClient ? resolve("dist") : undefined,
  });

  serve({
    fetch: app.fetch,
    hostname: "127.0.0.1",
    port,
  });

  console.log(`Agent Lab is running at http://127.0.0.1:${port}`);
  console.log(
    `Workspace: ${
      config.status === "invalid-workspace"
        ? config.requestedWorkspace
        : config.workspace.canonicalPath
    }`,
  );
} catch (error) {
  console.error(error instanceof Error ? error.message : String(error));
  process.exitCode = 1;
}
