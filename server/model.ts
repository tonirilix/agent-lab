import { createOpenAI } from "@ai-sdk/openai";
import type { LanguageModel } from "ai";
import type { AgentConfiguration } from "./config.js";

export function createConfiguredModel(
  config: AgentConfiguration,
): LanguageModel | null {
  if (config.status !== "ready" || !config.openAiApiKey) {
    return null;
  }

  return createOpenAI({ apiKey: config.openAiApiKey })(config.model);
}
