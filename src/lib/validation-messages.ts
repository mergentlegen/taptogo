import { z } from "zod";

import type messages from "@/i18n/messages/ru.json";

/**
 * Validation messages through next-intl, for the very same Zod schemas on the
 * client (react-hook-form) and the server (Server Actions).
 *
 * - Built-in issues (empty field, too long, bad email…) are translated by the
 *   locale error map installed with `configureValidationMessages`.
 * - Schema-specific messages use `validationMessage(key)`: a function Zod
 *   calls at parse time, so the text follows the active locale instead of
 *   being frozen into the schema as a Russian string.
 *
 * Installed by `ValidationLocale` (browser) and `server/validation-locale.ts`
 * (server). Unconfigured (e.g. a bare script), messages fall back to the key.
 */

export type ValidationKey = keyof (typeof messages)["validation"];
type Values = Record<string, string | number>;
export type ValidationTranslator = (key: ValidationKey, values?: Values) => string;

let translate: ValidationTranslator | null = null;

/** Schema-level message: `.regex(re, { error: validationMessage("phoneFormat") })`. */
export function validationMessage(key: ValidationKey, values?: Values): () => string {
  return () => (translate ? translate(key, values) : key);
}

export function configureValidationMessages(t: ValidationTranslator): void {
  translate = t;
  z.config({ localeError: (issue) => issueMessage(issue, t) });
}

const formatKeys: Partial<Record<string, ValidationKey>> = {
  email: "email",
  url: "url",
  date: "date",
  datetime: "date",
  uuid: "invalidValue",
};

function issueMessage(issue: z.core.$ZodRawIssue, t: ValidationTranslator): string {
  switch (issue.code) {
    case "invalid_type":
      if (issue.input === undefined || issue.input === null || issue.input === "") return t("required");
      return t(issue.expected === "int" ? "integer" : "invalidValue");
    case "too_small": {
      const min = Number(issue.minimum);
      if (issue.origin === "string") return min <= 1 ? t("required") : t("tooShort", { min });
      if (issue.origin === "array" || issue.origin === "set") return t("tooFewItems", { min });
      return t("tooSmallNumber", { min });
    }
    case "too_big": {
      const max = Number(issue.maximum);
      if (issue.origin === "string") return t("tooLong", { max });
      if (issue.origin === "array" || issue.origin === "set") return t("tooManyItems", { max });
      return t("tooBigNumber", { max });
    }
    case "invalid_format":
      return t(formatKeys[issue.format] ?? "invalidFormat");
    case "invalid_value":
      return t("invalidOption");
    case "invalid_union": {
      // Optional fields are unions like "" | schema | null; the useful message is
      // the one from the real schema, not "is not an empty string".
      const meaningful = issue.errors
        .flat()
        .find((branch) => branch.code !== "invalid_type" && branch.code !== "invalid_value");
      return meaningful?.message ?? t("invalidValue");
    }
    default:
      return t("invalidValue");
  }
}
