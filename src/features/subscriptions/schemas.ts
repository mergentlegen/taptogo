import { z } from "zod";

import { dateSchema, idSchema, kztAmountSchema, optionalTextSchema, timestampSchema } from "@/lib/schemas";

export const plans = ["START", "BUSINESS", "NETWORK"] as const;
export const planSchema = z.enum(plans);
export type Plan = z.infer<typeof planSchema>;

export const subscriptionStatuses = ["TRIAL", "ACTIVE", "GRACE", "EXPIRED"] as const;
export const subscriptionStatusSchema = z.enum(subscriptionStatuses);
export type SubscriptionStatus = z.infer<typeof subscriptionStatusSchema>;

export const subscriptionSchema = z.object({
  organizationId: idSchema,
  plan: planSchema,
  cardLimit: z.int().min(0).max(10_000),
  /** Last paid day (inclusive), in the organization's time zone. */
  paidUntil: dateSchema,
  /**
   * Stored status. Only TRIAL is meaningful as stored; ACTIVE/GRACE/EXPIRED are
   * always recomputed from paidUntil — see `resolveSubscriptionStatus`.
   */
  status: subscriptionStatusSchema,
});
export type Subscription = z.infer<typeof subscriptionSchema>;

export const paymentMethods = ["KASPI", "BANK_TRANSFER", "CASH"] as const;
export const paymentMethodSchema = z.enum(paymentMethods);
export type PaymentMethod = z.infer<typeof paymentMethodSchema>;

export const paymentSchema = z.object({
  id: idSchema,
  organizationId: idSchema,
  amountKzt: kztAmountSchema,
  paidAt: timestampSchema,
  method: paymentMethodSchema,
  comment: optionalTextSchema(500),
  recordedById: idSchema.nullable(),
});
export type Payment = z.infer<typeof paymentSchema>;
