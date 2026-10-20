/**
 * Guards against open redirects: a card may only point to https URLs on an
 * explicitly allowed host. Matching is exact (plus an optional "www."), never
 * "any subdomain" — e.g. allowing google.com must not allow sites.google.com,
 * where anyone can host a page.
 */

export type TargetUrlCheck =
  | { ok: true; url: string }
  | { ok: false; reason: "INVALID_URL" | "NOT_HTTPS" | "HAS_CREDENTIALS" | "DOMAIN_NOT_ALLOWED" };

export function normalizeHost(host: string): string {
  return host.toLowerCase().replace(/\.$/, "");
}

export function checkTargetUrl(rawUrl: string, allowedDomains: readonly string[]): TargetUrlCheck {
  let url: URL;
  try {
    url = new URL(rawUrl.trim());
  } catch {
    return { ok: false, reason: "INVALID_URL" };
  }

  if (url.protocol !== "https:") return { ok: false, reason: "NOT_HTTPS" };
  if (url.username || url.password) return { ok: false, reason: "HAS_CREDENTIALS" };

  const host = normalizeHost(url.hostname);
  const allowed = allowedDomains.map(normalizeHost);
  const hostWithoutWww = host.startsWith("www.") ? host.slice(4) : host;
  if (!allowed.includes(host) && !allowed.includes(hostWithoutWww)) {
    return { ok: false, reason: "DOMAIN_NOT_ALLOWED" };
  }

  return { ok: true, url: url.toString() };
}
