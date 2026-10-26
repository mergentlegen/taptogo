import { createServerClient } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";

import { DEV_SESSION_SECRET } from "@/dev-session-secret";
import { buildContentSecurityPolicy } from "@/lib/security/csp";
import { SESSION_COOKIE } from "@/server/auth/cookies";
import { verifySessionToken } from "@/server/auth/session-token";

const PROTECTED_PATHS = [/^\/app(\/|$)/, /^\/admin(\/|$)/];

/**
 * Plain reads instead of the validated environment: this file is bundled separately for
 * the middleware runtime, and the schema library would double its size. Full validation
 * happens in the server code (src/env.core.ts), which a misconfigured deployment cannot get past.
 */
function readEnv() {
  const env = process.env;
  return {
    dataSource: env.DATA_SOURCE === "supabase" ? ("supabase" as const) : ("mock" as const),
    sessionSecret: env.SESSION_SECRET || DEV_SESSION_SECRET,
    supabaseUrl: env.SUPABASE_URL ?? "",
    supabaseKey: env.SUPABASE_PUBLISHABLE_KEY ?? "",
    isProduction: env.NODE_ENV === "production",
  };
}

type PendingCookie = { name: string; value: string; options: Record<string, unknown> };

/**
 * Supabase Auth: refreshes the access token when it has expired and reports whether the
 * request carries a valid session. Refreshed cookies go to `pending` and are written to
 * the response (and to the request, so Server Components of this very request see them).
 * Only the signature and expiry are checked here; whether the session still exists is
 * checked on the server in every page and action.
 */
async function hasSupabaseSession(request: NextRequest, pending: PendingCookie[]): Promise<boolean> {
  const { supabaseUrl, supabaseKey } = readEnv();
  const supabase = createServerClient(supabaseUrl, supabaseKey, {
    cookies: {
      getAll: () => request.cookies.getAll(),
      setAll: (toSet) => {
        for (const { name, value, options } of toSet) {
          request.cookies.set(name, value);
          pending.push({ name, value, options });
        }
      },
    },
  });
  const { data } = await supabase.auth.getClaims();
  return Boolean(data?.claims);
}

/** Supabase cookies are never read by scripts in this app, so they are HttpOnly. */
function withCookies<T extends NextResponse>(response: T, pending: PendingCookie[]): T {
  for (const { name, value, options } of pending) {
    response.cookies.set(name, value, {
      ...options,
      httpOnly: true,
      secure: readEnv().isProduction,
      sameSite: "lax",
    });
  }
  return response;
}

/**
 * 1. Optimistic auth check: protected sections need a valid session, otherwise →
 *    /login?next=…  The real check (revocation, roles, organization) happens on the
 *    server in every page and action; this only avoids rendering for obviously
 *    anonymous visitors. With Supabase it also keeps the session cookies fresh.
 * 2. Per-request CSP nonce.
 */
export async function proxy(request: NextRequest) {
  const { pathname, search } = request.nextUrl;
  const env = readEnv();
  const isProtected = PROTECTED_PATHS.some((pattern) => pattern.test(pathname));
  const pending: PendingCookie[] = [];

  if (env.dataSource === "supabase") {
    // Visitors without any Supabase cookie have nothing to refresh: skip the work.
    const hasCookie = request.cookies.getAll().some((cookie) => cookie.name.startsWith("sb-"));
    const signedIn = hasCookie ? await hasSupabaseSession(request, pending) : false;
    if (isProtected && !signedIn) {
      const login = new URL("/login", request.url);
      login.searchParams.set("next", `${pathname}${search}`);
      return withCookies(NextResponse.redirect(login), pending);
    }
  } else if (isProtected) {
    const token = request.cookies.get(SESSION_COOKIE)?.value;
    const valid = token ? await verifySessionToken(token, env.sessionSecret) : null;
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

  const response = withCookies(NextResponse.next({ request: { headers: requestHeaders } }), pending);
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
