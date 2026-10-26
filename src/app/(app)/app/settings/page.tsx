import type { Metadata } from "next";
import { getTranslations } from "next-intl/server";
import type { ReactNode } from "react";

import { PageHeader } from "@/components/layout/page-header";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { OrganizationForm } from "@/features/settings/components/organization-forms";
import { PasswordForm, ProfileForm } from "@/features/settings/components/profile-forms";
import { SessionsList } from "@/features/settings/components/sessions-list";
import { SettingsTabs } from "@/features/settings/components/settings-tabs";
import { settingsTabs } from "@/features/settings/tabs";
import { searchParam } from "@/lib/period";
import { requireOrgAccess } from "@/server/auth/session";
import { getServices } from "@/server/services";
import { orgContextFrom } from "@/server/services/context";

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations("app.pages.settings");
  return { title: t("title") };
}

function Section({ title, children }: { title: string; children: ReactNode }) {
  return (
    <Card>
      <CardHeader>
        <CardTitle>{title}</CardTitle>
      </CardHeader>
      <CardContent>{children}</CardContent>
    </Card>
  );
}

export default async function SettingsPage({ searchParams }: PageProps<"/app/settings">) {
  const access = await requireOrgAccess("org.view");
  const ctx = orgContextFrom(access);
  const services = getServices();
  const requestedTab = searchParam((await searchParams).tab);
  const tab = settingsTabs.find((x) => x === requestedTab) ?? "profile";
  const canEditOrg = access.permissions.includes("org.settings.manage");

  const [user, sessions, t] = await Promise.all([
    services.account.profile(ctx.userId),
    services.account.sessions(ctx.userId, access.session.id),
    getTranslations(),
  ]);
  const org = access.organization;

  return (
    <>
      <PageHeader title={t("app.pages.settings.title")} description={t("app.pages.settings.description")} />
      <SettingsTabs
        initial={tab}
        panels={{
          profile: (
            <Section title={t("settings.profile.title")}>
              <ProfileForm name={user?.name ?? ""} phone={user?.phone ?? null} email={user?.email ?? ""} />
            </Section>
          ),
          security: (
            <div className="grid gap-4">
              <Section title={t("settings.password.title")}>
                <PasswordForm />
              </Section>
              <Section title={t("settings.sessions.title")}>
                <SessionsList sessions={sessions} timeZone={ctx.timeZone} />
              </Section>
            </div>
          ),
          organization: (
            <div className="grid gap-4">
              <Section title={t("settings.organization.title")}>
                <OrganizationForm
                  readOnly={!canEditOrg}
                  values={{
                    name: org.name,
                    contactName: org.contactName ?? "",
                    contactPhone: org.contactPhone ?? "",
                    contactEmail: org.contactEmail ?? "",
                  }}
                />
              </Section>
            </div>
          ),
        }}
      />
    </>
  );
}
