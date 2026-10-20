import type { NextRequest } from "next/server";

import { authorizePlatformAction } from "@/server/auth/session";
import { AppError } from "@/server/errors";
import { getServices } from "@/server/services";

/** GET /admin/batches/{id}/export?format=csv|zip — files for the print shop. */
export async function GET(request: NextRequest, { params }: RouteContext<"/admin/batches/[id]/export">) {
  let ctx;
  try {
    const { session } = await authorizePlatformAction("admin.access");
    if (!session.user.platformRole) return new Response(null, { status: 403 });
    ctx = { userId: session.user.id, role: session.user.platformRole, sessionId: session.id };
  } catch (error) {
    return new Response(null, {
      status: error instanceof AppError && error.code === "UNAUTHORIZED" ? 401 : 403,
    });
  }

  const { id } = await params;
  const service = getServices().admin.cards;
  try {
    const zip = request.nextUrl.searchParams.get("format") === "zip";
    const file = zip ? await service.exportBatchZip(ctx, id) : await service.exportBatchCsv(ctx, id);
    const body = typeof file.body === "string" ? file.body : new Uint8Array(file.body);
    return new Response(body, {
      headers: {
        "Content-Type": zip ? "application/zip" : "text/csv; charset=utf-8",
        "Content-Disposition": `attachment; filename="${file.filename}"`,
        "Cache-Control": "private, no-store",
        "X-Content-Type-Options": "nosniff",
      },
    });
  } catch (error) {
    if (error instanceof AppError && error.code === "NOT_FOUND") return new Response(null, { status: 404 });
    throw error;
  }
}
