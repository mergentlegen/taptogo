import { Sparkles } from "lucide-react";
import type { Route } from "next";
import { getTranslations } from "next-intl/server";

import { ChartTable } from "@/components/charts/chart-table";
import { Heatmap } from "@/components/charts/heatmap";
import { ShareBar } from "@/components/charts/share-bar";
import { TimeSeriesChart } from "@/components/charts/time-series-chart";
import { TopList } from "@/components/charts/top-list";
import { EmptyState } from "@/components/data/empty-state";
import { StatCard } from "@/components/data/stat-card";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import {
  formatChange,
  formatIsoDate,
  formatNumber,
  formatPercent,
  formatRating,
  formatRatingDelta,
} from "@/lib/format";
import type { Comparison, DashboardData } from "@/server/services/analytics-service";

function direction(delta: number): "up" | "down" | "flat" {
  return delta > 0 ? "up" : delta < 0 ? "down" : "flat";
}

function relativeChange(c: Comparison<number | null>) {
  if (c.value === null || c.previous === null) return null;
  const text = formatChange(c.value, c.previous);
  return text ? { text, direction: direction(c.value - c.previous) } : null;
}

function ratingChange(c: Comparison<number | null>) {
  if (c.value === null || c.previous === null) return null;
  return {
    text: formatRatingDelta(c.value - c.previous),
    direction: direction(Math.round((c.value - c.previous) * 100)),
  };
}

export async function DashboardView({ data }: { data: DashboardData }) {
  const t = await getTranslations("dashboard");
  const { kpis } = data;
  const caption = (change: unknown) => (change ? t("kpi.vsPrevious") : t("kpi.noComparison"));
  const tapsChange = relativeChange(kpis.taps);
  const uniqueChange = relativeChange(kpis.uniqueVisitors);
  const ratingDelta = ratingChange(kpis.rating);
  const reviewsChange = relativeChange(kpis.newReviews);
  const conversionChange = relativeChange(kpis.conversion);
  const marker = data.installDate ? { date: data.installDate, label: t("charts.installMarker") } : null;

  return (
    <div className="grid gap-4">
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-5">
        <StatCard
          testId="kpi-taps"
          label={t("kpi.taps")}
          hint={t("kpi.tapsHint")}
          value={formatNumber(kpis.taps.value)}
          change={tapsChange}
          changeCaption={caption(tapsChange)}
        />
        <StatCard
          testId="kpi-unique"
          label={t("kpi.uniqueVisitors")}
          hint={t("kpi.uniqueHint")}
          value={formatNumber(kpis.uniqueVisitors.value)}
          change={uniqueChange}
          changeCaption={caption(uniqueChange)}
        />
        <StatCard
          testId="kpi-rating"
          label={t("kpi.rating")}
          hint={t("kpi.ratingHint")}
          value={kpis.rating.value === null ? t("kpi.noValue") : formatRating(kpis.rating.value)}
          change={ratingDelta}
          changeCaption={caption(ratingDelta)}
        />
        <StatCard
          testId="kpi-reviews"
          label={t("kpi.newReviews")}
          value={kpis.newReviews.value === null ? t("kpi.noValue") : formatNumber(kpis.newReviews.value)}
          change={reviewsChange}
          changeCaption={caption(reviewsChange)}
        />
        <StatCard
          testId="kpi-conversion"
          label={t("kpi.conversion")}
          hint={t("kpi.conversionHint")}
          value={kpis.conversion.value === null ? t("kpi.noValue") : formatPercent(kpis.conversion.value)}
          change={conversionChange}
          changeCaption={caption(conversionChange)}
        />
      </div>

      {!data.hasTaps ? (
        <EmptyState icon={Sparkles} title={t("empty.title")} text={t("empty.text")}>
          <ul className="grid max-w-md gap-1 text-left text-sm text-muted-foreground">
            <li>• {t("empty.tip1")}</li>
            <li>• {t("empty.tip2")}</li>
            <li>• {t("empty.tip3")}</li>
          </ul>
        </EmptyState>
      ) : (
        <>
          <Card>
            <CardHeader>
              <CardTitle>{t("charts.tapsTitle")}</CardTitle>
            </CardHeader>
            <CardContent className="grid gap-4">
              <TimeSeriesChart
                kind="bar"
                label={t("charts.taps")}
                color="var(--chart-1)"
                data={data.daily.map((d) => ({ date: d.date, value: d.taps }))}
                marker={marker}
                ariaLabel={`${t("charts.tapsTitle")}: ${formatNumber(kpis.taps.value)}`}
              />
              <ChartTable
                summary={t("charts.showTable")}
                headers={[t("charts.date"), t("charts.taps"), t("charts.reviews")]}
                rows={data.daily.map((d) => [
                  formatIsoDate(d.date, "long"),
                  formatNumber(d.taps),
                  d.reviewCount === null ? "—" : formatNumber(d.reviewCount),
                ])}
              />
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>{t("charts.reviewsTitle")}</CardTitle>
              <CardDescription>{t("charts.reviewsDescription")}</CardDescription>
            </CardHeader>
            <CardContent>
              {data.hasRatings ? (
                <TimeSeriesChart
                  kind="line"
                  label={t("charts.reviews")}
                  color="var(--chart-2)"
                  data={data.daily.map((d) => ({ date: d.date, value: d.reviewCount }))}
                  marker={marker}
                  tightDomain
                  height={180}
                  ariaLabel={t("charts.reviewsTitle")}
                />
              ) : (
                <p className="py-6 text-center text-sm text-muted-foreground">{t("noRatings")}</p>
              )}
            </CardContent>
          </Card>

          <div className="grid gap-4 lg:grid-cols-[minmax(0,1.4fr)_minmax(0,1fr)_minmax(0,1fr)]">
            <Card>
              <CardHeader>
                <CardTitle>{t("charts.heatmapTitle")}</CardTitle>
                <CardDescription>{t("charts.heatmapDescription")}</CardDescription>
              </CardHeader>
              <CardContent>
                <Heatmap cells={data.heatmap} />
              </CardContent>
            </Card>
            <Card>
              <CardHeader>
                <CardTitle>{t("charts.topCards")}</CardTitle>
              </CardHeader>
              <CardContent>
                <TopList
                  emptyText={t("charts.topEmpty")}
                  items={data.topCards.map((c) => ({
                    id: c.id,
                    label: c.label,
                    sublabel: c.location,
                    value: c.taps,
                    href: `/app/cards/${c.id}` as Route,
                  }))}
                />
              </CardContent>
            </Card>
            <Card>
              <CardHeader>
                <CardTitle>{t("charts.topEmployees")}</CardTitle>
              </CardHeader>
              <CardContent>
                <TopList
                  emptyText={t("charts.topEmpty")}
                  items={data.topEmployees.map((e) => ({ id: e.id, label: e.name, value: e.taps }))}
                />
              </CardContent>
            </Card>
          </div>

          <div className="grid gap-4 md:grid-cols-2">
            <Card>
              <CardHeader>
                <CardTitle>{t("charts.sources")}</CardTitle>
              </CardHeader>
              <CardContent>
                <ShareBar
                  ariaLabel={t("charts.sources")}
                  segments={[
                    { key: "nfc", label: t("charts.NFC"), value: data.sources.NFC, color: "var(--chart-1)" },
                    { key: "qr", label: t("charts.QR"), value: data.sources.QR, color: "var(--chart-2)" },
                  ]}
                />
              </CardContent>
            </Card>
            <Card>
              <CardHeader>
                <CardTitle>{t("charts.platforms")}</CardTitle>
              </CardHeader>
              <CardContent>
                <ShareBar
                  ariaLabel={t("charts.platforms")}
                  segments={[
                    {
                      key: "ios",
                      label: t("charts.IOS"),
                      value: data.platforms.IOS,
                      color: "var(--chart-1)",
                    },
                    {
                      key: "android",
                      label: t("charts.ANDROID"),
                      value: data.platforms.ANDROID,
                      color: "var(--chart-2)",
                    },
                    {
                      key: "other",
                      label: t("charts.OTHER"),
                      value: data.platforms.OTHER,
                      color: "var(--chart-3)",
                    },
                  ]}
                />
              </CardContent>
            </Card>
          </div>
        </>
      )}
    </div>
  );
}

/** Placeholder with the same layout while statistics are computed. */
export function DashboardSkeleton() {
  return (
    <div className="grid gap-4" aria-busy="true">
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-5">
        {Array.from({ length: 5 }, (_, i) => (
          <Skeleton key={i} className="h-28" />
        ))}
      </div>
      <Skeleton className="h-80" />
      <Skeleton className="h-64" />
    </div>
  );
}
