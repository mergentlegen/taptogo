import type { Metadata } from "next";
import { getTranslations } from "next-intl/server";

import { PageHeader } from "@/components/layout/page-header";
import { TargetsManager } from "@/features/admin/components/targets-manager";
import { requirePlatformAccess } from "@/server/auth/session";
import { can } from "@/server/permissions";
import { getServices } from "@/server/services";

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations("admin.pages.targets");
  return { title: t("title") };
}

export default async function AdminTargetsPage() {
  const { actor } = await requirePlatformAccess("admin.access");
  const admin = getServices().admin;
  const [targets, organizations, t] = await Promise.all([
    admin.targets.list(),
    admin.clients.assignmentOptions(),
    getTranslations("admin.pages.targets"),
  ]);

  return (
    <>
      <PageHeader title={t("title")} description={t("description")} />
      <TargetsManager
        targets={targets}
        canManage={can(actor, "admin.manage")}
        organizations={organizations}
      />
    </>
  );
}
