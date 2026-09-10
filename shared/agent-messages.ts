import type { UIMessage } from "ai";
import { z } from "zod";

export const turnDiagnosticsSchema = z.object({
  status: z.enum(["completed", "stopped", "failed"]),
  durationMs: z.number().nonnegative(),
  stepCount: z.number().int().nonnegative(),
  toolCallCount: z.number().int().nonnegative(),
  model: z.string(),
  usage: z.object({
    inputTokens: z.number().nonnegative().nullable(),
    outputTokens: z.number().nonnegative().nullable(),
    totalTokens: z.number().nonnegative().nullable(),
  }),
  contextWarning: z.boolean(),
});

export type TurnDiagnostics = z.infer<typeof turnDiagnosticsSchema>;
export type AgentUIMessage = UIMessage<TurnDiagnostics>;
