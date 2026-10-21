import { ArrowRight } from "lucide-react";
import type { Route } from "next";
import { getTranslations } from "next-intl/server";
import Link from "next/link";

import { Skeleton } from "@/components/ui/skeleton";
import { formatChange, formatIsoDate, formatNumber, formatRating } from "@/lib/format";
import type { Period } from "@/lib/period";
import type { DashboardData } from "@/server/services/analytics-service";

import { DashboardChart } from "./dashboard-chart";

export async function DashboardView({
  data,
  period,
  venueCount,
}: {
  data: DashboardData;
  period: Period;
  venueCount: number;
}) {
  const t = await getTranslations("dashboard");
  const { kpis } = data;
  return (
    <div className="grid gap-6">
      <section aria-labelledby="result-period" className="grid gap-2">
        <h2 id="result-period" className="text-lg font-semibold">
          {period.preset === "today"
            ? t("summary.today")
            : period.preset === "custom"
              ? t("summary.customPeriod")
              : t("summary.period", { days: period.days })}
        </h2>
        <p className="text-sm text-muted-foreground">
          {formatIsoDate(period.from, "long")} — {formatIsoDate(period.to, "long")}
        </p>
        <dl className="mt-3 grid grid-cols-3 divide-x border-y">
          <div className="py-5 pr-3 sm:pr-6" data-testid="kpi-taps">
            <dt className="min-h-10 text-sm text-muted-foreground sm:min-h-0">Переходы</dt>
            <dd className="mt-2 text-2xl font-semibold tracking-tight tabular-nums sm:text-4xl">
              {formatNumber(kpis.taps.value)}
            </dd>
            <p className="mt-2 text-xs text-muted-foreground">
              {formatChange(kpis.taps.value, kpis.taps.previous) ?? "NFC + QR"}
              {kpis.taps.previous > 0 ? " к прошлому периоду" : ""}
            </p>
          </div>
          <div className="px-3 py-5 sm:px-6" data-testid="kpi-reviews">
            <dt className="min-h-10 text-sm text-muted-foreground sm:min-h-0">Изменение отзывов</dt>
            <dd className="mt-2 text-2xl font-semibold tracking-tight tabular-nums sm:text-4xl">
              {kpis.newReviews.value === null
                ? "—"
                : `${kpis.newReviews.value > 0 ? "+" : ""}${formatNumber(kpis.newReviews.value)}`}
            </dd>
            <p className="mt-2 text-xs text-muted-foreground">Из всех источников</p>
          </div>
          <div className="py-5 pl-3 sm:pl-6" data-testid="kpi-rating">
            <dt className="min-h-10 text-sm text-muted-foreground sm:min-h-0">
              {venueCount > 1 ? "Средний рейтинг" : "Рейтинг 2ГИС"}
            </dt>
            <dd className="mt-2 text-2xl font-semibold tracking-tight tabular-nums sm:text-4xl">
              {kpis.rating.value === null ? "—" : formatRating(kpis.rating.value)}
              <span className="ml-1 text-sm font-normal text-muted-foreground">/ 5</span>
            </dd>
            <p className="mt-2 text-xs text-muted-foreground">На конец периода</p>
          </div>
        </dl>
      </section>
      <DashboardChart daily={data.daily} />
      <details className="text-sm text-muted-foreground">
        <summary className="w-fit cursor-pointer py-1 underline-offset-4 hover:text-foreground hover:underline">
          Как считаем
        </summary>
        <div className="mt-2 max-w-3xl space-y-2 leading-relaxed">
          <p>{t("attribution")}</p>
          <p>
            Переходы — это открытия ссылки карты. Боты и повторные переходы в течение 30 минут не учитываются.
          </p>
        </div>
      </details>
      <section aria-labelledby="used-cards-title">
        <div className="mb-3 flex items-center justify-between gap-3">
          <h2 id="used-cards-title" className="font-semibold">
            Переходы по картам
          </h2>
          <Link href="/app/cards" className="text-sm text-primary underline-offset-4 hover:underline">
            {t("allCards")}
          </Link>
        </div>

        {data.topCards.length ? (
          <ul className="divide-y">
            {data.topCards.map((c) => (
              <li key={c.id} className="grid gap-2 py-3">
                <div className="flex flex-wrap items-center justify-between gap-x-4 gap-y-2">
                  <div>
                    <Link
                      href={`/app/cards/${c.id}` as Route}
                      className="font-medium underline-offset-4 hover:underline"
                    >
                      {t("summary.card", { name: c.label })}
                    </Link>
                    <p className="text-sm text-muted-foreground">{c.location}</p>
                  </div>
                  <span className="flex shrink-0 items-center gap-3 text-sm tabular-nums">
                    {t("summary.cardTaps", { count: c.taps })}
                    <ArrowRight className="size-4 text-muted-foreground" aria-hidden="true" />
                  </span>
                </div>
                <div aria-hidden="true" className="h-1 overflow-hidden rounded-sm bg-muted">
                  <div
                    className="h-full rounded-sm bg-primary/70"
                    style={{
                      width: `${data.topCards[0]?.taps ? (c.taps / data.topCards[0].taps) * 100 : 0}%`,
                    }}
                  />
                </div>
              </li>
            ))}
          </ul>
        ) : (
          <p className="text-sm text-muted-foreground">{t("charts.topEmpty")}</p>
        )}
      </section>
    </div>
  );
}

export function DashboardSkeleton() {
  return (
    <div className="grid gap-6" aria-busy="true">
      <Skeleton className="h-32" />
      <Skeleton className="h-80" />
    </div>
  );
}
