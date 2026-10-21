"use client";

import { ChartTable } from "@/components/charts/chart-table";
import { TimeSeriesChart } from "@/components/charts/time-series-chart";
import { Card, CardContent } from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { formatIsoDate, formatNumber, formatRating } from "@/lib/format";
import type { DashboardData } from "@/server/services/analytics-service";

const metrics = [
  {
    key: "taps",
    label: "Переходы",
    title: "Переходы по дням",
    note: "Открытия ссылки карты через NFC и QR.",
    format: "number",
  },
  {
    key: "reviewChange",
    label: "Отзывы",
    title: "Изменение отзывов по дням",
    note: "Разница между концом и началом дня в 2ГИС, из всех источников. Минус — отзывов стало меньше.",
    format: "signed",
  },
  {
    key: "rating",
    label: "Рейтинг",
    title: "Рейтинг 2ГИС по дням",
    note: "Рейтинг на конец каждого дня. Для нескольких заведений — средний.",
    format: "rating",
  },
] as const;

export function DashboardChart({ daily }: { daily: DashboardData["daily"] }) {
  return (
    <Card>
      <CardContent>
        <Tabs defaultValue="taps">
          <TabsList variant="line" aria-label="Показатель графика" className="mb-4">
            {metrics.map((metric) => (
              <TabsTrigger key={metric.key} value={metric.key}>
                {metric.label}
              </TabsTrigger>
            ))}
          </TabsList>
          {metrics.map((metric) => {
            const points = daily.map((day) => ({ date: day.date, value: day[metric.key] }));
            const format =
              metric.format === "rating"
                ? formatRating
                : metric.format === "signed"
                  ? (value: number) => `${value > 0 ? "+" : ""}${formatNumber(value)}`
                  : formatNumber;
            return (
              <TabsContent key={metric.key} value={metric.key} className="grid gap-4">
                <div>
                  <h3 className="font-semibold">{metric.title}</h3>
                  <p className="mt-1 text-xs text-muted-foreground">{metric.note}</p>
                </div>
                {points.some((point) => point.value !== null) ? (
                  <TimeSeriesChart
                    kind={metric.key === "taps" ? "area" : metric.key === "reviewChange" ? "bar" : "line"}
                    label={metric.label}
                    color="var(--chart-1)"
                    data={points}
                    valueFormat={metric.format}
                    tightDomain={metric.key === "rating"}
                    ariaLabel={metric.title}
                  />
                ) : (
                  <p className="flex h-55 items-center justify-center text-muted-foreground">
                    За этот период данных пока нет
                  </p>
                )}
                <ChartTable
                  summary="Показать данные таблицей"
                  headers={["Дата", metric.label]}
                  rows={points.map((point) => [
                    formatIsoDate(point.date, "long"),
                    point.value === null ? "—" : format(point.value),
                  ])}
                />
              </TabsContent>
            );
          })}
        </Tabs>
      </CardContent>
    </Card>
  );
}
