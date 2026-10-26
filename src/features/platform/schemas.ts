import { z } from "zod";

import { validationMessage } from "@/lib/validation-messages";

const domainSchema = z
  .string()
  .trim()
  .toLowerCase()
  .regex(/^(?=.{1,253}$)([a-z0-9]([a-z0-9-]{0,61}[a-z0-9])?\.)+[a-z]{2,63}$/, {
    error: validationMessage("domain"),
  });

/** Platform-wide settings edited by administrators. */
export const platformSettingsSchema = z.object({
  /** Hosts redirect targets may point to (exact match, "www." allowed). */
  allowedRedirectDomains: z.array(domainSchema).min(1).max(50),
});
export type PlatformSettings = z.infer<typeof platformSettingsSchema>;

export const defaultPlatformSettings: PlatformSettings = {
  allowedRedirectDomains: ["2gis.kz", "2gis.ru", "go.2gis.com", "google.com", "maps.app.goo.gl", "g.page"],
};
