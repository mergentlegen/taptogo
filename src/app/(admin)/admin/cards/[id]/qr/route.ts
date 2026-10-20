import { authorizePlatformAction } from "@/server/auth/session";
import { AppError } from "@/server/errors";
import { cardUrl, qrSvg } from "@/server/qr";
import { getServices } from "@/server/services";

/** GET /admin/cards/{id}/qr — QR (SVG) for checking a tag on the flashing page. */
export async function GET(_request: Request, { params }: RouteContext<"/admin/cards/[id]/qr">) {
  try {
    await authorizePlatformAction("admin.access");
  } catch (error) {
    return new Response(null, {
      status: error instanceof AppError && error.code === "UNAUTHORIZED" ? 401 : 403,
    });
  }
  const card = await getServices().admin.cards.find((await params).id);
  if (!card) return new Response(null, { status: 404 });
  return new Response(await qrSvg(cardUrl(card.code, "nfc")), {
    headers: {
      "Content-Type": "image/svg+xml",
      "Cache-Control": "private, no-store",
      "X-Content-Type-Options": "nosniff",
    },
  });
}
