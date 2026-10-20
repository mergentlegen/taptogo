import { z } from "zod";

import { dateSchema, idSchema, timestampSchema } from "@/lib/schemas";
import { validationMessage } from "@/lib/validation-messages";

export const tapSources = ["NFC", "QR"] as const;
export const tapSourceSchema = z.enum(tapSources);
export type TapSource = z.infer<typeof tapSourceSchema>;

export const deviceTypes = ["MOBILE", "TABLET", "DESKTOP", "UNKNOWN"] as const;
export const deviceTypeSchema = z.enum(deviceTypes);
export type DeviceType = z.infer<typeof deviceTypeSchema>;

export const operatingSystems = ["IOS", "ANDROID", "WINDOWS", "MACOS", "LINUX", "OTHER"] as const;
export const operatingSystemSchema = z.enum(operatingSystems);
export type OperatingSystem = z.infer<typeof operatingSystemSchema>;

/**
 * One tap/scan. Deliberately holds no IP, user agent or visitor identifier —
 * only coarse device facts and the bot/duplicate flags.
 */
export const tapEventSchema = z.object({
  id: idSchema,
  cardId: idSchema,
  organizationId: idSchema,
  locationId: idSchema.nullable(),
  employeeId: idSchema.nullable(),
  occurredAt: timestampSchema,
  source: tapSourceSchema,
  deviceType: deviceTypeSchema,
  os: operatingSystemSchema,
  isBot: z.boolean(),
  isDuplicate: z.boolean(),
});
export type TapEvent = z.infer<typeof tapEventSchema>;

/** Per-card daily rollup. Counts exclude bots and duplicates; nfcTaps + qrTaps = taps. */
export const dailyCardStatSchema = z.object({
  cardId: idSchema,
  organizationId: idSchema,
  locationId: idSchema.nullable(),
  employeeId: idSchema.nullable(),
  /** Calendar date in the organization's time zone. */
  date: dateSchema,
  taps: z.int().min(0),
  uniqueVisitors: z.int().min(0),
  nfcTaps: z.int().min(0),
  qrTaps: z.int().min(0),
});
export type DailyCardStat = z.infer<typeof dailyCardStatSchema>;

/** Dashboard filters; lives in the URL (?from=&to=&location=&employee=&card=). */
export const analyticsFilterSchema = z
  .object({
    from: dateSchema,
    to: dateSchema,
    locationId: idSchema.optional(),
    employeeId: idSchema.optional(),
    cardId: idSchema.optional(),
  })
  .refine((f) => f.from <= f.to, { error: validationMessage("periodOrder"), path: ["from"] });
export type AnalyticsFilter = z.infer<typeof analyticsFilterSchema>;
