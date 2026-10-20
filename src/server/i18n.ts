import { createTranslator } from "next-intl";

import { defaultLocale } from "@/i18n/config";
import messages from "@/i18n/messages/ru.json";
import { AppError, type ErrorCode } from "@/server/errors";

/** User-facing service errors, from the same dictionary as the UI; usable outside a request. */
const translate = createTranslator({ locale: defaultLocale, messages, namespace: "serverErrors" });

export type ServerErrorKey = Parameters<typeof translate>[0];

export function serviceError(code: ErrorCode, key: ServerErrorKey): AppError {
  return new AppError(code, translate(key));
}

/** A row is missing or outside the caller's organization. `entity` goes to `cause`, for logs only. */
export function notFoundError(entity: string): AppError {
  const error = serviceError("NOT_FOUND", "notFound");
  error.cause = entity;
  return error;
}

const translateText = createTranslator({ locale: defaultLocale, messages, namespace: "serverText" });

/** Non-error texts generated on the server (e.g. ticket subjects). */
export const serverText = translateText;
