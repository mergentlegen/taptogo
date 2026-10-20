import { ArrowLeft, ExternalLink } from "lucide-react";
import type { Metadata, Route } from "next";
import { getTranslations } from "next-intl/server";
import Link from "next/link";
import { notFound } from "next/navigation";

import { TimeSeriesChart } from "@/components/charts/time-series-chart";
import { TopList } from "@/components/charts/top-list";
import { StatCard } from "@/components/data/stat-card";
import { PageHeader } from "@/components/layout/page-header";
import { StatsGate } from "@/components/subscription/stats-gate";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { TwogisChangeDialog } from "@/features/locations/components/twogis-change-dialog";
import { formatNumber, formatRating, formatRatingDelta } from "@/lib/format";
import { requireOrgAccess } from "@/server/auth/session";
import { getServices } from "@/server/services";
import { orgContextFrom } from "@/server/services/context";

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations("app.pages.locations");
  return { title: t("title") };
}

export default async function LocationPage({ params }: PageProps<"/app/locations/[id]">) {
  const access = await requireOrgAccess("org.view");
  const ctx = orgContextFrom(access);
  const { id } = await params;
  const services = getServices();
  const detail = await services.locations.detail(ctx, id);
  if (!detail) notFound();

  const [subscription, t] = await Promise.all([services.subscription.view(ctx), getTranslations()]);
  const { location, history, totals } = detail;
  const hasRatings = history.some((h) => h.rating !== null);
  const latest = history.at(-1);

  return (
    <>
      <Button asChild variant="ghost" size="sm" className="mb-2 -ml-2">
        <Link href="/app/locations">
          <ArrowLeft data-icon="inline-start" />
          {t("locations.back")}
        </Link>
      </Button>
      <PageHeader
        title={location.name}
        description={location.address}
        actions={
          <>
            {location.twogisProfileUrl && (
              <Button asChild variant="ghost">
                <a href={location.twogisProfileUrl} target="_blank" rel="noopener noreferrer">
                  {t("locations.openInTwogis")}
                  <ExternalLink data-icon="inline-end" />
                </a>
              </Button>
            )}
            {access.permissions.includes("org.support") && <TwogisChangeDialog locationId={location.id} />}
          </>
        }
      />

      <StatsGate subscription={subscription}>
        <div className="grid gap-4">
          <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
            <StatCard
              label={t("dashboard.kpi.rating")}
              value={
                latest?.rating === null || latest?.rating === undefined ? "—" : formatRating(latest.rating)
              }
            />
            <StatCard
              label={t("locations.detail.ratingChange")}
              value={totals.ratingChange === null ? "—" : formatRatingDelta(totals.ratingChange)}
            />
            <StatCard
              label={t("locations.detail.newReviews")}
              value={totals.newReviews === null ? "—" : formatNumber(totals.newReviews)}
            />
            <StatCard label={t("locations.detail.taps")} value={formatNumber(totals.taps)} />
          </div>

          {hasRatings ? (
            <div className="grid gap-4 lg:grid-cols-2">
              <Card>
                <CardHeader>
                  <CardTitle>{t("locations.detail.ratingTitle")}</CardTitle>
                  <CardDescription>{t("locations.detail.period")}</CardDescription>
                </CardHeader>
                <CardContent>
                  <TimeSeriesChart
                    kind="line"
                    label={t("dashboard.kpi.rating")}
                    color="var(--chart-2)"
                    valueFormat="rating"
                    tightDomain
                    height={200}
                    data={history.map((h) => ({ date: h.date, value: h.rating }))}
                    ariaLabel={t("locations.detail.ratingTitle")}
                  />
                </CardContent>
              </Card>
              <Card>
                <CardHeader>
                  <CardTitle>{t("locations.detail.reviewsTitle")}</CardTitle>
                  <CardDescription>{t("locations.detail.period")}</CardDescription>
                </CardHeader>
                <CardContent>
                  <TimeSeriesChart
                    kind="line"
                    label={t("dashboard.charts.reviews")}
                    color="var(--chart-2)"
                    valueFormat="number"
                    tightDomain
                    height={200}
                    data={history.map((h) => ({ date: h.date, value: h.reviewCount }))}
                    ariaLabel={t("locations.detail.reviewsTitle")}
                  />
                </CardContent>
              </Card>
            </div>
          ) : (
            <p className="rounded-xl border border-dashed p-6 text-center text-sm text-muted-foreground">
              {t("locations.detail.noHistory")}
            </p>
          )}

          <div className="grid gap-4 lg:grid-cols-[minmax(0,2fr)_minmax(0,1fr)]">
            <Card>
              <CardHeader>
                <CardTitle>{t("locations.detail.tapsTitle")}</CardTitle>
                <CardDescription>{t("locations.detail.period")}</CardDescription>
              </CardHeader>
              <CardContent>
                <TimeSeriesChart
                  kind="bar"
                  label={t("dashboard.charts.taps")}
                  color="var(--chart-1)"
                  valueFormat="number"
                  data={history.map((h) => ({ date: h.date, value: h.taps }))}
                  ariaLabel={t("locations.detail.tapsTitle")}
                />
              </CardContent>
            </Card>
            <Card>
              <CardHeader>
                <CardTitle>{t("locations.detail.cards")}</CardTitle>
              </CardHeader>
              <CardContent>
                <TopList
                  emptyText={t("locations.detail.noCards")}
                  items={detail.cards.map((c) => ({
                    id: c.id,
                    label: c.label,
                    sublabel: t(`cards.statuses.${c.status}`),
                    value: c.taps,
                    href: `/app/cards/${c.id}` as Route,
                  }))}
                />
              </CardContent>
            </Card>
          </div>
        </div>
      </StatsGate>
    </>
  );
}
