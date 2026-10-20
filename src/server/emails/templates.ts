import { createTranslator } from "next-intl";

import type { OrgRole } from "@/features/team/schemas";
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

export function invitationEmail(input: {
  to: string;
  organization: string;
  role: OrgRole;
  link: string;
  expires: Date;
}): EmailMessage {
  const expires = new Intl.DateTimeFormat("ru-RU", {
    dateStyle: "long",
    timeStyle: "short",
    timeZone: "Asia/Almaty",
  }).format(input.expires);
  return {
    to: input.to,
    tag: "invitation",
    subject: t("emails.invitation.subject", { organization: input.organization }),
    text: [
      t("emails.invitation.body", { organization: input.organization, role: t(`roles.${input.role}`) }),
      "",
      t("emails.invitation.action", { expires }),
      input.link,
      "",
      t("emails.signature"),
    ].join("\n"),
  };
}

/** Internal notice to TapToGo staff about a request from the landing page. */
export function newLeadEmail(input: {
  to: string;
  lead: { name: string; phone: string; businessName: string; city: string | null; message: string | null };
  link: string;
}): EmailMessage {
  const { lead } = input;
  return {
    to: input.to,
    tag: "new_lead",
    subject: t("emails.newLead.subject", { business: lead.businessName }),
    text: [
      t("emails.newLead.business", { value: lead.businessName }),
      t("emails.newLead.city", { value: lead.city ?? "—" }),
      t("emails.newLead.contact", { name: lead.name, phone: lead.phone }),
      ...(lead.message ? ["", lead.message] : []),
      "",
      t("emails.newLead.action"),
      input.link,
    ].join("\n"),
  };
}
