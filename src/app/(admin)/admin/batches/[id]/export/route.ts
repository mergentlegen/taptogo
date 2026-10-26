import { authorizePlatformAction } from "@/server/auth/session";
import { AppError } from "@/server/errors";
import { getServices } from "@/server/services";

/** GET /admin/batches/{id}/export — the ZIP with one SVG QR per card, for the print shop. */
export async function GET(_request: Request, { params }: RouteContext<"/admin/batches/[id]/export">) {
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
  try {
    const file = await getServices().admin.cards.exportBatchZip(ctx, id);
    return new Response(new Uint8Array(file.body), {
      headers: {
        "Content-Type": "application/zip",
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
