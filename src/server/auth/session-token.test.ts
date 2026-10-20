import { describe, expect, it } from "vitest";

import { sha256 } from "@/mocks/seed";

import { randomToken, sha256Hex, signSessionToken, verifySessionToken } from "./session-token";

const SECRET = "test-secret-that-is-long-enough-0123456789";
const NOW = new Date("2026-10-17T10:00:00Z");
const LATER = new Date("2026-10-18T10:00:00Z");

describe("session tokens", () => {
  it("round-trips a signed token", async () => {
    const id = randomToken();
    const token = await signSessionToken(id, LATER, SECRET);

    expect(await verifySessionToken(token, SECRET, NOW)).toEqual({ sessionId: id, expiresAt: LATER });
  });

  it("rejects tampered ids, expiry and signatures", async () => {
    const token = await signSessionToken(randomToken(), LATER, SECRET);
    const [id, exp, sig] = token.split(".") as [string, string, string];

    expect(await verifySessionToken(`${randomToken()}.${exp}.${sig}`, SECRET, NOW)).toBeNull();
    expect(await verifySessionToken(`${id}.${Number(exp) + 3600}.${sig}`, SECRET, NOW)).toBeNull();
    expect(await verifySessionToken(`${id}.${exp}.${sig.slice(0, -2)}xx`, SECRET, NOW)).toBeNull();
  });

  it("rejects tokens signed with another secret", async () => {
    const token = await signSessionToken(randomToken(), LATER, "another-secret-0123456789-abcdefghij");
    expect(await verifySessionToken(token, SECRET, NOW)).toBeNull();
  });

  it("rejects expired tokens", async () => {
    const token = await signSessionToken(randomToken(), NOW, SECRET);
    expect(await verifySessionToken(token, SECRET, NOW)).toBeNull();
  });

  it.each(["", "a.b", "a.b.c.d", "short.123.sig"])("rejects malformed token %j", async (token) => {
    expect(await verifySessionToken(token, SECRET, NOW)).toBeNull();
  });
});

describe("token helpers", () => {
  it("generates distinct 256-bit url-safe tokens", () => {
    const tokens = new Set(Array.from({ length: 100 }, randomToken));
    expect(tokens.size).toBe(100);
    for (const token of tokens) expect(token).toMatch(/^[A-Za-z0-9_-]{43}$/);
  });

  it("hashes like node:crypto sha256", async () => {
    expect(await sha256Hex("hello")).toBe(sha256("hello"));
  });
});
