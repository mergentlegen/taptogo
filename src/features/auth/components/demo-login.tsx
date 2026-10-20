"use client";

import { FlaskConical } from "lucide-react";
import { useTranslations } from "next-intl";
import { useState, useTransition } from "react";

import { FormAlert } from "@/components/forms/form-alert";
import { Button } from "@/components/ui/button";
import type { OrgRole } from "@/features/team/schemas";
import type { PlatformRole } from "@/features/users/schemas";

import { signInAsDemoAction } from "../actions";

type DemoAccount = { email: string; role: PlatformRole | OrgRole };

/** Development-only shortcut. The login page never renders it in production builds. */
export function DemoLogin({
  accounts,
  password,
  next,
}: {
  accounts: readonly DemoAccount[];
  password: string;
  next?: string;
}) {
  const t = useTranslations();
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  const signInAs = (email: string) =>
    startTransition(async () => {
      setError(null);
      const result = await signInAsDemoAction({ email, next });
      if (!result.ok) setError(result.error.message);
    });

  return (
    <section
      aria-labelledby="demo-login-title"
      className="rounded-xl border border-dashed border-warning bg-warning/10 p-4"
      data-testid="demo-login"
    >
      <h2 id="demo-login-title" className="flex items-center gap-2 text-sm font-semibold">
        <FlaskConical className="size-4" aria-hidden="true" />
        {t("auth.demo.title")}
      </h2>
      <p className="mt-1 mb-3 text-xs text-muted-foreground">{t("auth.demo.hint", { password })}</p>
      {error && <FormAlert>{error}</FormAlert>}
      <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
        {accounts.map((account) => (
          <Button
            key={account.email}
            type="button"
            variant="outline"
            size="sm"
            disabled={pending}
            onClick={() => signInAs(account.email)}
            title={account.email}
          >
            {t(`roles.${account.role}`)}
          </Button>
        ))}
      </div>
    </section>
  );
}
