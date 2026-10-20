import type { Metadata } from "next";
import { getTranslations } from "next-intl/server";

import { PageHeader } from "@/components/layout/page-header";
import { ClientWizard } from "@/features/admin/components/client-wizard";
import { addDays, DEFAULT_TIME_ZONE, toLocalDate } from "@/lib/dates";
import { requirePlatformAccess } from "@/server/auth/session";
import { getContainer } from "@/server/container";
import { getServices } from "@/server/services";

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations("adm.clients.wizard");
  return { title: t("title") };
}

export default async function NewClientPage() {
  await requirePlatformAccess("admin.manage");
  const [settings, t] = await Promise.all([
    getServices().admin.settings.get(),
    getTranslations("adm.clients.wizard"),
  ]);
  const today = toLocalDate(getContainer().clock(), DEFAULT_TIME_ZONE);

  return (
    <>
      <PageHeader title={t("title")} />
      <ClientWizard plans={settings.plans} defaultPaidUntil={addDays(today, 14)} />
    </>
  );
}
