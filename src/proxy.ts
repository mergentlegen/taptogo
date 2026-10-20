import { NextResponse, type NextRequest } from "next/server";

import { parseEnv } from "@/env.core";
import { buildContentSecurityPolicy } from "@/lib/security/csp";
import { SESSION_COOKIE } from "@/server/auth/cookies";
import { verifySessionToken } from "@/server/auth/session-token";

const PROTECTED_PATHS = [/^\/app(\/|$)/, /^\/admin(\/|$)/];

let sessionSecret: string | undefined;
function getSessionSecret(): string {
  sessionSecret ??= parseEnv(process.env).SESSION_SECRET;
  return sessionSecret;
}

/**
 * 1. Optimistic auth check: protected sections need a correctly signed,
 *    unexpired session cookie, otherwise → /login?next=…  The real check
 *    (revocation, roles, organization) happens on the server in every page
 *    and action; this only avoids rendering for obviously anonymous visitors.
 * 2. Per-request CSP nonce.
 */
export async function proxy(request: NextRequest) {
  const { pathname, search } = request.nextUrl;

  if (PROTECTED_PATHS.some((pattern) => pattern.test(pathname))) {
    const token = request.cookies.get(SESSION_COOKIE)?.value;
    const valid = token ? await verifySessionToken(token, getSessionSecret()) : null;
    if (!valid) {
      const login = new URL("/login", request.url);
      login.searchParams.set("next", `${pathname}${search}`);
      const response = NextResponse.redirect(login);
      if (token) response.cookies.delete(SESSION_COOKIE);
      return response;
    }
  }

  const nonce = Buffer.from(crypto.randomUUID()).toString("base64");
  const csp = buildContentSecurityPolicy({
    nonce,
    isDevelopment: process.env.NODE_ENV === "development",
  });

  const requestHeaders = new Headers(request.headers);
  requestHeaders.set("x-nonce", nonce);
  requestHeaders.set("Content-Security-Policy", csp);

  const response = NextResponse.next({ request: { headers: requestHeaders } });
  response.headers.set("Content-Security-Policy", csp);
  return response;
}

export const config = {
  matcher: [
    {
      // Skip static assets and the card redirect endpoint (/t/{code}),
      // which returns a bare 302 and must stay as fast as possible.
      source: "/((?!_next/static|_next/image|favicon.ico|icon.svg|t/).*)",
      missing: [
        { type: "header", key: "next-router-prefetch" },
        { type: "header", key: "purpose", value: "prefetch" },
      ],
    },
  ],
};
