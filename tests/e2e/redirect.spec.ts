import { expect, test } from "@playwright/test";

import type { Card } from "@/features/cards/schemas";
import { createSeedData } from "@/mocks/seed";

// Same seed as the server, so card codes and statuses match.
const seed = createSeedData();
const cardWith = (status: Card["status"]): Card => {
  const card = seed.cards.find((c) => c.status === status && (status === "UNASSIGNED" || c.targetId));
  if (!card) throw new Error(`no ${status} card`);
  return card;
};
const active = cardWith("ACTIVE");
const activeTarget = seed.targets.find((t) => t.id === active.targetId);
const IPHONE =
  "Mozilla/5.0 (iPhone; CPU iPhone OS 18_5 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.5 Mobile/15E148 Safari/604.1";

// Each test gets its own client IP so the per-IP rate limit can't make them interfere.
let ipCounter = 0;
const nextIp = () => `198.18.${test.info().workerIndex}.${++ipCounter % 250}`;
const headers = (extra: Record<string, string> = {}) => ({
  "user-agent": IPHONE,
  "x-real-ip": nextIp(),
  ...extra,
});

test.describe("/t/{code}", () => {
  test("redirects an active card with 302 and safe headers", async ({ request }) => {
    const response = await request.get(`/t/${active.code}`, { maxRedirects: 0, headers: headers() });

    expect(response.status()).toBe(302);
    expect(response.headers()["location"]).toBe(activeTarget?.url);
    expect(response.headers()["cache-control"]).toBe("no-store");
    expect(response.headers()["referrer-policy"]).toBe("no-referrer");
    expect(response.headers()["x-robots-tag"]).toContain("noindex");
  });

  test("sets the visitor cookie only for /t, httpOnly and without any identifier", async ({ request }) => {
    const response = await request.get(`/t/${active.code}?s=q`, { maxRedirects: 0, headers: headers() });
    const cookie = response.headers()["set-cookie"] ?? "";

    expect(cookie).toMatch(new RegExp(`^ttg_seen=${active.code}\\.[0-9a-z]+;`));
    expect(cookie).toContain("Path=/t");
    expect(cookie).toContain("HttpOnly");
    expect(cookie).toMatch(/SameSite=lax/i);
  });

  test("ignores any URL passed in the query (no open redirect)", async ({ request }) => {
    const response = await request.get(`/t/${active.code}?url=https://evil.example&next=//evil.example`, {
      maxRedirects: 0,
      headers: headers(),
    });
    expect(response.headers()["location"]).toBe(activeTarget?.url);
  });

  test("still redirects bots and HEAD requests, but sets no cookie", async ({ request }) => {
    const bot = await request.get(`/t/${active.code}`, {
      maxRedirects: 0,
      headers: headers({ "user-agent": "TelegramBot (like TwitterBot)" }),
    });
    const head = await request.head(`/t/${active.code}`, { maxRedirects: 0, headers: headers() });

    expect(bot.status()).toBe(302);
    expect(bot.headers()["set-cookie"]).toBeUndefined();
    expect(head.status()).toBe(302);
  });

  for (const code of ["abc", "ZZZZZZZZ", "abcd-efg"]) {
    test(`answers 404 with a branded page for ${code}`, async ({ request }) => {
      const response = await request.get(`/t/${code}`, { maxRedirects: 0, headers: headers() });

      expect(response.status()).toBe(404);
      expect(await response.text()).toContain("Ссылка не найдена");
    });
  }

  test("explains that an unassigned card is not activated yet", async ({ request }) => {
    const response = await request.get(`/t/${cardWith("UNASSIGNED").code}`, {
      maxRedirects: 0,
      headers: headers(),
    });

    expect(response.status()).toBe(200);
    expect(await response.text()).toContain("Карточка ещё не активирована");
  });

  for (const status of ["PAUSED", "LOST", "REVOKED"] as const) {
    test(`shows a neutral page for a ${status} card without client details`, async ({ request }) => {
      const card = seed.cards.find((c) => c.status === status);
      const organization = seed.organizations.find((o) => o.id === card?.organizationId);
      const response = await request.get(`/t/${card?.code}`, { maxRedirects: 0, headers: headers() });
      const html = await response.text();

      expect(response.status()).toBe(200);
      expect(html).toContain("Карточка не активна");
      expect(html).not.toContain(organization?.name ?? "—");
      expect(html).not.toContain(card?.label ?? "—");
      expect(response.headers()["content-security-policy"]).toContain("default-src 'none'");
    });
  }

  test("rate limits one IP to 60 requests a minute", async ({ request }) => {
    const ip = { ...headers(), "x-real-ip": `198.19.${test.info().project.name.length}.1` };
    for (let i = 0; i < 60; i++) {
      expect((await request.get(`/t/${active.code}`, { maxRedirects: 0, headers: ip })).status()).toBe(302);
    }
    const limited = await request.get(`/t/${active.code}`, { maxRedirects: 0, headers: ip });

    expect(limited.status()).toBe(429);
    expect(Number(limited.headers()["retry-after"])).toBeGreaterThan(0);
    expect(limited.headers()["location"]).toBeUndefined();
    // Another IP is unaffected.
    expect((await request.get(`/t/${active.code}`, { maxRedirects: 0, headers: headers() })).status()).toBe(
      302,
    );
  });
});
