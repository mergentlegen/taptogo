import type { Metadata } from "next";
import { getTranslations } from "next-intl/server";
import Link from "next/link";

import { FormAlert } from "@/components/forms/form-alert";
import { AuthCard } from "@/components/layout/auth-card";
import { Button } from "@/components/ui/button";
import { ResetPasswordForm } from "@/features/auth/components/reset-password-form";

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations("auth.reset");
  return { title: t("title") };
}

export default async function ResetPasswordPage({ searchParams }: PageProps<"/reset-password">) {
  const { token } = await searchParams;
  const t = await getTranslations("auth.reset");
  const validShape = typeof token === "string" && /^[A-Za-z0-9_-]{20,100}$/.test(token);

  return (
    <AuthCard title={t("title")} description={validShape ? t("description") : undefined}>
      {validShape ? (
        <ResetPasswordForm token={token} />
      ) : (
        <div className="grid gap-4">
          <FormAlert>{t("invalid")}</FormAlert>
          <Button asChild variant="outline">
            <Link href="/forgot-password">{t("requestNew")}</Link>
          </Button>
        </div>
      )}
    </AuthCard>
  );
}
