import type { Metadata } from "next";
import { getTranslations } from "next-intl/server";

import { PageHeader } from "@/components/layout/page-header";
import { BillingManager } from "@/features/admin/components/billing-manager";
import { DEFAULT_TIME_ZONE, toLocalDate } from "@/lib/dates";
import { requirePlatformAccess } from "@/server/auth/session";
import { getContainer } from "@/server/container";
import { can } from "@/server/permissions";
import { getServices } from "@/server/services";

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations("admin.pages.billing");
  return { title: t("title") };
}

export default async function AdminBillingPage() {
  const { actor } = await requirePlatformAccess("admin.access");
  const services = getServices().admin;
  const [{ subscriptions, payments }, settings, t] = await Promise.all([
    services.billing.overview(),
    services.settings.get(),
    getTranslations(),
  ]);

  return (
    <>
      <PageHeader
        title={t("admin.pages.billing.title")}
        description={t("adm.billing.graceHint", { days: settings.graceDays })}
      />
      <BillingManager
        subscriptions={subscriptions}
        payments={payments.map(({ id, organization, amountKzt, method, paidAt, comment }) => ({
          id,
          organization,
          amountKzt,
          method,
          paidAt,
          comment,
        }))}
        canManage={can(actor, "admin.manage")}
        today={toLocalDate(getContainer().clock(), DEFAULT_TIME_ZONE)}
      />
    </>
  );
}
