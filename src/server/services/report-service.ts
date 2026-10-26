import { createTranslator } from "next-intl";

import { defaultLocale } from "@/i18n/config";
import messages from "@/i18n/messages/ru.json";
import { sanitizeCell, toCsv, type CellValue } from "@/lib/csv";
import { addDays, eachDate } from "@/lib/dates";
import type { Period } from "@/lib/period";
import { createXlsx } from "@/lib/xlsx";
import type { Repositories, StatDimension } from "@/server/repositories";
import { forOrganization } from "@/server/repositories/tenant";
import type { AuditService } from "@/server/services/audit-service";

import { assertOrgPermission, byKey, ZERO_TOTALS, type OrgContext } from "./context";
import { RatingHistory } from "./rating-history";

export const reportDimensions = ["days", "cards", "employees", "locations"] as const;
export type ReportDimension = (typeof reportDimensions)[number];

const GROUP_BY = {
  days: "date",
  cards: "cardId",
  employees: "employeeId",
  locations: "locationId",
} as const satisfies Record<ReportDimension, StatDimension>;

export const reportColumnKeys = [
  "date",
  "card",
  "code",
  "location",
  "employee",
  "taps",
  "uniqueVisitors",
  "nfcTaps",
  "qrTaps",
  "cards",
  "rating",
  "newReviews",
] as const;
export type ReportColumn = (typeof reportColumnKeys)[number];

export type Report = {
  dimension: ReportDimension;
  period: { from: string; to: string };
  columns: ReportColumn[];
  rows: Record<ReportColumn, CellValue>[];
  /** Sum row for numeric columns (null where summing makes no sense). */
  totals: Partial<Record<ReportColumn, CellValue>>;
};

const COLUMNS: Record<ReportDimension, ReportColumn[]> = {
  days: ["date", "taps", "uniqueVisitors", "nfcTaps", "qrTaps"],
  cards: ["card", "code", "location", "employee", "taps", "uniqueVisitors", "nfcTaps", "qrTaps"],
  employees: ["employee", "location", "cards", "taps", "uniqueVisitors"],
  locations: ["location", "taps", "uniqueVisitors", "rating", "newReviews"],
};
const SUMMABLE: readonly ReportColumn[] = ["taps", "uniqueVisitors", "nfcTaps", "qrTaps", "newReviews"];

const emptyRow = (): Record<ReportColumn, CellValue> =>
  Object.fromEntries(reportColumnKeys.map((key) => [key, null])) as Record<ReportColumn, CellValue>;

const t = createTranslator({ locale: defaultLocale, messages, namespace: "reports" });

/**
 * Aggregated reports only. Raw tap events never leave the system through
 * exports — they contain nothing a client needs and keeping them in is safer.
 */
export class ReportService {
  constructor(
    private readonly repositories: Repositories,
    private readonly audit: AuditService,
  ) {}

  async build(ctx: OrgContext, period: Period, dimension: ReportDimension): Promise<Report> {
    const repos = forOrganization(this.repositories, ctx.organizationId);
    // One SQL group-by per report: rows grow with days/cards/employees, never with cards × days.
    const [grouped, cards, employees, locations] = await Promise.all([
      repos.dailyStats
        .totalsBy({ from: period.from, to: period.to }, GROUP_BY[dimension])
        .then((groups) => byKey(groups)),
      repos.cards.list(),
      repos.employees.list(),
      repos.locations.list(),
    ]);
    const locationName = new Map(locations.map((l) => [l.id, l.name]));
    const employeeName = new Map(employees.map((e) => [e.id, e.name]));
    let rows: Record<ReportColumn, CellValue>[];

    switch (dimension) {
      case "days": {
        rows = eachDate(period.from, period.to).map((date) => {
          const totals = grouped.get(date) ?? ZERO_TOTALS;
          return { ...emptyRow(), date, ...totals };
        });
        break;
      }
      case "cards": {
        rows = cards
          .filter((c) => c.status !== "UNASSIGNED")
          .map((c) => ({
            ...emptyRow(),
            card: c.label,
            code: c.code,
            location: c.locationId ? (locationName.get(c.locationId) ?? null) : null,
            employee: c.employeeId ? (employeeName.get(c.employeeId) ?? null) : null,
            ...(grouped.get(c.id) ?? ZERO_TOTALS),
          }));
        break;
      }
      case "employees": {
        rows = employees.map((e) => {
          const totals = grouped.get(e.id) ?? ZERO_TOTALS;
          return {
            ...emptyRow(),
            employee: e.name,
            location: e.locationId ? (locationName.get(e.locationId) ?? null) : null,
            cards: cards.filter((c) => c.employeeId === e.id).length,
            taps: totals.taps,
            uniqueVisitors: totals.uniqueVisitors,
          };
        });
        break;
      }
      case "locations": {
        const history = new RatingHistory(
          await repos.ratingSnapshots.list({ locationIds: locations.map((l) => l.id) }),
          ctx.timeZone,
        );
        rows = locations.map((l) => {
          const totals = grouped.get(l.id) ?? ZERO_TOTALS;
          const rating = history.ratingAt([l.id], addDays(period.to, 1));
          return {
            ...emptyRow(),
            location: l.name,
            taps: totals.taps,
            uniqueVisitors: totals.uniqueVisitors,
            rating: rating === null ? null : Math.round(rating * 100) / 100,
            newReviews: history.newReviews([l.id], period.from, period.to),
          };
        });
        break;
      }
    }

    const sortKey = dimension === "days" ? null : "taps";
    if (sortKey) rows.sort((a, b) => Number(b[sortKey] ?? 0) - Number(a[sortKey] ?? 0));

    const columns = COLUMNS[dimension];
    const totals: Partial<Record<ReportColumn, CellValue>> = {};
    for (const column of columns) {
      if (SUMMABLE.includes(column)) {
        totals[column] = rows.reduce(
          (sum, row) => sum + (typeof row[column] === "number" ? row[column] : 0),
          0,
        );
      }
    }
    return { dimension, period: { from: period.from, to: period.to }, columns, rows, totals };
  }

  async export(ctx: OrgContext, report: Report, format: "csv" | "xlsx") {
    assertOrgPermission(ctx, "org.export");
    const headers = report.columns.map((column) => t(`columns.${column}`));
    const body = report.rows.map((row) => report.columns.map((column) => row[column]));
    const filename = `taptogo-${report.dimension}-${report.period.from}_${report.period.to}.${format}`;

    await this.audit.record({
      actorUserId: ctx.userId,
      action: "report.export",
      entityType: "report",
      entityId: null,
      organizationId: ctx.organizationId,
      after: { dimension: report.dimension, format, from: report.period.from, to: report.period.to },
    });

    if (format === "csv") {
      return { filename, contentType: "text/csv; charset=utf-8", body: toCsv(headers, body) };
    }

    const buffer = await createXlsx({
      sheet: t(`dimensions.${report.dimension}`),
      headers,
      rows: body.map((row) => row.map(sanitizeCell)),
    });
    return {
      filename,
      contentType: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      body: buffer,
    };
  }
}
