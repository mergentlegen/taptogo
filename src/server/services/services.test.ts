import { beforeEach, describe, expect, it } from "vitest";

import { resolvePeriod } from "@/lib/period";
import { createSeedData } from "@/mocks/seed";
import { createMockContainer, type Container } from "@/server/container";

import type { OrgContext } from "./context";
import { createServices, type Services } from "./index";

const NOW = new Date("2026-10-17T10:00:00Z");
const TODAY = "2026-10-17";
const PNG = Uint8Array.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0, 0, 0, 0]);

let container: Container;
let services: Services;
/** Coffee Point owner — organization A. */
let ownerA: OrgContext;
/** Aru Beauty — organization B (expired subscription). */
let orgB: string;

beforeEach(async () => {
  container = createMockContainer(createSeedData({ now: NOW }), () => NOW);
  services = createServices(container);
  const repos = container.repositories;
  const [coffee] = await repos.organizations.list({ search: "Coffee" });
  const [beauty] = await repos.organizations.list({ search: "Aru" });
  const owner = await repos.users.findByEmail("owner@coffeepoint.kz");
  ownerA = { userId: owner!.id, organizationId: coffee!.id, timeZone: "Asia/Almaty", role: "OWNER" };
  orgB = beauty!.id;
});

const notFound = { code: "NOT_FOUND" };
const invalid = { code: "VALIDATION" };

describe("organization isolation (OWNER of A vs data of B)", () => {
  it("cannot open or change a card of B", async () => {
    const [cardB] = await container.repositories.cards.list({ organizationId: orgB });

    expect(await services.cards.detail(ownerA, cardB!.id)).toBeNull();
    await expect(
      services.cards.update(ownerA, {
        cardId: cardB!.id,
        label: "x",
        locationId: null,
        employeeId: null,
        targetId: null,
      }),
    ).rejects.toMatchObject(notFound);
    await expect(services.cards.setPaused(ownerA, cardB!.id, true)).rejects.toMatchObject(notFound);
    await expect(services.cards.reportLost(ownerA, cardB!.id)).rejects.toMatchObject(notFound);
    expect((await container.repositories.cards.findById(cardB!.id))?.status).toBe(cardB!.status);
  });

  it("cannot attach B's location, employee or target to its own card", async () => {
    const [cardA] = await container.repositories.cards.list({
      organizationId: ownerA.organizationId,
      statuses: ["ACTIVE"],
    });
    const [locationB] = await container.repositories.locations.list({ organizationId: orgB });
    const [employeeB] = await container.repositories.employees.list({ organizationId: orgB });
    const [targetB] = await container.repositories.targets.list({ organizationId: orgB });
    const base = {
      cardId: cardA!.id,
      label: cardA!.label,
      locationId: null,
      employeeId: null,
      targetId: null,
    };

    await expect(services.cards.update(ownerA, { ...base, locationId: locationB!.id })).rejects.toMatchObject(
      invalid,
    );
    await expect(services.cards.update(ownerA, { ...base, employeeId: employeeB!.id })).rejects.toMatchObject(
      invalid,
    );
    await expect(services.cards.update(ownerA, { ...base, targetId: targetB!.id })).rejects.toMatchObject(
      invalid,
    );
  });

  it("cannot read, edit or delete employees and locations of B", async () => {
    const [employeeB] = await container.repositories.employees.list({ organizationId: orgB });
    const [locationB] = await container.repositories.locations.list({ organizationId: orgB });
    const input = { name: "x", position: null, locationId: null, isActive: true };

    await expect(services.employees.update(ownerA, employeeB!.id, input)).rejects.toMatchObject(notFound);
    await expect(services.employees.delete(ownerA, employeeB!.id)).rejects.toMatchObject(notFound);
    await expect(
      services.employees.create(ownerA, { ...input, locationId: locationB!.id }),
    ).rejects.toMatchObject(invalid);
    expect(await services.locations.detail(ownerA, locationB!.id)).toBeNull();
    await expect(services.locations.requestTwogisChange(ownerA, locationB!.id, "x")).rejects.toMatchObject(
      notFound,
    );
  });

  it("ignores B's ids in dashboard filters and never mixes in B's numbers", async () => {
    const [cardB] = await container.repositories.cards.list({ organizationId: orgB });
    const period = resolvePeriod({ period: "30d" }, TODAY);
    const unfiltered = await services.analytics.dashboard(ownerA, period, {});
    const forged = await services.analytics.dashboard(ownerA, period, { cardId: cardB!.id });

    expect(forged.filter).toEqual({});
    expect(forged.kpis.taps.value).toBe(unfiltered.kpis.taps.value);
    const ownCards = new Set(
      (await container.repositories.cards.list({ organizationId: ownerA.organizationId })).map((c) => c.id),
    );
    expect(unfiltered.topCards.every((c) => ownCards.has(c.id))).toBe(true);
  });

  it("builds reports only from its own organization", async () => {
    const report = await services.reports.build(ownerA, resolvePeriod({ period: "90d" }, TODAY), "cards");
    const codesB = new Set(
      (await container.repositories.cards.list({ organizationId: orgB })).map((c) => c.code),
    );
    expect(report.rows.some((row) => codesB.has(String(row.code)))).toBe(false);
  });

  it("cannot manage B's team or invitations", async () => {
    const [memberB] = await container.repositories.memberships.listByOrganization(orgB);
    const invitationB = (
      await container.repositories.invitations.listByOrganization(
        (await container.repositories.organizations.list({ search: "AquaDrive" }))[0]!.id,
      )
    )[0];

    await expect(services.team.changeRole(ownerA, memberB!.userId, "VIEWER")).rejects.toMatchObject(notFound);
    await expect(services.team.removeMember(ownerA, memberB!.userId)).rejects.toMatchObject(notFound);
    await expect(services.team.revokeInvitation(ownerA, invitationB!.id)).rejects.toMatchObject(notFound);
  });
});

describe("dashboard", () => {
  it("computes KPIs that agree with the daily series", async () => {
    const data = await services.analytics.dashboard(ownerA, resolvePeriod({ period: "30d" }, TODAY), {});

    expect(data.daily).toHaveLength(30);
    expect(data.daily.reduce((sum, d) => sum + d.taps, 0)).toBe(data.kpis.taps.value);
    expect(data.sources.NFC + data.sources.QR).toBe(data.kpis.taps.value);
    expect(data.kpis.uniqueVisitors.value).toBeLessThanOrEqual(data.kpis.taps.value);
    expect(data.kpis.rating.value).toBeGreaterThan(3);
    expect(data.kpis.newReviews.value).toBeGreaterThan(0);
    expect(data.kpis.conversion.value).toBeGreaterThan(0);
    expect(data.kpis.conversion.value).toBeLessThan(1);
    expect(data.topCards.length).toBeLessThanOrEqual(5);
    expect(data.heatmap.reduce((sum, c) => sum + c.taps, 0)).toBeGreaterThan(0);
  });

  it("narrows to one location", async () => {
    const [location] = await container.repositories.locations.list({ organizationId: ownerA.organizationId });
    const period = resolvePeriod({ period: "30d" }, TODAY);
    const all = await services.analytics.dashboard(ownerA, period, {});
    const one = await services.analytics.dashboard(ownerA, period, { locationId: location!.id });

    expect(one.filter.locationId).toBe(location!.id);
    expect(one.kpis.taps.value).toBeGreaterThan(0);
    expect(one.kpis.taps.value).toBeLessThan(all.kpis.taps.value);
  });

  it("hides statistics when the subscription expired", async () => {
    const beautyOwner = await container.repositories.users.findByEmail("owner@arubeauty.kz");
    const view = await services.subscription.view({
      ...ownerA,
      userId: beautyOwner!.id,
      organizationId: orgB,
    });
    expect(view).toMatchObject({ status: "EXPIRED", statsAllowed: false });
    expect((await services.subscription.view(ownerA)).statsAllowed).toBe(true);
  });
});

describe("cards", () => {
  it("lists cards with 30-day taps, busiest first", async () => {
    const cards = await services.cards.list(ownerA);
    expect(cards.length).toBeGreaterThan(5);
    expect(cards[0]!.taps30).toBeGreaterThanOrEqual(cards.at(-1)!.taps30);
  });

  it("pauses, resumes and reports a card lost, with audit entries", async () => {
    const [card] = await container.repositories.cards.list({
      organizationId: ownerA.organizationId,
      statuses: ["ACTIVE"],
    });
    await services.cards.setPaused(ownerA, card!.id, true);
    await services.cards.setPaused(ownerA, card!.id, false);
    await services.cards.reportLost(ownerA, card!.id);

    expect((await container.repositories.cards.findById(card!.id))?.status).toBe("LOST");
    await expect(services.cards.setPaused(ownerA, card!.id, false)).rejects.toMatchObject({
      code: "CONFLICT",
    });
    const { items } = await container.repositories.auditLogs.list({ entityId: card!.id }, { limit: 10 });
    // Same frozen timestamp in tests, so compare the set of actions rather than their order.
    expect(items.map((i) => i.action).sort()).toEqual([
      "card.assign",
      "card.pause",
      "card.report_lost",
      "card.resume",
    ]);
  });

  it("rejects unverified targets", async () => {
    const [card] = await container.repositories.cards.list({
      organizationId: ownerA.organizationId,
      statuses: ["ACTIVE"],
    });
    const target = await container.repositories.targets.findById(card!.targetId!);
    await container.repositories.targets.update(target!.id, { isVerified: false });

    await expect(
      services.cards.update(ownerA, {
        cardId: card!.id,
        label: "Касса",
        locationId: null,
        employeeId: null,
        targetId: target!.id,
      }),
    ).rejects.toMatchObject(invalid);
  });
});

describe("team", () => {
  it("never removes or demotes the last owner", async () => {
    await expect(services.team.removeMember(ownerA, ownerA.userId)).rejects.toMatchObject({
      code: "CONFLICT",
    });
    await expect(services.team.changeRole(ownerA, ownerA.userId, "VIEWER")).rejects.toMatchObject({
      code: "CONFLICT",
    });
  });

  it("invites by email, replacing an earlier pending invitation", async () => {
    await services.team.invite(ownerA, { email: "New@Coffeepoint.kz", role: "VIEWER" });
    await services.team.invite(ownerA, { email: "new@coffeepoint.kz", role: "MANAGER" });

    const { invitations } = await services.team.list(ownerA);
    const mine = invitations.filter((i) => i.email === "new@coffeepoint.kz");
    expect(mine).toHaveLength(1);
    expect(mine[0]?.role).toBe("MANAGER");
    expect(container.devOutbox?.list()[0]?.text).toMatch(/\/invite\/[A-Za-z0-9_-]{43}/);
  });

  it("refuses to invite an existing member", async () => {
    await expect(
      services.team.invite(ownerA, { email: "manager@coffeepoint.kz", role: "VIEWER" }),
    ).rejects.toMatchObject({
      code: "CONFLICT",
    });
  });
});

describe("reports", () => {
  it("exports CSV with escaped values and XLSX", async () => {
    const [card] = await container.repositories.cards.list({
      organizationId: ownerA.organizationId,
      statuses: ["ACTIVE"],
    });
    await container.repositories.cards.update(card!.id, { label: '=HYPERLINK("http://evil")' });
    const report = await services.reports.build(ownerA, resolvePeriod({ period: "30d" }, TODAY), "cards");

    const csv = await services.reports.export(ownerA, report, "csv");
    expect(String(csv.body)).toContain(`"'=HYPERLINK(""http://evil"")"`);
    const xlsx = await services.reports.export(ownerA, report, "xlsx");
    expect((xlsx.body as Uint8Array).byteLength).toBeGreaterThan(1000);
    const { items } = await container.repositories.auditLogs.list({ action: "report.export" }, { limit: 5 });
    expect(items).toHaveLength(2);
  });

  it("has a row per day for the days dimension with totals", async () => {
    const report = await services.reports.build(ownerA, resolvePeriod({ period: "7d" }, TODAY), "days");
    expect(report.rows).toHaveLength(7);
    expect(report.totals.taps).toBe(report.rows.reduce((s, r) => s + Number(r.taps), 0));
  });
});

describe("account", () => {
  it("accepts only real images for the logo", async () => {
    await services.account.uploadLogo(ownerA, PNG);
    const org = await container.repositories.organizations.findById(ownerA.organizationId);
    expect(org?.logoUrl).toMatch(/^logos\/.+\.png$/);
    expect(await services.account.logoUrl(org!)).toMatch(/^data:image\/png;base64,/);

    const svg = new TextEncoder().encode("<svg><script>alert(1)</script></svg>");
    await expect(services.account.uploadLogo(ownerA, svg)).rejects.toMatchObject(invalid);
    await expect(services.account.uploadLogo(ownerA, new Uint8Array(3 * 1024 * 1024))).rejects.toMatchObject(
      invalid,
    );
  });

  it("changes the password only with the current one", async () => {
    await expect(
      services.account.changePassword({
        userId: ownerA.userId,
        currentSessionId: "x",
        currentPassword: "wrong",
        newPassword: "Новый-пароль-2026",
      }),
    ).rejects.toMatchObject(invalid);
    await services.account.changePassword({
      userId: ownerA.userId,
      currentSessionId: "x",
      currentPassword: "demo12345",
      newPassword: "Новый-пароль-2026",
    });
    expect(
      (
        await container.auth.signIn(
          { email: "owner@coffeepoint.kz", password: "Новый-пароль-2026" },
          { ip: null, userAgent: null },
        )
      ).ok,
    ).toBe(true);
  });
});

describe("permission checks inside services (not only in actions)", () => {
  const as = (role: OrgContext["role"]): OrgContext => ({ ...ownerA, role });

  it("refuses writes to roles without the permission, whatever path calls the service", async () => {
    const [card] = await services.cards.list(ownerA);
    const forbidden = { code: "FORBIDDEN" };
    await expect(services.cards.setPaused(as("VIEWER"), card!.id, true)).rejects.toMatchObject(forbidden);
    await expect(
      services.employees.create(as("VIEWER"), {
        name: "X",
        position: null,
        locationId: null,
        isActive: true,
      }),
    ).rejects.toMatchObject(forbidden);
    await expect(
      services.team.invite(as("MANAGER"), { email: "x@y.kz", role: "VIEWER" }),
    ).rejects.toMatchObject(forbidden);
    await expect(services.account.removeLogo(as("MANAGER"))).rejects.toMatchObject(forbidden);
  });

  it("refuses every write to staff viewing a cabinet (no role), while reads work", async () => {
    const viewer = as(null);
    const [card] = await services.cards.list(viewer);
    expect(card).toBeDefined();
    await expect(services.cards.reportLost(viewer, card!.id)).rejects.toMatchObject({ code: "FORBIDDEN" });
    await expect(services.support.create(viewer, { subject: "s", body: "b" })).rejects.toMatchObject({
      code: "FORBIDDEN",
    });
  });
});

describe("organization view of the repositories", () => {
  it("drops another organization's location ids instead of trusting them", async () => {
    const { forOrganization } = await import("@/server/repositories/tenant");
    const [foreign] = await container.repositories.locations.list({ organizationId: orgB });
    const snapshots = await forOrganization(
      container.repositories,
      ownerA.organizationId,
    ).ratingSnapshots.list({
      locationIds: [foreign!.id],
    });
    expect(snapshots).toEqual([]);
  });
});
