import type { Metadata } from "next";
import { getTranslations } from "next-intl/server";
import { redirect } from "next/navigation";

import { AuthCard } from "@/components/layout/auth-card";
import { ForcedPasswordChange } from "@/features/auth/components/forced-password-change";
import { homePathFor } from "@/features/auth/redirect";
import { requireSessionAllowingTemporary } from "@/server/auth/session";

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations("auth.changePassword");
  return { title: t("title") };
}

/** Reached only with a temporary password; anyone else is sent to their home page. */
export default async function ChangePasswordPage() {
  const session = await requireSessionAllowingTemporary();
  if (!session.user.mustChangePassword) redirect(homePathFor(session.user));
  const t = await getTranslations("auth.changePassword");

  return (
    <AuthCard title={t("title")} description={t("description")}>
      <ForcedPasswordChange next={homePathFor({ ...session.user, mustChangePassword: false })} />
    </AuthCard>
  );
}
