/**
 * Session cookie value: `<sessionId>.<expiresAtSeconds>.<signature>`.
 * The signature is HMAC-SHA256 over the first two parts. Only Web Crypto is
 * used so the same code verifies tokens in proxy.ts and on the server.
 *
 * A valid signature proves we issued the token; the server additionally checks
 * the session registry so sign-out and revocation take effect immediately.
 */

const encoder = new TextEncoder();

function toBase64Url(bytes: Uint8Array): string {
  let binary = "";
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

async function hmac(secret: string, payload: string): Promise<string> {
  const key = await crypto.subtle.importKey(
    "raw",
    encoder.encode(secret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"],
  );
  return toBase64Url(new Uint8Array(await crypto.subtle.sign("HMAC", key, encoder.encode(payload))));
}

/** Constant-time comparison of two strings of equal length. */
function safeEqual(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return diff === 0;
}

/** 256 random bits, URL-safe. Used for session ids and one-time tokens. */
export function randomToken(): string {
  return toBase64Url(crypto.getRandomValues(new Uint8Array(32)));
}

export async function signSessionToken(sessionId: string, expiresAt: Date, secret: string): Promise<string> {
  const payload = `${sessionId}.${Math.floor(expiresAt.getTime() / 1000)}`;
  return `${payload}.${await hmac(secret, payload)}`;
}

export type VerifiedToken = { sessionId: string; expiresAt: Date };

export async function verifySessionToken(
  token: string,
  secret: string,
  now: Date = new Date(),
): Promise<VerifiedToken | null> {
  const parts = token.split(".");
  if (parts.length !== 3) return null;
  const [sessionId, expires, signature] = parts as [string, string, string];
  if (!/^[A-Za-z0-9_-]{20,100}$/.test(sessionId) || !/^\d{1,12}$/.test(expires)) return null;

  const expected = await hmac(secret, `${sessionId}.${expires}`);
  if (!safeEqual(signature, expected)) return null;

  const expiresAt = new Date(Number(expires) * 1000);
  if (expiresAt <= now) return null;
  return { sessionId, expiresAt };
}

/** SHA-256 hex digest, for storing one-time tokens without the tokens themselves. */
export async function sha256Hex(value: string): Promise<string> {
  const digest = await crypto.subtle.digest("SHA-256", encoder.encode(value));
  return [...new Uint8Array(digest)].map((b) => b.toString(16).padStart(2, "0")).join("");
}
