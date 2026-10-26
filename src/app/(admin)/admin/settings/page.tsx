import type { Metadata } from "next";
import { getTranslations } from "next-intl/server";

import { PageHeader } from "@/components/layout/page-header";
import { PlatformSettingsForm } from "@/features/admin/components/settings-form";
import { requirePlatformAccess } from "@/server/auth/session";
import { getServices } from "@/server/services";

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations("admin.pages.settings");
  return { title: t("title") };
}

/** Administrators only. */
export default async function AdminSettingsPage() {
  await requirePlatformAccess("admin.settings.manage");
  const [settings, t] = await Promise.all([
    getServices().admin.settings.get(),
    getTranslations("admin.pages.settings"),
  ]);

  return (
    <>
      <PageHeader title={t("title")} description={t("description")} />
      <PlatformSettingsForm settings={settings} />
    </>
  );
}
