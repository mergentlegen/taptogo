/**
 * Client IP for rate limiting. The leftmost X-Forwarded-For value is whatever
 * the client claims, so it is never trusted: we use X-Real-IP or the last
 * X-Forwarded-For hop, both set by our own reverse proxy. The proxy in front
 * of the app must overwrite X-Real-IP (documented in the deployment notes).
 */
export function clientIpFrom(headers: Pick<Headers, "get">): string | null {
  const realIp = headers.get("x-real-ip")?.trim();
  if (realIp) return realIp;
  return headers.get("x-forwarded-for")?.split(",").at(-1)?.trim() || null;
}
