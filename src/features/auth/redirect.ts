import type { Route } from "next";

/** Where a person with a temporary password must go before anything else. */
export const CHANGE_PASSWORD_PATH = "/change-password" as Route;

/**
 * Accepts only same-site absolute paths for ?next=, so the login page can't
 * be used as an open redirect (e.g. "//evil.com" or "/\evil.com").
 */
export function safeNextPath(value: string | null | undefined): Route | null {
  if (!value || value.length > 512) return null;
  if (!value.startsWith("/") || value.startsWith("//") || value.startsWith("/\\")) return null;
  if (/[\u0000-\u001f\\]/.test(value)) return null;
  try {
    const url = new URL(value, "https://placeholder.invalid");
    if (url.origin !== "https://placeholder.invalid") return null;
    return `${url.pathname}${url.search}` as Route;
  } catch {
    return null;
  }
}

/** Where a user lands after signing in when no ?next= is given. */
export function homePathFor(user: { platformRole: string | null; mustChangePassword?: boolean }): Route {
  if (user.mustChangePassword) return CHANGE_PASSWORD_PATH;
  return user.platformRole ? "/admin" : "/app";
}
