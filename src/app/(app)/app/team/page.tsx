import type { Metadata } from "next";
import { getTranslations } from "next-intl/server";

import { PageHeader } from "@/components/layout/page-header";
import { TeamManager } from "@/features/team/components/team-manager";
import { requireOrgAccess } from "@/server/auth/session";
import { getServices } from "@/server/services";
import { orgContextFrom } from "@/server/services/context";

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations("app.pages.team");
  return { title: t("title") };
}

/** Owners only — enforced here, not just by hiding the menu item. */
export default async function TeamPage() {
  const access = await requireOrgAccess("org.team.manage");
  const ctx = orgContextFrom(access);
  const [{ members, invitations }, t] = await Promise.all([
    getServices().team.list(ctx),
    getTranslations("app.pages.team"),
  ]);

  return (
    <>
      <PageHeader title={t("title")} description={t("description")} />
      <TeamManager members={members} invitations={invitations} timeZone={ctx.timeZone} />
    </>
  );
}
