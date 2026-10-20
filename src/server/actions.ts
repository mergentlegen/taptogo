import "server-only";

import { getTranslations } from "next-intl/server";
import { unstable_rethrow } from "next/navigation";
import { z } from "zod";

import { AppError, type ErrorCode } from "@/server/errors";

import "@/server/validation-locale";

export type ActionError = {
  code: ErrorCode;
  message: string;
  /** Per-field messages for VALIDATION errors, keyed by form field name. */
  fieldErrors?: Record<string, string[] | undefined>;
};

/** The only shape Server Actions return. Never contains stack traces or internals. */
export type ActionResult<T = null> = { ok: true; data: T } | { ok: false; error: ActionError };

export function actionError(code: ErrorCode, message: string): ActionResult<never> {
  return { ok: false, error: { code, message } };
}

/**
 * Validates input with Zod, runs the handler and converts failures:
 * - Zod issues → VALIDATION with field errors;
 * - AppError → its code and (user-safe) message;
 * - anything else → INTERNAL with a generic message; details go to the server log only.
 * Next.js control flow (redirect, notFound, forbidden) passes through untouched.
 */
export async function runAction<S extends z.ZodType, T>(
  schema: S,
  input: unknown,
  handler: (data: z.output<S>) => Promise<T>,
): Promise<ActionResult<T>> {
  const t = await getTranslations("errors.action");
  const parsed = schema.safeParse(input);
  if (!parsed.success) {
    return {
      ok: false,
      error: {
        code: "VALIDATION",
        message: t("validation"),
        fieldErrors: z.flattenError(parsed.error).fieldErrors as Record<string, string[] | undefined>,
      },
    };
  }

  try {
    return { ok: true, data: await handler(parsed.data) };
  } catch (error) {
    unstable_rethrow(error);
    if (error instanceof AppError) {
      return { ok: false, error: { code: error.code, message: error.message } };
    }
    const reference = crypto.randomUUID().slice(0, 8);
    console.error(`[action:${reference}]`, error);
    return { ok: false, error: { code: "INTERNAL", message: t("internal", { reference }) } };
  }
}
