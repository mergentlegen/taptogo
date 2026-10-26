import { z } from "zod";

import { commentSubjectSchema, ticketStatusSchema } from "@/features/support/schemas";
import { redirectTargetTypeSchema } from "@/features/targets/schemas";
import { emailSchema, idSchema, textSchema } from "@/lib/schemas";

const optionalId = z.union([idSchema, z.literal("").transform(() => null), z.null()]);

export const createTargetSchema = z.object({
  organizationId: idSchema,
  locationId: optionalId,
  type: redirectTargetTypeSchema,
  url: z.string().trim().min(1).max(2048),
});
export type CreateTargetInput = z.input<typeof createTargetSchema>;
export const setTargetVerifiedSchema = z.object({ targetId: idSchema, isVerified: z.boolean() });
export const checkUrlSchema = z.object({ url: z.string().trim().max(2048) });

export const syncLocationSchema = z.object({ locationId: idSchema });

export const updateTicketSchema = z.object({
  ticketId: idSchema,
  status: ticketStatusSchema.optional(),
  assigneeId: optionalId.optional(),
});
export const addCommentSchema = z.object({
  subjectType: commentSubjectSchema,
  subjectId: idSchema,
  body: textSchema(2000),
});

export const createStaffSchema = z.object({
  email: emailSchema,
  name: textSchema(120),
});
export type CreateStaffInput = z.input<typeof createStaffSchema>;
export const setStaffStatusSchema = z.object({ userId: idSchema, status: z.enum(["ACTIVE", "BLOCKED"]) });

/** Settings form: domains come as one-per-line text. */
export const platformSettingsFormSchema = z.object({
  domains: z.string().max(5000),
});
export type PlatformSettingsFormInput = z.input<typeof platformSettingsFormSchema>;

export const impersonateSchema = z.object({ organizationId: idSchema });
