/**
 * Cookie names shared by proxy.ts and the server. No `server-only` here:
 * proxy.ts cannot import guarded modules.
 */
export const SESSION_COOKIE = "ttg_session";
/** Active organization in the client cabinet; always re-checked against memberships. */
export const ORG_COOKIE = "ttg_org";

export function sessionCookieOptions(expiresAt: Date, secure: boolean) {
  return {
    httpOnly: true,
    secure,
    sameSite: "lax" as const,
    path: "/",
    expires: expiresAt,
  };
}

export function orgCookieOptions(secure: boolean) {
  return {
    httpOnly: true,
    secure,
    sameSite: "lax" as const,
    path: "/",
    maxAge: 60 * 60 * 24 * 365,
  };
}
