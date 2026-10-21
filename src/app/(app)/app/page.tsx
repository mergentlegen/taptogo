import type { Metadata, Route } from "next";
import { getTranslations } from "next-intl/server";
import { Suspense } from "react";

import { PeriodFilter } from "@/components/analytics/period-filter";
import { PageHeader } from "@/components/layout/page-header";
import { StatsGate } from "@/components/subscription/stats-gate";
import { getEnv } from "@/env";
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
  venueCount,
}: {
  ctx: OrgContext;
  period: Period;
  filter: DashboardFilter;
  venueCount: number;
}) {
  const data = await getServices().analytics.dashboard(ctx, period, filter);
  return <DashboardView data={data} period={period} venueCount={venueCount} />;
}

export default async function DashboardPage({ searchParams }: PageProps<"/app">) {
  const access = await requireOrgAccess("org.view");
  const ctx = orgContextFrom(access);
  const params = await searchParams;
  const services = getServices();
  const t = await getTranslations();

  const today = toLocalDate(getContainer().clock(), ctx.timeZone);
  const period = resolvePeriod(
    {
      period: searchParam(params.period),
      from: searchParam(params.from),
      to: searchParam(params.to),
    },
    today,
  );
  const requested = { locationId: searchParam(params.location) };

  const [subscription, options] = await Promise.all([
    services.subscription.view(ctx),
    services.analytics.options(ctx),
  ]);
  // Only this organization's ids survive; anything else in the URL is ignored.
  const filter = {
    locationId: options.locations.some((l) => l.id === requested.locationId)
      ? requested.locationId
      : undefined,
  };

  return (
    <>
      <PageHeader title={t("app.pages.dashboard.title")} description={t("app.pages.dashboard.description")} />
      {getEnv().DATA_SOURCE === "mock" && (
        <p role="status" className="mb-5 border-l-2 border-primary pl-3 text-sm text-muted-foreground">
          {t("dashboard.demoNotice")}
        </p>
      )}
      <div className="mb-4">
        <PeriodFilter
          period={period.preset}
          from={period.from}
          to={period.to}
          today={today}
          filters={[
            {
              key: "location",
              label: t("dashboard.venue"),
              value: filter.locationId,
              options: options.locations,
            },
          ]}
        />
      </div>
      {/* Guards ran above, so 403/404 statuses are final before anything streams. */}
      <StatsGate subscription={subscription}>
        <Suspense fallback={<DashboardSkeleton />}>
          <DashboardData
            ctx={ctx}
            period={period}
            filter={{ locationId: filter.locationId }}
            venueCount={filter.locationId ? 1 : options.locations.length}
          />
        </Suspense>
      </StatsGate>
      {subscription.statsAllowed && access.permissions.includes("org.export") && (
        <div className="mt-6 border-t pt-4">
          <a
            className="text-sm text-muted-foreground underline underline-offset-4 hover:text-foreground"
            href={
              `/app/reports/export?format=xlsx&period=${period.preset}&from=${period.from}&to=${period.to}` as Route
            }
          >
            Скачать общий отчёт Excel за этот период
          </a>
        </div>
      )}
    </>
  );
}
