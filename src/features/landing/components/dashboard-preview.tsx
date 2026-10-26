import { getTranslations } from "next-intl/server";

import { TimeSeriesChart } from "@/components/charts/time-series-chart";
import { TopList } from "@/components/charts/top-list";
import { StatCard } from "@/components/data/stat-card";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { DEFAULT_TIME_ZONE, toLocalDate } from "@/lib/dates";
import { formatChange, formatNumber } from "@/lib/format";

import { landingPreviewData } from "../preview-data";

type Change = { text: string; direction: "up" | "down" | "flat" } | null;
const up = (text: string | null): Change => (text ? { text, direction: "up" } : null);

/** The owner's dashboard rebuilt from the real components on static demo numbers. */
export async function DashboardPreview() {
  const t = await getTranslations("public.preview");
  const data = landingPreviewData(toLocalDate(new Date(), DEFAULT_TIME_ZONE));
  const names = t.raw("employees") as string[];
  const roles = t.raw("roles") as string[];

  return (
    <figure className="grid gap-3">
      <div className="overflow-hidden rounded-2xl border bg-background shadow-xl shadow-primary/5">
        <div aria-hidden="true" className="flex items-center gap-1.5 border-b bg-muted/50 px-4 py-2.5">
          <span className="size-2.5 rounded-full bg-muted-foreground/25" />
          <span className="size-2.5 rounded-full bg-muted-foreground/25" />
          <span className="size-2.5 rounded-full bg-muted-foreground/25" />
        </div>
        <div className="grid gap-4 p-4 sm:p-6">
          <div className="grid grid-cols-2 gap-3">
            <StatCard
              label={t("taps")}
              value={formatNumber(data.taps.current)}
              change={up(formatChange(data.taps.current, data.taps.previous))}
              changeCaption={t("vsPrevious")}
            />
            <StatCard label={t("perDay")} value={formatNumber(data.perDay)} />
          </div>
          <div className="grid gap-4 lg:grid-cols-[minmax(0,2fr)_minmax(0,1fr)]">
            <Card>
              <CardHeader>
                <CardTitle>{t("chartTitle")}</CardTitle>
              </CardHeader>
              <CardContent>
                <TimeSeriesChart
                  kind="bar"
                  label={t("chartLabel")}
                  color="var(--chart-1)"
                  data={data.daily.map((d) => ({ date: d.date, value: d.taps }))}
                  height={200}
                  ariaLabel={`${t("chartTitle")}: ${formatNumber(data.taps.current)}`}
                />
              </CardContent>
            </Card>
            <Card>
              <CardHeader>
                <CardTitle>{t("topTitle")}</CardTitle>
              </CardHeader>
              <CardContent>
                <TopList
                  emptyText=""
                  items={data.topEmployees.map((value, index) => ({
                    id: String(index),
                    label: names[index] ?? "",
                    sublabel: roles[index] ?? null,
                    value,
                  }))}
                />
              </CardContent>
            </Card>
          </div>
        </div>
      </div>
      <figcaption className="text-center text-xs text-muted-foreground">{t("caption")}</figcaption>
    </figure>
  );
}
