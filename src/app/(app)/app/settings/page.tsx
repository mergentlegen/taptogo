import type { Metadata } from "next";
import { getTranslations } from "next-intl/server";
import type { ReactNode } from "react";

import { PageHeader } from "@/components/layout/page-header";
import { ContactDialog } from "@/components/subscription/contact-dialog";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { LogoUpload, OrganizationForm } from "@/features/settings/components/organization-forms";
import { PasswordForm, ProfileForm } from "@/features/settings/components/profile-forms";
import { SessionsList } from "@/features/settings/components/sessions-list";
import { SettingsTabs } from "@/features/settings/components/settings-tabs";
import { settingsTabs } from "@/features/settings/tabs";
import { formatIsoDate, formatKzt } from "@/lib/format";
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

  const [user, sessions, subscription, logoUrl, t] = await Promise.all([
    services.account.profile(ctx.userId),
    services.account.sessions(ctx.userId, access.session.id),
    services.subscription.view(ctx),
    services.account.logoUrl(access.organization),
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
              <Section title={t("settings.organization.logo")}>
                <LogoUpload logoUrl={logoUrl} readOnly={!canEditOrg} />
              </Section>
              <Section title={t("settings.organization.title")}>
                <OrganizationForm
                  readOnly={!canEditOrg}
                  values={{
                    name: org.name,
                    legalName: org.legalName ?? "",
                    bin: org.bin ?? "",
                    contactName: org.contactName,
                    contactPhone: org.contactPhone,
                    contactEmail: org.contactEmail,
                  }}
                />
              </Section>
            </div>
          ),
          subscription: (
            <Section title={t("settings.subscription.title")}>
              {subscription.plan ? (
                <div className="grid gap-4">
                  <dl className="grid gap-3 sm:grid-cols-2" data-testid="subscription-info">
                    {[
                      [t("settings.subscription.plan"), t(`subscription.plans.${subscription.plan}`)],
                      [t("settings.subscription.status"), t(`subscription.statuses.${subscription.status}`)],
                      [
                        t("settings.subscription.paidUntil"),
                        subscription.paidUntil ? formatIsoDate(subscription.paidUntil, "long") : "—",
                      ],
                      [
                        t("settings.subscription.cards"),
                        t("settings.subscription.cardsUsed", {
                          used: subscription.cardsUsed,
                          limit: subscription.cardLimit,
                        }),
                      ],
                      ...(subscription.monthlyPriceKzt
                        ? [
                            [
                              t("settings.subscription.price"),
                              t("settings.subscription.perMonth", {
                                price: formatKzt(subscription.monthlyPriceKzt),
                              }),
                            ],
                          ]
                        : []),
                    ].map(([label, value]) => (
                      <div key={label}>
                        <dt className="text-sm text-muted-foreground">{label}</dt>
                        <dd className="font-medium">{value}</dd>
                      </div>
                    ))}
                  </dl>
                  <div>
                    <ContactDialog triggerLabel={t("settings.subscription.renew")} />
                  </div>
                </div>
              ) : (
                <p className="text-muted-foreground">{t("settings.subscription.none")}</p>
              )}
            </Section>
          ),
        }}
      />
    </>
  );
}
