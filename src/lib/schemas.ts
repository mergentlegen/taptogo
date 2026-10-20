import { z } from "zod";

import { validationMessage } from "./validation-messages";

/**
 * Shared building blocks for entity and form schemas. Every free-text field
 * has an explicit length cap so no input can grow unbounded.
 */

export const idSchema = z.uuid();

/** UTC instant, ISO 8601 with "Z" (what Postgres timestamptz returns as JSON). */
export const timestampSchema = z.iso.datetime();

/** Calendar date (YYYY-MM-DD) in the organization's time zone. */
export const dateSchema = z.iso.date();

export const emailSchema = z.string().trim().toLowerCase().pipe(z.email().max(254));

export const textSchema = (max: number) => z.string().trim().min(1).max(max);
export const optionalTextSchema = (max: number) => z.string().trim().max(max).nullable();

/** Kazakhstan mobile/landline numbers in E.164: +7 followed by 10 digits. */
export const phoneSchema = z
  .string()
  .trim()
  .regex(/^\+7\d{10}$/, { error: validationMessage("phoneFormat") });

/** "8 700 123-45-67", "+7 (700) 123 45 67", "77001234567" → "+77001234567"; anything else is left as is. */
export function normalizeKzPhone(value: string): string {
  const compact = value.replace(/[\s().-]/g, "");
  if (/^8\d{10}$/.test(compact)) return `+7${compact.slice(1)}`;
  if (/^7\d{10}$/.test(compact)) return `+${compact}`;
  return compact;
}

/** A phone typed by a person in a free-form field, normalized to E.164 before validation. */
export const phoneInputSchema = z
  .string()
  .trim()
  .min(1)
  .max(32)
  .transform(normalizeKzPhone)
  .pipe(phoneSchema);

/** Optional form field: an empty string becomes null, anything else must pass `schema`. */
export const emptyToNull = <T extends z.ZodType>(schema: T) =>
  z.union([z.literal("").transform(() => null), schema, z.null()]);

/** БИН/ИИН: 12 digits. */
export const binSchema = z.string().regex(/^\d{12}$/, { error: validationMessage("binFormat") });

export function isValidTimeZone(value: string): boolean {
  try {
    new Intl.DateTimeFormat("en-US", { timeZone: value });
    return true;
  } catch {
    return false;
  }
}

export const timeZoneSchema = z
  .string()
  .max(64)
  .refine(isValidTimeZone, { error: validationMessage("timeZone") });

export const httpsUrlSchema = z.url({ protocol: /^https$/ }).max(2048);

export const jsonSchema = z.json();
export type JsonValue = z.infer<typeof jsonSchema>;

/** Amount in whole tenge. */
export const kztAmountSchema = z.int().min(0).max(100_000_000);
