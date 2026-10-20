import { z } from "zod";

import { leadStatusSchema } from "@/features/leads/schemas";
import { planConfigSchema } from "@/features/platform/schemas";
import { paymentMethodSchema, planSchema } from "@/features/subscriptions/schemas";
import { commentSubjectSchema, ticketStatusSchema } from "@/features/support/schemas";
import { redirectTargetTypeSchema } from "@/features/targets/schemas";
import { platformRoleSchema } from "@/features/users/schemas";
import { dateSchema, emailSchema, idSchema, textSchema } from "@/lib/schemas";

const optionalId = z.union([idSchema, z.literal("").transform(() => null), z.null()]);
const optionalText = (max: number) =>
  z
    .string()
    .trim()
    .max(max)
    .transform((v) => (v === "" ? null : v));

export const createTargetSchema = z.object({
  organizationId: idSchema,
  locationId: optionalId,
  type: redirectTargetTypeSchema,
  url: z.string().trim().min(1).max(2048),
});
export type CreateTargetInput = z.input<typeof createTargetSchema>;
export const setTargetVerifiedSchema = z.object({ targetId: idSchema, isVerified: z.boolean() });
export const checkUrlSchema = z.object({ url: z.string().trim().max(2048) });

export const recordPaymentSchema = z.object({
  organizationId: idSchema,
  amountKzt: z.coerce.number().int().min(1).max(100_000_000),
  method: paymentMethodSchema,
  paidOn: dateSchema,
  months: z.coerce.number().int().min(1).max(24),
  comment: optionalText(500),
});
export type RecordPaymentInput = z.input<typeof recordPaymentSchema>;

export const updateSubscriptionSchema = z.object({
  organizationId: idSchema,
  plan: planSchema,
  cardLimit: z.coerce.number().int().min(0).max(10_000),
  paidUntil: dateSchema,
  trial: z.boolean(),
});
export type UpdateSubscriptionInput = z.input<typeof updateSubscriptionSchema>;

export const syncLocationSchema = z.object({ locationId: idSchema });

export const updateTicketSchema = z.object({
  ticketId: idSchema,
  status: ticketStatusSchema.optional(),
  assigneeId: optionalId.optional(),
});
export const updateLeadSchema = z.object({
  leadId: idSchema,
  status: leadStatusSchema.optional(),
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
  role: platformRoleSchema,
});
export type CreateStaffInput = z.input<typeof createStaffSchema>;
export const setStaffRoleSchema = z.object({ userId: idSchema, role: platformRoleSchema });
export const setStaffStatusSchema = z.object({ userId: idSchema, status: z.enum(["ACTIVE", "BLOCKED"]) });

/** Settings form: domains come as one-per-line text. */
export const platformSettingsFormSchema = z.object({
  domains: z.string().max(5000),
  graceDays: z.coerce.number().int().min(0).max(60),
  plans: z
    .array(
      planConfigSchema.extend({
        cardLimit: z.coerce.number().int().min(1).max(10_000),
        monthlyPriceKzt: z.coerce.number().int().min(0).max(100_000_000),
      }),
    )
    .length(3),
});
export type PlatformSettingsFormInput = z.input<typeof platformSettingsFormSchema>;

export const impersonateSchema = z.object({ organizationId: idSchema });
