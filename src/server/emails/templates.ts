import { createTranslator } from "next-intl";

import { defaultLocale } from "@/i18n/config";
import messages from "@/i18n/messages/ru.json";
import type { EmailMessage } from "@/server/providers/email/types";

/**
 * Plain-text emails built from the same dictionaries as the UI. Works outside
 * a request (services, scheduled jobs), unlike getTranslations().
 */
const t = createTranslator({ locale: defaultLocale, messages });

export const PASSWORD_RESET_TTL_MINUTES = 30;

export function passwordResetEmail(input: { to: string; name: string; link: string }): EmailMessage {
  return {
    to: input.to,
    tag: "password_reset",
    subject: t("emails.passwordReset.subject"),
    text: [
      t("emails.passwordReset.greeting", { name: input.name }),
      "",
      t("emails.passwordReset.body", { minutes: PASSWORD_RESET_TTL_MINUTES }),
      input.link,
      "",
      t("emails.passwordReset.ignore"),
      "",
      t("emails.signature"),
    ].join("\n"),
  };
}
