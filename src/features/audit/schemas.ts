import { z } from "zod";

import { idSchema, jsonSchema, timestampSchema } from "@/lib/schemas";

/** Append-only. Written by the audit service, never edited or deleted. */
export const auditLogSchema = z.object({
  id: idSchema,
  /** null for system actions (cron jobs, automatic status changes). */
  actorUserId: idSchema.nullable(),
  /** Dotted verb, e.g. "card.update", "auth.sign_in", "impersonation.start". */
  action: z
    .string()
    .regex(/^[a-z_]+(\.[a-z_]+)+$/)
    .max(64),
  entityType: z.string().max(40),
  entityId: z.string().max(64).nullable(),
  organizationId: idSchema.nullable(),
  before: jsonSchema.nullable(),
  after: jsonSchema.nullable(),
  createdAt: timestampSchema,
});
export type AuditLog = z.infer<typeof auditLogSchema>;
