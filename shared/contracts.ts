import { z } from "zod";

const configuredAgentSchema = z.object({
  status: z.enum(["ready", "needs-api-key"]),
  workspace: z.string(),
  provider: z.literal("OpenAI"),
  model: z.string(),
  git: z
    .object({
      branch: z.string(),
      dirty: z.boolean(),
    })
    .nullable(),
  agent: z.object({
    instructions: z.array(z.string()),
    turnInstructions: z.array(z.string()),
    tools: z.array(z.string()),
    safetyLimits: z.object({
      maxSteps: z.number(),
      maxFileBytes: z.number(),
      maxSearchMatches: z.number(),
      maxChangeOperations: z.number(),
      maxChangeSetBytes: z.number(),
      contextWarningCharacters: z.number(),
    }),
    telemetry: z.literal(false),
  }),
});

const invalidWorkspaceSchema = z.object({
  status: z.literal("invalid-workspace"),
  requestedWorkspace: z.string(),
  provider: z.literal("OpenAI"),
  model: z.string(),
  git: z.null(),
  error: z.string(),
});

export const publicAgentConfigurationSchema = z.discriminatedUnion("status", [
  configuredAgentSchema,
  invalidWorkspaceSchema,
]);

export type PublicAgentConfiguration = z.infer<
  typeof publicAgentConfigurationSchema
>;
