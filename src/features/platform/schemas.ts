import { z } from "zod";

import { planSchema } from "@/features/subscriptions/schemas";
import { kztAmountSchema } from "@/lib/schemas";
import { validationMessage } from "@/lib/validation-messages";

const domainSchema = z
  .string()
  .trim()
  .toLowerCase()
  .regex(/^(?=.{1,253}$)([a-z0-9]([a-z0-9-]{0,61}[a-z0-9])?\.)+[a-z]{2,63}$/, {
    error: validationMessage("domain"),
  });

export const planConfigSchema = z.object({
  plan: planSchema,
  cardLimit: z.int().min(1).max(10_000),
  monthlyPriceKzt: kztAmountSchema,
});
export type PlanConfig = z.infer<typeof planConfigSchema>;

/** Platform-wide settings edited by SUPER_ADMIN. Plans and limits live here, not in code. */
export const platformSettingsSchema = z.object({
  /** Hosts redirect targets may point to (exact match, "www." allowed). */
  allowedRedirectDomains: z.array(domainSchema).min(1).max(50),
  graceDays: z.int().min(0).max(60),
  plans: z.array(planConfigSchema).length(3),
});
export type PlatformSettings = z.infer<typeof platformSettingsSchema>;

export const defaultPlatformSettings: PlatformSettings = {
  allowedRedirectDomains: ["2gis.kz", "2gis.ru", "go.2gis.com", "google.com", "maps.app.goo.gl", "g.page"],
  graceDays: 7,
  plans: [
    { plan: "START", cardLimit: 10, monthlyPriceKzt: 9_900 },
    { plan: "BUSINESS", cardLimit: 30, monthlyPriceKzt: 19_900 },
    { plan: "NETWORK", cardLimit: 100, monthlyPriceKzt: 49_900 },
  ],
};
