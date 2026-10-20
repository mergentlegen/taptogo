import { Plus } from "lucide-react";
import type { Metadata } from "next";
import { getTranslations } from "next-intl/server";
import Link from "next/link";

import { PageHeader } from "@/components/layout/page-header";
import { Button } from "@/components/ui/button";
import { ClientsTable } from "@/features/admin/components/clients-table";
import { requirePlatformAccess } from "@/server/auth/session";
import { can } from "@/server/permissions";
import { getServices } from "@/server/services";

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations("admin.pages.organizations");
  return { title: t("title") };
}

export default async function AdminOrganizationsPage() {
  const { actor } = await requirePlatformAccess("admin.access");
  const [clients, t] = await Promise.all([getServices().admin.clients.list(), getTranslations()]);

  return (
    <>
      <PageHeader
        title={t("admin.pages.organizations.title")}
        description={t("admin.pages.organizations.description")}
        actions={
          can(actor, "admin.manage") && (
            <Button asChild>
              <Link href="/admin/organizations/new">
                <Plus data-icon="inline-start" />
                {t("adm.clients.new")}
              </Link>
            </Button>
          )
        }
      />
      <ClientsTable clients={clients} />
    </>
  );
}
