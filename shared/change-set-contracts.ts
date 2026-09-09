import { z } from "zod";

export const MAX_CHANGE_OPERATIONS = 20;
export const MAX_CHANGE_SET_BYTES = 1024 * 1024;

const relativePathSchema = z.string().min(1).max(4_096);
const fingerprintSchema = z.string().regex(/^[a-f0-9]{64}$/);

export const changeOperationSchema = z.discriminatedUnion("kind", [
  z.object({
    kind: z.literal("create"),
    path: relativePathSchema,
    content: z.string(),
  }).strict(),
  z.object({
    kind: z.literal("modify"),
    path: relativePathSchema,
    originalFingerprint: fingerprintSchema,
    content: z.string(),
  }).strict(),
  z.object({
    kind: z.literal("delete"),
    path: relativePathSchema,
    originalFingerprint: fingerprintSchema,
  }).strict(),
]);

export const changeSetProposalSchema = z
  .object({
    summary: z.string().trim().min(1).max(500),
    operations: z.array(changeOperationSchema).min(1).max(MAX_CHANGE_OPERATIONS),
  })
  .strict();

export const pendingChangeSetSchema = changeSetProposalSchema.extend({
  id: z.string(),
  status: z.literal("pending"),
  files: z.array(
    z.object({
      kind: z.enum(["create", "modify", "delete"]),
      path: relativePathSchema,
      diff: z.string(),
    }),
  ),
  warnings: z.array(z.string()),
});

export type ChangeOperation = z.infer<typeof changeOperationSchema>;
export type ChangeSetProposal = z.infer<typeof changeSetProposalSchema>;
export type PendingChangeSet = z.infer<typeof pendingChangeSetSchema>;
