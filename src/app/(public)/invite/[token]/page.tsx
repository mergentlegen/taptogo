import type { Metadata } from "next";
import { getTranslations } from "next-intl/server";
import Link from "next/link";

import { FormAlert } from "@/components/forms/form-alert";
import { AuthCard } from "@/components/layout/auth-card";
import { Button } from "@/components/ui/button";
import { AcceptInvitationForm } from "@/features/auth/components/accept-invitation-form";
import { getContainer } from "@/server/container";

export const metadata: Metadata = { robots: { index: false } };

export default async function InvitePage({ params }: PageProps<"/invite/[token]">) {
  const { token } = await params;
  const t = await getTranslations();
  const invitation = /^[A-Za-z0-9_-]{20,100}$/.test(token)
    ? await getContainer().auth.getInvitation(token)
    : null;

  if (!invitation || invitation.status !== "PENDING") {
    const message = !invitation
      ? t("auth.invite.invalid")
      : invitation.status === "EXPIRED"
        ? t("auth.invite.expired")
        : t("auth.invite.accepted");
    return (
      <AuthCard title={t("auth.invite.title", { organization: invitation?.organizationName ?? "TapToGo" })}>
        <div className="grid gap-4">
          <FormAlert>{message}</FormAlert>
          <Button asChild variant="outline">
            <Link href="/login">{t("auth.invite.goToLogin")}</Link>
          </Button>
        </div>
      </AuthCard>
    );
  }

  const values = {
    organization: invitation.organizationName,
    role: t(`roles.${invitation.role}`),
    email: invitation.email,
  };
  return (
    <AuthCard
      title={t("auth.invite.title", values)}
      description={
        invitation.existingUser
          ? t("auth.invite.descriptionExisting", values)
          : t("auth.invite.description", values)
      }
    >
      <AcceptInvitationForm token={token} existingUser={invitation.existingUser} />
    </AuthCard>
  );
}
