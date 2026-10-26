"use client";

import { useTranslations } from "next-intl";

import { CopyField } from "@/components/forms/copy-field";
import type { CreatedAccount } from "@/server/services/admin/client-service";

/**
 * Login details of a freshly created client account, shown once. The password is not
 * stored anywhere (only its hash); the administrator sends this message in WhatsApp.
 */
export function AccountCredentials({ account }: { account: CreatedAccount }) {
  const t = useTranslations("adm.accounts");
  const loginUrl = `${window.location.origin}/login`;

  if (account.temporaryPassword === null) {
    return <p className="text-sm text-muted-foreground">{t("existing", { email: account.email })}</p>;
  }

  const message = t("message", {
    name: account.name,
    url: loginUrl,
    email: account.email,
    password: account.temporaryPassword,
  });

  return (
    <div className="grid gap-3" data-testid="account-credentials">
      <p className="text-sm text-muted-foreground">{t("hint")}</p>
      <CopyField label={t("email")} value={account.email} />
      <CopyField label={t("password")} value={account.temporaryPassword} testId="temporary-password" />
      <CopyField label={t("messageLabel")} value={message} multiline />
    </div>
  );
}
