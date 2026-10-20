import { beforeEach, describe, expect, it } from "vitest";

import type { TapEvent } from "@/features/analytics/schemas";
import { createSeedData, DEMO_INVITATION_TOKEN, sha256 } from "@/mocks/seed";
import { createMockContainer } from "@/server/container";
import { type AppError } from "@/server/errors";
import type { Repositories } from "@/server/repositories";

const NOW = new Date("2026-10-17T10:00:00Z");

let repos: Repositories;
let orgA: string;
let orgB: string;

beforeEach(async () => {
  const db = createSeedData({ now: NOW });
  repos = createMockContainer(db, () => NOW).repositories;
  const [coffee, beauty] = await repos.organizations.list();
  orgA = coffee?.id ?? "";
  orgB = beauty?.id ?? "";
  expect(orgA && orgB).toBeTruthy();
});

const expectNotFound = (promise: Promise<unknown>) =>
  expect(promise).rejects.toMatchObject({ name: "AppError", code: "NOT_FOUND" } satisfies Partial<AppError>);

describe("organization scope (future RLS)", () => {
  it("hides rows of another organization", async () => {
    const [cardOfB] = await repos.cards.list({ organizationId: orgB });
    const [employeeOfB] = await repos.employees.list({ organizationId: orgB });
    const [locationOfB] = await repos.locations.list({ organizationId: orgB });
    if (!cardOfB || !employeeOfB || !locationOfB) throw new Error("seed changed");

    expect(await repos.cards.findById(cardOfB.id, { organizationId: orgA })).toBeNull();
    expect(await repos.employees.findById(employeeOfB.id, { organizationId: orgA })).toBeNull();
    expect(await repos.locations.findById(locationOfB.id, { organizationId: orgA })).toBeNull();
    expect(await repos.cards.findById(cardOfB.id, { organizationId: orgB })).not.toBeNull();
  });

  it("refuses to modify rows of another organization", async () => {
    const [cardOfB] = await repos.cards.list({ organizationId: orgB });
    const [employeeOfB] = await repos.employees.list({ organizationId: orgB });
    if (!cardOfB || !employeeOfB) throw new Error("seed changed");

    await expectNotFound(repos.cards.update(cardOfB.id, { label: "Взлом" }, { organizationId: orgA }));
    await expectNotFound(repos.employees.delete(employeeOfB.id, { organizationId: orgA }));
    expect((await repos.cards.findById(cardOfB.id))?.label).toBe(cardOfB.label);
  });
});

describe("data isolation", () => {
  it("returns copies, so callers cannot mutate storage", async () => {
    const [card] = await repos.cards.list({ organizationId: orgA });
    if (!card) throw new Error("seed changed");
    card.label = "changed outside";

    expect((await repos.cards.findById(card.id))?.label).not.toBe("changed outside");
  });

  it("ignores undefined fields in patches", async () => {
    const [card] = await repos.cards.list({ organizationId: orgA });
    if (!card) throw new Error("seed changed");
    const updated = await repos.cards.update(card.id, { label: "Новая", status: undefined });

    expect(updated.label).toBe("Новая");
    expect(updated.status).toBe(card.status);
  });

  it("never exposes invitation token hashes", async () => {
    const invitation = await repos.invitations.findByTokenHash(sha256(DEMO_INVITATION_TOKEN));

    expect(invitation?.email).toBe("barista@coffeepoint.kz");
    expect(invitation).not.toHaveProperty("tokenHash");
  });
});

describe("cards", () => {
  it("finds by exact code and searches by code prefix or label", async () => {
    const [card] = await repos.cards.list({ organizationId: orgA });
    if (!card) throw new Error("seed changed");

    expect((await repos.cards.findByCode(card.code))?.id).toBe(card.id);
    expect(
      await repos.cards.findByCode(
        card.code.toLowerCase() === card.code ? "ZZZZZZZZ" : card.code.toLowerCase(),
      ),
    ).toBeNull();
    expect((await repos.cards.list({ search: card.code.slice(0, 5) })).map((c) => c.id)).toContain(card.id);
    expect((await repos.cards.list({ organizationId: orgA, search: "касса" })).length).toBeGreaterThan(0);
  });

  it("creates a batch with numbered cards, or nothing at all on a code clash", async () => {
    const [existing] = await repos.cards.list();
    if (!existing) throw new Error("seed changed");
    const { id: _id, createdAt: _createdAt, batchId: _batch, number: _number, ...taken } = existing;
    const fresh = { ...taken, code: "Zz9Zz9Zz", status: "UNASSIGNED" as const, organizationId: null };
    const batch = { name: "Тест", quantity: 2, cardType: "STICKER" as const, notes: null };
    const batchesBefore = (await repos.batches.list()).length;

    await expect(repos.batches.createWithCards(batch, [fresh, taken])).rejects.toMatchObject({
      code: "CONFLICT",
    });
    expect(await repos.batches.list()).toHaveLength(batchesBefore);
    expect(await repos.cards.findByCode("Zz9Zz9Zz")).toBeNull();

    const created = await repos.batches.createWithCards(batch, [fresh, { ...fresh, code: "Yy8Yy8Yy" }]);
    expect(created.cards.map((c) => c.number)).toEqual([1, 2]);
    const [second] = await repos.cards.list({ batchId: created.batch.id, numbers: { from: 2, to: 2 } });
    expect(second?.code).toBe("Yy8Yy8Yy");
  });

  it("assigns atomically: a card handed out once cannot be handed out again", async () => {
    const [free] = await repos.cards.list({ statuses: ["UNASSIGNED"] });
    if (!free) throw new Error("seed changed");
    const base = { locationId: null, targetId: null, activatedAt: NOW.toISOString(), cardLimit: null };

    const [first, second] = await Promise.all([
      repos.cards.assign({ ...base, cardIds: [free.id], organizationId: orgA }),
      repos.cards.assign({ ...base, cardIds: [free.id], organizationId: orgB }),
    ]);
    expect(first.ok).toBe(true);
    expect(second).toEqual({ ok: false, reason: "NOT_UNASSIGNED" });
    expect((await repos.cards.findById(free.id))?.organizationId).toBe(orgA);
  });

  it("refuses an assignment beyond the card limit and changes nothing", async () => {
    const free = await repos.cards.list({ statuses: ["UNASSIGNED"] });
    const held = await repos.cards.count({ organizationId: orgB, statuses: ["ACTIVE", "PAUSED", "LOST"] });
    const result = await repos.cards.assign({
      cardIds: free.slice(0, 2).map((c) => c.id),
      organizationId: orgB,
      locationId: null,
      targetId: null,
      activatedAt: NOW.toISOString(),
      cardLimit: held + 1,
    });
    expect(result).toEqual({ ok: false, reason: "LIMIT_EXCEEDED" });
    expect(await repos.cards.count({ statuses: ["UNASSIGNED"] })).toBe(free.length);
  });

  it("answers platform-wide questions with counts and bounded pages", async () => {
    const all = await repos.cards.list();
    const page = await repos.cards.search({}, 5);
    expect(page.items).toHaveLength(5);
    expect(page.total).toBe(all.length);

    const byOrg = await repos.cards.countBy("organizationId");
    expect(byOrg[orgA]).toBe(all.filter((c) => c.organizationId === orgA).length);
    const assigned = all.filter((c) => c.organizationId).length;
    expect(Object.values(byOrg).reduce((a, b) => a + b, 0)).toBe(assigned);

    const codes = all.slice(0, 3).map((c) => c.code);
    const found = await repos.cards.findByCodes([...codes, "NoSuch01"]);
    expect(found.map((c) => c.code).sort()).toEqual([...codes].sort());
  });

  it("clears the employee on cards when the employee is deleted", async () => {
    const [card] = await repos.cards.list({ organizationId: orgA });
    const withEmployee = (await repos.cards.list({ organizationId: orgA })).find((c) => c.employeeId);
    if (!card || !withEmployee?.employeeId) throw new Error("seed changed");

    await repos.employees.delete(withEmployee.employeeId, { organizationId: orgA });
    expect((await repos.cards.findById(withEmployee.id))?.employeeId).toBeNull();
  });
});

describe("analytics", () => {
  const range = { from: "2026-10-10T00:00:00Z", to: "2026-10-17T10:00:00Z" };

  it("inserts tap events idempotently", async () => {
    const [card] = await repos.cards.list({ organizationId: orgA, statuses: ["ACTIVE"] });
    if (!card?.organizationId) throw new Error("seed changed");
    const event: TapEvent = {
      id: crypto.randomUUID(),
      cardId: card.id,
      organizationId: card.organizationId,
      locationId: card.locationId,
      employeeId: card.employeeId,
      occurredAt: "2026-10-17T09:59:00.000Z",
      source: "NFC",
      deviceType: "MOBILE",
      os: "IOS",
      isBot: false,
      isDuplicate: false,
    };
    const before = await repos.tapEvents.count({ cardIds: [card.id], range, kind: "all" });
    expect((await repos.tapEvents.insert(event)).created).toBe(true);
    expect((await repos.tapEvents.insert(event)).created).toBe(false);
    const after = await repos.tapEvents.count({ cardIds: [card.id], range, kind: "all" });

    expect(after).toBe(before + 1);
  });

  it("counts only valid taps in heatmap and breakdown", async () => {
    const valid = await repos.tapEvents.count({ organizationId: orgA, range });
    const all = await repos.tapEvents.count({ organizationId: orgA, range, kind: "all" });
    expect(all).toBeGreaterThan(valid);
    const heatmap = await repos.tapEvents.heatmap({ organizationId: orgA, range }, "Asia/Almaty");
    const breakdown = await repos.tapEvents.breakdown({ organizationId: orgA, range });

    expect(heatmap.reduce((sum, c) => sum + c.taps, 0)).toBe(valid);
    expect(breakdown.sources.NFC + breakdown.sources.QR).toBe(valid);
    expect(heatmap.every((c) => c.weekday >= 1 && c.weekday <= 7 && c.hour >= 0 && c.hour < 24)).toBe(true);
  });

  it("upserts daily stats", async () => {
    const day = { from: "2026-10-16", to: "2026-10-16" };
    const [group] = await repos.dailyStats.totalsBy({ organizationId: orgA, ...day }, "cardId");
    const card = group ? await repos.cards.findById(group.key) : null;
    if (!group || !card?.organizationId) throw new Error("seed changed");
    const key = {
      cardId: card.id,
      organizationId: card.organizationId,
      locationId: card.locationId,
      employeeId: card.employeeId,
      date: day.from,
    };
    await repos.dailyStats.increment(key, { taps: 2, uniqueVisitors: 1, nfcTaps: 2, qrTaps: 0 });

    expect((await repos.dailyStats.total({ cardIds: [card.id], ...day })).taps).toBe(group.taps + 2);
  });

  it("returns sums, grouped or not, that agree with each other", async () => {
    const filter = { organizationId: orgA, from: "2026-09-18", to: "2026-10-17" };
    const total = await repos.dailyStats.total(filter);
    for (const dimension of ["date", "cardId", "locationId"] as const) {
      const groups = await repos.dailyStats.totalsBy(filter, dimension);
      expect(groups.reduce((sum, g) => sum + g.taps, 0)).toBe(total.taps);
      expect(groups.map((g) => g.key)).toEqual([...groups.map((g) => g.key)].sort());
    }
    expect(total.nfcTaps + total.qrTaps).toBe(total.taps);
  });
});

describe("audit log", () => {
  it("paginates newest first without overlaps", async () => {
    for (let i = 0; i < 5; i++) {
      await repos.auditLogs.append({
        actorUserId: null,
        action: "card.update",
        entityType: "card",
        entityId: String(i),
        organizationId: orgA,
        before: null,
        after: { i },
      });
    }
    const first = await repos.auditLogs.list({}, { limit: 5 });
    const second = await repos.auditLogs.list({}, { limit: 5, cursor: first.nextCursor });
    const ids = [...first.items, ...second.items].map((l) => l.id);

    expect(first.nextCursor).not.toBeNull();
    expect(new Set(ids).size).toBe(ids.length);
    expect(second.nextCursor).toBeNull();
    expect((await repos.auditLogs.list({ action: "card." }, { limit: 50 })).items.length).toBeGreaterThan(5);
  });
});

describe("providers", () => {
  it("resolves a demo 2GIS link with demo figures", async () => {
    const container = createMockContainer(createSeedData({ now: NOW }), () => NOW);
    const [location] = await container.repositories.locations.list({ organizationId: orgA });
    const preview = await container.reviews.resolveFirm(
      `https://2gis.kz/almaty/firm/${location?.twogisFirmId}/tab/reviews`,
    );

    expect(preview?.name).toBe(location?.name);
    expect(preview?.rating).toBeGreaterThan(3);
    expect(await container.reviews.resolveFirm("https://evil.com/firm/1")).toBeNull();
  });

  it("captures emails in the dev outbox", async () => {
    const container = createMockContainer(createSeedData({ now: NOW }), () => NOW);
    await container.email.send({ to: "a@b.kz", subject: "Тест", text: "Привет", tag: "invitation" });

    expect(container.devOutbox?.list()).toMatchObject([{ to: "a@b.kz", subject: "Тест" }]);
  });
});
