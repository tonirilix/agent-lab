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
