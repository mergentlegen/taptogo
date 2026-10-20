import { after, NextResponse, type NextRequest } from "next/server";

import type { TapSource } from "@/features/analytics/schemas";
import { isBotUserAgent } from "@/features/analytics/user-agent";
import {
  analyzeVisit,
  VISITOR_COOKIE,
  VISITOR_COOKIE_MAX_AGE_SECONDS,
} from "@/features/analytics/visitor-cookie";
import { getContainer } from "@/server/container";
import { renderCardPage, type CardPageKind } from "@/server/redirect/card-page";
import { clientIpFrom } from "@/server/security/client-ip";
import type { RateLimiter, RateLimitRule } from "@/server/security/rate-limiter";
import { CardRedirectService } from "@/server/services/card-redirect-service";
import { TapRecorder } from "@/server/services/tap-recorder";

/**
 * GET /t/{code} — the URL written on NFC tags and printed as QR (?s=q).
 *
 * Answers immediately: a 302 to the stored review page, or a neutral page.
 * The tap is written after the response is sent (after()), and a failure to
 * write it is logged but never affects the guest.
 */

const RATE_LIMIT: RateLimitRule = { limit: 60, windowMs: 60_000 };

const COMMON_HEADERS = {
  "Cache-Control": "no-store",
  "Referrer-Policy": "no-referrer",
  "X-Robots-Tag": "noindex, nofollow",
};

const PAGE_CSP =
  "default-src 'none'; style-src 'unsafe-inline'; img-src data:; base-uri 'none'; form-action 'none'; frame-ancestors 'none'";

const PAGE_STATUS: Record<CardPageKind, number> = {
  NOT_FOUND: 404,
  NOT_ACTIVATED: 200,
  INACTIVE: 200,
  RATE_LIMITED: 429,
  UNAVAILABLE: 503,
};

function pageResponse(kind: CardPageKind, extraHeaders: Record<string, string> = {}): NextResponse {
  return new NextResponse(renderCardPage(kind), {
    status: PAGE_STATUS[kind],
    headers: {
      ...COMMON_HEADERS,
      "Content-Type": "text/html; charset=utf-8",
      "Content-Security-Policy": PAGE_CSP,
      ...extraHeaders,
    },
  });
}

/** Seconds to wait when over the limit; null when allowed. A limiter outage never blocks guests. */
async function retryAfterSeconds(request: NextRequest, rateLimiter: RateLimiter): Promise<number | null> {
  const key = `t:ip:${clientIpFrom(request.headers) ?? "unknown"}`;
  try {
    const state = await rateLimiter.check(key, RATE_LIMIT);
    if (!state.allowed) return Math.max(1, Math.ceil(state.retryAfterMs / 1000));
    await rateLimiter.hit(key, RATE_LIMIT);
  } catch (error) {
    console.error("[redirect] rate limiter unavailable", error);
  }
  return null;
}

async function handle(request: NextRequest, code: string, isHeadRequest: boolean): Promise<NextResponse> {
  const now = new Date();
  try {
    // Guests are anonymous: the redirect reads and writes without a user (see Container).
    const { systemRepositories: repositories, rateLimiter } = getContainer();

    const retryAfter = await retryAfterSeconds(request, rateLimiter);
    if (retryAfter !== null) {
      // Over the limit: no redirect and no event.
      return pageResponse("RATE_LIMITED", { "Retry-After": String(retryAfter) });
    }

    const decision = await new CardRedirectService(repositories).resolve(code);
    if (decision.kind !== "REDIRECT") return pageResponse(decision.kind);

    const userAgent = request.headers.get("user-agent");
    const isBot = isHeadRequest || isBotUserAgent(userAgent);
    const visit = analyzeVisit({
      cookie: request.cookies.get(VISITOR_COOKIE)?.value,
      code,
      now,
      timeZone: decision.timeZone,
    });
    const source: TapSource = request.nextUrl.searchParams.get("s") === "q" ? "QR" : "NFC";
    const eventId = crypto.randomUUID();

    after(async () => {
      try {
        await new TapRecorder(repositories).record({
          eventId,
          card: decision.card,
          occurredAt: now,
          source,
          userAgent,
          isHeadRequest,
          visit,
          timeZone: decision.timeZone,
        });
      } catch (error) {
        console.error(`[tap] failed to record ${eventId}`, error);
      }
    });

    const response = new NextResponse(null, {
      status: 302,
      headers: { ...COMMON_HEADERS, Location: decision.url },
    });
    if (!isBot) {
      response.cookies.set(VISITOR_COOKIE, visit.cookieValue, {
        httpOnly: true,
        secure: process.env.NODE_ENV === "production",
        sameSite: "lax",
        path: "/t",
        maxAge: VISITOR_COOKIE_MAX_AGE_SECONDS,
      });
    }
    return response;
  } catch (error) {
    // Never a raw 500 for a guest standing at the counter.
    console.error(`[redirect] failed for /t/${code}`, error);
    return pageResponse("UNAVAILABLE");
  }
}

export async function GET(request: NextRequest, { params }: RouteContext<"/t/[code]">) {
  return handle(request, (await params).code, false);
}

/** HEAD requests come from link-preview bots and monitoring; recorded as bots. */
export async function HEAD(request: NextRequest, { params }: RouteContext<"/t/[code]">) {
  return handle(request, (await params).code, true);
}
