import type { NextRequest } from "next/server";

import { toLocalDate } from "@/lib/dates";
import { resolvePeriod } from "@/lib/period";
import { authorizeOrgAction } from "@/server/auth/session";
import { getContainer } from "@/server/container";
import { AppError } from "@/server/errors";
import { getServices } from "@/server/services";
import { orgContextFrom } from "@/server/services/context";
import { reportDimensions } from "@/server/services/report-service";

/** GET /app/reports/export?format=csv|xlsx&dimension=&period=&from=&to= */
export async function GET(request: NextRequest) {
  let access;
  try {
    access = await authorizeOrgAction("org.export");
  } catch (error) {
    return new Response(null, {
      status: error instanceof AppError && error.code === "UNAUTHORIZED" ? 401 : 403,
    });
  }

  const ctx = orgContextFrom(access);
  const services = getServices();

  const query = request.nextUrl.searchParams;
  const format = query.get("format") === "xlsx" ? "xlsx" : "csv";
  const dimension = reportDimensions.find((d) => d === query.get("dimension")) ?? "days";
  const today = toLocalDate(getContainer().clock(), ctx.timeZone);
  const period = resolvePeriod(
    { period: query.get("period"), from: query.get("from"), to: query.get("to") },
    today,
  );

  const report = await services.reports.build(ctx, period, dimension);
  const file = await services.reports.export(ctx, report, format);
  return new Response(file.body, {
    headers: {
      "Content-Type": file.contentType,
      "Content-Disposition": `attachment; filename="${file.filename}"`,
      "Cache-Control": "private, no-store",
      "X-Content-Type-Options": "nosniff",
    },
  });
}
