import type { Metadata } from "next";
import { getTranslations } from "next-intl/server";
import Link from "next/link";

import { AuthCard } from "@/components/layout/auth-card";
import { ForgotPasswordForm } from "@/features/auth/components/forgot-password-form";

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations("auth.forgot");
  return { title: t("title") };
}

export default async function ForgotPasswordPage() {
  const t = await getTranslations("auth.forgot");

  return (
    <AuthCard
      title={t("title")}
      description={t("description")}
      footer={
        <Link href="/login" className="text-center text-sm text-muted-foreground hover:text-foreground">
          {t("back")}
        </Link>
      }
    >
      <ForgotPasswordForm />
    </AuthCard>
  );
}
