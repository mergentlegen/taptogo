import { Download } from "lucide-react";
import type { Metadata, Route } from "next";
import { getTranslations } from "next-intl/server";
import Link from "next/link";

import { PeriodFilter } from "@/components/analytics/period-filter";
import { PageHeader } from "@/components/layout/page-header";
import { StatsGate } from "@/components/subscription/stats-gate";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Table,
  TableBody,
  TableCell,
  TableFooter,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { NotificationSwitch } from "@/features/settings/components/notification-switch";
import type { CellValue } from "@/lib/csv";
import { toLocalDate } from "@/lib/dates";
import { formatIsoDate, formatNumber, formatRating } from "@/lib/format";
import { resolvePeriod, searchParam } from "@/lib/period";
import { cn } from "@/lib/utils";
import { requireOrgAccess } from "@/server/auth/session";
import { getContainer } from "@/server/container";
import { getServices } from "@/server/services";
import { orgContextFrom } from "@/server/services/context";
import { reportDimensions, type ReportColumn } from "@/server/services/report-service";

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations("app.pages.reports");
  return { title: t("title") };
}

const PREVIEW_ROWS = 100;
const NUMERIC: readonly ReportColumn[] = [
  "taps",
  "uniqueVisitors",
  "nfcTaps",
  "qrTaps",
  "cards",
  "newReviews",
  "rating",
];

function display(column: ReportColumn, value: CellValue): string {
  if (value === null) return "—";
  if (column === "date" && typeof value === "string") return formatIsoDate(value, "long");
  if (column === "rating" && typeof value === "number") return formatRating(value);
  return typeof value === "number" ? formatNumber(value) : value;
}

export default async function ReportsPage({ searchParams }: PageProps<"/app/reports">) {
  const access = await requireOrgAccess("org.view");
  const ctx = orgContextFrom(access);
  const params = await searchParams;
  const services = getServices();
  const today = toLocalDate(getContainer().clock(), ctx.timeZone);
  const raw = {
    period: searchParam(params.period),
    from: searchParam(params.from),
    to: searchParam(params.to),
  };
  const period = resolvePeriod(raw, today);
  const dimension = reportDimensions.find((d) => d === searchParam(params.dimension)) ?? "days";

  const [subscription, notifications, t] = await Promise.all([
    services.subscription.view(ctx),
    services.account.notifications(ctx),
    getTranslations("reports"),
  ]);
  const report = subscription.statsAllowed ? await services.reports.build(ctx, period, dimension) : null;

  const query = (extra: Record<string, string>) => {
    const search = new URLSearchParams({
      period: period.preset,
      ...(period.preset === "custom" && { from: period.from, to: period.to }),
      dimension,
      ...extra,
    });
    return search.toString();
  };

  return (
    <>
      <PageHeader
        title={(await getTranslations("app.pages.reports"))("title")}
        description={t("exportHint")}
      />

      <Card className="mb-4">
        <CardContent>
          <NotificationSwitch
            name="weeklyReportEmail"
            checked={notifications.weeklyReportEmail}
            label={t("weekly.title")}
            hint={t("weekly.text")}
            savedMessage={t("weekly.saved")}
          />
        </CardContent>
      </Card>

      <StatsGate subscription={subscription}>
        {report && (
          <div className="grid gap-4">
            <div className="grid gap-3">
              <PeriodFilter period={period.preset} from={period.from} to={period.to} today={today} />
              <nav
                aria-label={t("dimension")}
                className="flex flex-wrap gap-1 rounded-lg bg-muted p-1 sm:w-fit"
              >
                {reportDimensions.map((d) => (
                  <Link
                    key={d}
                    href={`/app/reports?${query({ dimension: d })}` as Route}
                    scroll={false}
                    aria-current={d === dimension ? "page" : undefined}
                    className={cn(
                      "rounded-md px-3 py-1.5 text-sm font-medium text-muted-foreground transition-colors hover:text-foreground",
                      d === dimension && "bg-background text-foreground shadow-sm",
                    )}
                  >
                    {t(`dimensions.${d}`)}
                  </Link>
                ))}
              </nav>
            </div>

            <Card>
              <CardHeader className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                <div>
                  <CardTitle>{t("preview")}</CardTitle>
                  <CardDescription>
                    {formatIsoDate(period.from, "long")} — {formatIsoDate(period.to, "long")} ·{" "}
                    {t("rows", { count: report.rows.length })}
                  </CardDescription>
                </div>
                <div className="flex gap-2">
                  <Button asChild variant="outline">
                    <a href={`/app/reports/export?${query({ format: "csv" })}`} download>
                      <Download data-icon="inline-start" />
                      {t("exportCsv")}
                    </a>
                  </Button>
                  <Button asChild>
                    <a href={`/app/reports/export?${query({ format: "xlsx" })}`} download>
                      <Download data-icon="inline-start" />
                      {t("exportXlsx")}
                    </a>
                  </Button>
                </div>
              </CardHeader>
              <CardContent>
                <div className="max-h-[32rem] overflow-auto rounded-lg border">
                  <Table>
                    <TableHeader className="sticky top-0 bg-card">
                      <TableRow>
                        {report.columns.map((column) => (
                          <TableHead key={column} className={cn(NUMERIC.includes(column) && "text-right")}>
                            {t(`columns.${column}`)}
                          </TableHead>
                        ))}
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {report.rows.slice(0, PREVIEW_ROWS).map((row, index) => (
                        <TableRow key={index}>
                          {report.columns.map((column) => (
                            <TableCell
                              key={column}
                              className={cn(NUMERIC.includes(column) && "text-right tabular-nums")}
                            >
                              {display(column, row[column])}
                            </TableCell>
                          ))}
                        </TableRow>
                      ))}
                    </TableBody>
                    <TableFooter>
                      <TableRow>
                        {report.columns.map((column, index) => (
                          <TableCell
                            key={column}
                            className={cn(NUMERIC.includes(column) && "text-right tabular-nums")}
                          >
                            {index === 0
                              ? t("total")
                              : column in report.totals
                                ? display(column, report.totals[column] ?? null)
                                : ""}
                          </TableCell>
                        ))}
                      </TableRow>
                    </TableFooter>
                  </Table>
                </div>
              </CardContent>
            </Card>
          </div>
        )}
      </StatsGate>
    </>
  );
}
