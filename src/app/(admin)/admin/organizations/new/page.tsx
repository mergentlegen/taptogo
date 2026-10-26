import type { Metadata } from "next";
import { getTranslations } from "next-intl/server";

import { PageHeader } from "@/components/layout/page-header";
import { ClientWizard } from "@/features/admin/components/client-wizard";
import { requirePlatformAccess } from "@/server/auth/session";

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations("adm.clients.wizard");
  return { title: t("title") };
}

export default async function NewClientPage() {
  await requirePlatformAccess("admin.manage");
  const t = await getTranslations("adm.clients.wizard");

  return (
    <>
      <PageHeader title={t("title")} />
      <ClientWizard />
    </>
  );
}
