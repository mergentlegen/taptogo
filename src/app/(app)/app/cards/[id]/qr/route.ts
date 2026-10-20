import type { NextRequest } from "next/server";

import { authorizeOrgAction } from "@/server/auth/session";
import { AppError } from "@/server/errors";
import { cardUrl, qrPng, qrSvg } from "@/server/qr";
import { getServices } from "@/server/services";
import { orgContextFrom, type OrgContext } from "@/server/services/context";

/** GET /app/cards/{id}/qr?format=svg|png — download the card's QR for printing. */
export async function GET(request: NextRequest, { params }: RouteContext<"/app/cards/[id]/qr">) {
  let ctx: OrgContext;
  try {
    ctx = orgContextFrom(await authorizeOrgAction("org.view"));
  } catch (error) {
    const status = error instanceof AppError && error.code === "UNAUTHORIZED" ? 401 : 403;
    return new Response(null, { status });
  }

  const { id } = await params;
  const card = await getServices().cards.find(ctx, id);
  if (!card) return new Response(null, { status: 404 });

  const url = cardUrl(card.code, "qr");
  const filename = `taptogo-${card.code}`;
  const headers = { "Cache-Control": "private, no-store", "X-Content-Type-Options": "nosniff" };

  if (request.nextUrl.searchParams.get("format") === "png") {
    return new Response(new Uint8Array(await qrPng(url)), {
      headers: {
        ...headers,
        "Content-Type": "image/png",
        "Content-Disposition": `attachment; filename="${filename}.png"`,
      },
    });
  }
  return new Response(await qrSvg(url), {
    headers: {
      ...headers,
      "Content-Type": "image/svg+xml",
      "Content-Disposition": `attachment; filename="${filename}.svg"`,
    },
  });
}
