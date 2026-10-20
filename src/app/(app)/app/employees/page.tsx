import { Info } from "lucide-react";
import type { Metadata } from "next";
import { getTranslations } from "next-intl/server";

import { PeriodFilter } from "@/components/analytics/period-filter";
import { PageHeader } from "@/components/layout/page-header";
import { EmployeesTable } from "@/features/employees/components/employees-table";
import { toLocalDate } from "@/lib/dates";
import { resolvePeriod, searchParam } from "@/lib/period";
import { requireOrgAccess } from "@/server/auth/session";
import { getContainer } from "@/server/container";
import { getServices } from "@/server/services";
import { orgContextFrom } from "@/server/services/context";

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations("app.pages.employees");
  return { title: t("title") };
}

export default async function EmployeesPage({ searchParams }: PageProps<"/app/employees">) {
  const access = await requireOrgAccess("org.view");
  const ctx = orgContextFrom(access);
  const params = await searchParams;
  const { clock } = getContainer();
  const services = getServices();
  const today = toLocalDate(clock(), ctx.timeZone);
  const period = resolvePeriod(
    { period: searchParam(params.period), from: searchParam(params.from), to: searchParam(params.to) },
    today,
  );
  const [employees, locations, subscription, t] = await Promise.all([
    services.employees.list(ctx, period),
    services.locations.options(ctx),
    services.subscription.view(ctx),
    getTranslations(),
  ]);

  return (
    <>
      <PageHeader title={t("app.pages.employees.title")} description={t("app.pages.employees.description")} />
      {subscription.statsAllowed && (
        <div className="mb-4 grid gap-3">
          <PeriodFilter period={period.preset} from={period.from} to={period.to} today={today} />
          <p className="flex items-start gap-2 text-sm text-muted-foreground">
            <Info className="mt-0.5 size-4 shrink-0" aria-hidden="true" />
            {t("employees.explanation")}
          </p>
        </div>
      )}
      <EmployeesTable
        employees={employees}
        locations={locations.map(({ id, name }) => ({ id, name }))}
        canManage={access.permissions.includes("org.employees.manage")}
        showStats={subscription.statsAllowed}
      />
    </>
  );
}
