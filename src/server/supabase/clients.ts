import "server-only";

import { createServerClient } from "@supabase/ssr";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { cookies } from "next/headers";
import { cache } from "react";

import { getEnv } from "@/env";
import { processSingleton } from "@/server/singleton";

import type { Database } from "./database.types";

export type Db = SupabaseClient<Database>;

/**
 * Supabase writes its session cookies readable by scripts, because its browser
 * client reads them. This app never talks to Supabase from the browser, so the
 * cookies are made HttpOnly: injected scripts cannot steal the session.
 */
export function sessionCookieOptions<T extends object>(options: T) {
  return { ...options, httpOnly: true, secure: getEnv().isProduction, sameSite: "lax" as const };
}

function requireSupabaseEnv() {
  const { SUPABASE_URL, SUPABASE_PUBLISHABLE_KEY, SUPABASE_SECRET_KEY } = getEnv();
  const missing = [
    ["SUPABASE_URL", SUPABASE_URL],
    ["SUPABASE_PUBLISHABLE_KEY", SUPABASE_PUBLISHABLE_KEY],
    ["SUPABASE_SECRET_KEY", SUPABASE_SECRET_KEY],
  ]
    .filter(([, value]) => !value)
    .map(([name]) => name);
  if (missing.length > 0) {
    throw new Error(`Supabase is not configured: set ${missing.join(", ")} in the environment`);
  }
  return {
    url: SUPABASE_URL!,
    publishableKey: SUPABASE_PUBLISHABLE_KEY!,
    secretKey: SUPABASE_SECRET_KEY!,
  };
}

/**
 * Client on behalf of the signed-in user: the session lives in Supabase's own
 * cookies and every query runs under that user's JWT, so Row Level Security
 * applies. One instance per request.
 */
export const getUserClient = cache(async (): Promise<Db> => {
  const { url, publishableKey } = requireSupabaseEnv();
  const cookieStore = await cookies();
  return createServerClient<Database>(url, publishableKey, {
    cookies: {
      getAll: () => cookieStore.getAll(),
      setAll: (toSet) => {
        // Server Components cannot write cookies. Token refresh is done by proxy.ts,
        // so a failed write here is harmless.
        try {
          for (const { name, value, options } of toSet) {
            cookieStore.set(name, value, sessionCookieOptions(options));
          }
        } catch {
          // ignored on purpose
        }
      },
    },
  });
});

/**
 * Client with the secret key: **bypasses RLS**. For flows with no user behind
 * the request (card redirect, landing leads, authentication, cron). The caller
 * checks every permission itself. One instance per process, no session.
 */
export function getSystemClient(): Db {
  return processSingleton("supabase-system-client", () => {
    const { url, secretKey } = requireSupabaseEnv();
    return createClient<Database>(url, secretKey, {
      auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
    });
  });
}

/**
 * A client that keeps no session and touches no cookies. For checking a password
 * (sign in, then discard): the user's own session must stay untouched.
 */
export function createIsolatedClient(): Db {
  const { url, publishableKey } = requireSupabaseEnv();
  return createClient<Database>(url, publishableKey, {
    auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
  });
}
