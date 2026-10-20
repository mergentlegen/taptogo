import type { Metadata } from "next";
import { getTranslations } from "next-intl/server";
import { Suspense } from "react";

import { PeriodFilter } from "@/components/analytics/period-filter";
import { PageHeader } from "@/components/layout/page-header";
import { StatsGate } from "@/components/subscription/stats-gate";
import { DashboardSkeleton, DashboardView } from "@/features/analytics/components/dashboard-view";
import { toLocalDate } from "@/lib/dates";
import { resolvePeriod, searchParam, type Period } from "@/lib/period";
import { requireOrgAccess } from "@/server/auth/session";
import { getContainer } from "@/server/container";
import { getServices } from "@/server/services";
import type { DashboardFilter } from "@/server/services/analytics-service";
import { orgContextFrom, type OrgContext } from "@/server/services/context";

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations("app.pages.dashboard");
  return { title: t("title") };
}

/** Expired subscriptions never reach this: no statistics are computed or sent. */
async function DashboardData({
  ctx,
  period,
  filter,
}: {
  ctx: OrgContext;
  period: Period;
  filter: DashboardFilter;
}) {
  const data = await getServices().analytics.dashboard(ctx, period, filter);
  return <DashboardView data={data} />;
}

export default async function DashboardPage({ searchParams }: PageProps<"/app">) {
  const access = await requireOrgAccess("org.view");
  const ctx = orgContextFrom(access);
  const params = await searchParams;
  const services = getServices();
  const t = await getTranslations();

  const today = toLocalDate(getContainer().clock(), ctx.timeZone);
  const period = resolvePeriod(
    { period: searchParam(params.period), from: searchParam(params.from), to: searchParam(params.to) },
    today,
  );
  const requested = {
    locationId: searchParam(params.location),
    employeeId: searchParam(params.employee),
    cardId: searchParam(params.card),
  };

  const [subscription, options] = await Promise.all([
    services.subscription.view(ctx),
    services.analytics.options(ctx),
  ]);
  // Only this organization's ids survive; anything else in the URL is ignored.
  const filter = {
    locationId: options.locations.some((l) => l.id === requested.locationId)
      ? requested.locationId
      : undefined,
    employeeId: options.employees.some((e) => e.id === requested.employeeId)
      ? requested.employeeId
      : undefined,
    cardId: options.cards.some((c) => c.id === requested.cardId) ? requested.cardId : undefined,
  };

  return (
    <>
      <PageHeader title={t("app.pages.dashboard.title")} description={t("app.pages.dashboard.description")} />
      <div className="mb-4">
        <PeriodFilter
          period={period.preset}
          from={period.from}
          to={period.to}
          today={today}
          filters={[
            {
              key: "location",
              label: t("filters.location"),
              value: filter.locationId,
              options: options.locations,
            },
            {
              key: "employee",
              label: t("filters.employee"),
              value: filter.employeeId,
              options: options.employees,
            },
            {
              key: "card",
              label: t("filters.card"),
              value: filter.cardId,
              options: options.cards.map((c) => ({ id: c.id, name: c.label })),
            },
          ]}
        />
      </div>
      {/* Guards ran above, so 403/404 statuses are final before anything streams. */}
      <StatsGate subscription={subscription}>
        <Suspense fallback={<DashboardSkeleton />}>
          <DashboardData ctx={ctx} period={period} filter={filter} />
        </Suspense>
      </StatsGate>
    </>
  );
}
