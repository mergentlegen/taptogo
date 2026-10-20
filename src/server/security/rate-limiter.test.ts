import { describe, expect, it } from "vitest";

import { InMemoryRateLimiter } from "./rate-limiter";

const rule = { limit: 5, windowMs: 15 * 60_000 };

describe("InMemoryRateLimiter", () => {
  it("allows up to the limit, then blocks until the window slides", async () => {
    let now = new Date("2026-10-17T10:00:00Z").getTime();
    const limiter = new InMemoryRateLimiter(() => new Date(now));

    for (let i = 0; i < 5; i++) {
      expect((await limiter.check("k", rule)).allowed).toBe(true);
      await limiter.hit("k", rule);
      now += 60_000;
    }
    const blocked = await limiter.check("k", rule);
    expect(blocked.allowed).toBe(false);
    expect(blocked.retryAfterMs).toBe(10 * 60_000);

    now += blocked.retryAfterMs + 1;
    expect((await limiter.check("k", rule)).allowed).toBe(true);
  });

  it("keeps keys independent and supports reset", async () => {
    const limiter = new InMemoryRateLimiter();
    for (let i = 0; i < 5; i++) await limiter.hit("a", rule);

    expect((await limiter.check("a", rule)).allowed).toBe(false);
    expect((await limiter.check("b", rule)).allowed).toBe(true);
    await limiter.reset("a");
    expect((await limiter.check("a", rule)).allowed).toBe(true);
  });
});
