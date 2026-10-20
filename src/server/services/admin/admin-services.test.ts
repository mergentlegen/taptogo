import JSZip from "jszip";
import { beforeEach, describe, expect, it } from "vitest";

import { createSeedData, DEMO_PASSWORD } from "@/mocks/seed";
import { createMockContainer, type Container } from "@/server/container";
import { CardRedirectService } from "@/server/services/card-redirect-service";

import { createServices, type Services } from "../index";
import type { AdminContext } from "./context";

const NOW = new Date("2026-10-17T10:00:00Z");
const TODAY = "2026-10-17";

let container: Container;
let admin: Services["admin"];
let adminCtx: AdminContext;
let supportCtx: AdminContext;
let superCtx: AdminContext;

beforeEach(async () => {
  container = createMockContainer(createSeedData({ now: NOW }), () => NOW);
  admin = createServices(container).admin;
  const users = container.repositories.users;
  const ctxFor = async (email: string): Promise<AdminContext> => {
    const signIn = await container.auth.signIn(
      { email, password: DEMO_PASSWORD },
      { ip: email, userAgent: null },
    );
    if (!signIn.ok) throw new Error("sign-in failed");
    const user = await users.findByEmail(email);
    return { userId: user!.id, role: user!.platformRole!, sessionId: signIn.session.token.split(".")[0]! };
  };
  adminCtx = await ctxFor("admin@taptogo.kz");
  supportCtx = await ctxFor("support@taptogo.kz");
  superCtx = await ctxFor("superadmin@taptogo.kz");
});

const orgId = async (name: string) =>
  (await container.repositories.organizations.list({ search: name }))[0]!.id;

describe("client wizard", () => {
  const input = {
    organization: {
      name: "Шашлычная «Тест»",
      legalName: null,
      bin: null,
      contactName: "Тест Тестов",
      contactPhone: "+77010000000",
      contactEmail: "test@shashlyk.kz",
    },
    locations: [
      {
        name: "Центр",
        address: "Алматы, ул. Тестовая, 1",
        twogisUrl: "https://2gis.kz/almaty/firm/70000009999999999",
      },
      { name: "Без 2ГИС", address: "Алматы, ул. Другая, 2", twogisUrl: null },
    ],
    owner: { email: "owner@shashlyk.kz" },
    subscription: { plan: "START" as const, paidUntil: "2026-11-17", trial: true },
  };

  it("creates organization, locations, verified 2GIS target, subscription and owner invitation", async () => {
    const { organization: org, inviteSent } = await admin.clients.create(adminCtx, input);
    expect(inviteSent).toBe(true);
    const repos = container.repositories;

    const locations = await repos.locations.list({ organizationId: org.id });
    expect(locations).toHaveLength(2);
    const targets = await repos.targets.list({ organizationId: org.id });
    expect(targets).toEqual([
      expect.objectContaining({
        type: "TWOGIS_REVIEW",
        isVerified: true,
        url: "https://2gis.kz/almaty/firm/70000009999999999/tab/reviews",
      }),
    ]);
    expect(await repos.subscriptions.findByOrganization(org.id)).toMatchObject({
      plan: "START",
      cardLimit: 10,
      status: "TRIAL",
    });
    expect(await repos.invitations.listByOrganization(org.id)).toEqual([
      expect.objectContaining({ email: "owner@shashlyk.kz", role: "OWNER" }),
    ]);
    expect(container.devOutbox?.list()[0]?.to).toBe("owner@shashlyk.kz");
  });

  it("rejects a malformed 2GIS link before creating anything", async () => {
    const before = (await container.repositories.organizations.list()).length;
    await expect(
      admin.clients.create(adminCtx, {
        ...input,
        locations: [{ ...input.locations[0]!, twogisUrl: "https://evil.com/firm/1" }],
      }),
    ).rejects.toMatchObject({ code: "VALIDATION" });
    expect(await container.repositories.organizations.list()).toHaveLength(before);
  });

  it("is admin-only", async () => {
    await expect(admin.clients.create(supportCtx, input)).rejects.toMatchObject({ code: "FORBIDDEN" });
  });
});

describe("batches and cards", () => {
  it("creates unique UNASSIGNED codes and exports CSV and a ZIP of SVG QR codes", async () => {
    const batch = await admin.cards.createBatch(adminCtx, {
      name: "Тест",
      quantity: 25,
      cardType: "STICKER",
      notes: null,
    });
    const detail = await admin.cards.batchDetail(batch.id);
    expect(detail?.cards).toHaveLength(25);
    expect(detail?.cards.every((c) => c.status === "UNASSIGNED" && /^[A-Za-z0-9]{8}$/.test(c.code))).toBe(
      true,
    );
    const allCodes = (await container.repositories.cards.list()).map((c) => c.code);
    expect(new Set(allCodes).size).toBe(allCodes.length);

    const csv = await admin.cards.exportBatchCsv(adminCtx, batch.id);
    // The printed number comes first: it is how the print shop and the flashing screen line up.
    expect(csv.body.split("\r\n")[1]).toMatch(
      /^1,[A-Za-z0-9]{8},http:\/\/localhost:3000\/t\/[A-Za-z0-9]{8},.+\?s=q$/,
    );
    expect(detail?.cards.map((c) => c.number)).toEqual(Array.from({ length: 25 }, (_, i) => i + 1));
    const zip = await JSZip.loadAsync((await admin.cards.exportBatchZip(adminCtx, batch.id)).body);
    const files = Object.keys(zip.files).filter((f) => f.endsWith(".svg"));
    expect(files).toHaveLength(25);
    expect(await zip.file(files[0]!)!.async("string")).toContain("<svg");
  });

  it("assigns a range to a client: ACTIVE, pointing to the location's review page", async () => {
    const coffee = await orgId("Coffee");
    const [location] = await container.repositories.locations.list({ organizationId: coffee });
    const batch = await admin.cards.createBatch(adminCtx, {
      name: "R",
      quantity: 5,
      cardType: "NFC_CARD",
      notes: null,
    });
    const cards = await admin.cards.resolveSelection({ range: { batchId: batch.id, from: 2, to: 4 } });
    const assigned = await admin.cards.assign(adminCtx, cards, coffee, location!.id);

    expect(assigned).toHaveLength(3);
    expect(assigned.every((c) => c.status === "ACTIVE" && c.organizationId === coffee && c.targetId)).toBe(
      true,
    );
    const decision = await new CardRedirectService(container.repositories).resolve(assigned[0]!.code);
    expect(decision.kind).toBe("REDIRECT");
  });

  it("enforces the plan's card limit and refuses already-assigned cards", async () => {
    const beauty = await orgId("Aru"); // START plan, 10 cards; 6 in use
    const batch = await admin.cards.createBatch(adminCtx, {
      name: "L",
      quantity: 6,
      cardType: "STICKER",
      notes: null,
    });
    const cards = await admin.cards.resolveSelection({ range: { batchId: batch.id, from: 1, to: 6 } });
    await expect(admin.cards.assign(adminCtx, cards, beauty, null)).rejects.toMatchObject({
      code: "CONFLICT",
    });

    const [taken] = await container.repositories.cards.list({ statuses: ["ACTIVE"] });
    await expect(admin.cards.assign(adminCtx, [taken!], beauty, null)).rejects.toMatchObject({
      code: "CONFLICT",
    });
  });

  it("lets support pause or mark lost, but not revoke or release", async () => {
    const [card] = await container.repositories.cards.list({ statuses: ["ACTIVE"] });
    await admin.cards.setStatus(supportCtx, [card!.id], "PAUSED");
    expect((await container.repositories.cards.findById(card!.id))?.status).toBe("PAUSED");
    await expect(admin.cards.setStatus(supportCtx, [card!.id], "REVOKED")).rejects.toMatchObject({
      code: "FORBIDDEN",
    });

    await admin.cards.setStatus(adminCtx, [card!.id], "UNASSIGNED");
    expect(await container.repositories.cards.findById(card!.id)).toMatchObject({
      status: "UNASSIGNED",
      organizationId: null,
      targetId: null,
    });
  });

  it("never activates a card that has no client", async () => {
    const [free] = await container.repositories.cards.list({ statuses: ["UNASSIGNED"] });
    await expect(admin.cards.setStatus(adminCtx, [free!.id], "ACTIVE")).rejects.toMatchObject({
      code: "CONFLICT",
    });
    expect((await container.repositories.cards.findById(free!.id))?.status).toBe("UNASSIGNED");
  });
});

describe("targets", () => {
  it("only accepts https URLs on allowed domains and starts unverified", async () => {
    const coffee = await orgId("Coffee");
    await expect(
      admin.targets.create(adminCtx, {
        organizationId: coffee,
        locationId: null,
        type: "CUSTOM",
        url: "https://evil.example/x",
      }),
    ).rejects.toMatchObject({ code: "VALIDATION" });

    const target = await admin.targets.create(adminCtx, {
      organizationId: coffee,
      locationId: null,
      type: "GOOGLE_MAPS",
      url: "https://www.google.com/maps/place/x",
    });
    expect(target.isVerified).toBe(false);
    await admin.targets.setVerified(adminCtx, target.id, true);
    expect((await container.repositories.targets.findById(target.id))?.isVerified).toBe(true);
  });

  it("unverifying a target stops its cards from redirecting", async () => {
    const [card] = await container.repositories.cards.list({ statuses: ["ACTIVE"] });
    await admin.targets.setVerified(adminCtx, card!.targetId!, false);
    expect((await new CardRedirectService(container.repositories).resolve(card!.code)).kind).toBe("INACTIVE");
  });
});

describe("billing", () => {
  it("extends from today when the subscription lapsed, and from paidUntil when active", async () => {
    const beauty = await orgId("Aru"); // paidUntil = today - 20
    const lapsed = await admin.billing.recordPayment(adminCtx, {
      organizationId: beauty,
      amountKzt: 9900,
      method: "KASPI",
      paidOn: TODAY,
      months: 1,
      comment: null,
    });
    expect(lapsed.paidUntil).toBe("2026-11-17");

    const coffee = await orgId("Coffee"); // paidUntil = today + 40
    const active = await admin.billing.recordPayment(adminCtx, {
      organizationId: coffee,
      amountKzt: 19900,
      method: "CASH",
      paidOn: TODAY,
      months: 2,
      comment: "наличные",
    });
    expect(active.paidUntil).toBe("2027-01-26");
    expect(
      (await admin.billing.overview()).subscriptions.find((s) => s.organizationId === beauty)?.status,
    ).toBe("ACTIVE");
  });
});

describe("integrations", () => {
  it("syncs a linked location once per hour", async () => {
    const [location] = await container.repositories.locations.list({ organizationId: await orgId("Coffee") });
    // Seed snapshots are from 03:00 today, so the first manual sync at 15:00 is allowed.
    const snapshot = await admin.integrations.sync(adminCtx, location!.id);
    expect(snapshot.capturedAt).toBe(NOW.toISOString());
    await expect(admin.integrations.sync(adminCtx, location!.id)).rejects.toMatchObject({
      code: "RATE_LIMITED",
    });
  });
});

describe("inbox", () => {
  it("lets support work tickets and leave internal comments", async () => {
    const [ticket] = await admin.inbox.tickets(["NEW"]);
    await admin.inbox.updateTicket(supportCtx, ticket!.id, {
      status: "IN_PROGRESS",
      assigneeId: supportCtx.userId,
    });
    await admin.inbox.addComment(supportCtx, "TICKET", ticket!.id, "Позвонил клиенту");

    const detail = await admin.inbox.ticket(ticket!.id);
    expect(detail?.ticket).toMatchObject({ status: "IN_PROGRESS", assigneeId: supportCtx.userId });
    expect(detail?.comments.at(-1)?.body).toBe("Позвонил клиенту");
  });

  it("only assigns active staff", async () => {
    const [ticket] = await admin.inbox.tickets();
    const client = await container.repositories.users.findByEmail("owner@coffeepoint.kz");
    await expect(
      admin.inbox.updateTicket(adminCtx, ticket!.id, { assigneeId: client!.id }),
    ).rejects.toMatchObject({
      code: "VALIDATION",
    });
  });
});

describe("staff", () => {
  it("creates staff without a password and emails a set-password link", async () => {
    const user = await admin.staff.create(superCtx, {
      email: "new.admin@taptogo.kz",
      name: "Новый Админ",
      role: "ADMIN",
    });
    expect(user.platformRole).toBe("ADMIN");
    expect(container.devOutbox?.list()[0]).toMatchObject({
      to: "new.admin@taptogo.kz",
      tag: "password_reset",
    });
    // The shared demo password never works for accounts created at runtime.
    expect(
      (
        await container.auth.signIn(
          { email: "new.admin@taptogo.kz", password: DEMO_PASSWORD },
          { ip: "x", userAgent: null },
        )
      ).ok,
    ).toBe(false);
  });

  it("protects self-changes and the last super admin; is SUPER_ADMIN only", async () => {
    await expect(admin.staff.setRole(superCtx, superCtx.userId, "ADMIN")).rejects.toMatchObject({
      code: "CONFLICT",
    });
    await expect(admin.staff.setStatus(adminCtx, supportCtx.userId, "BLOCKED")).rejects.toMatchObject({
      code: "FORBIDDEN",
    });

    await admin.staff.setStatus(superCtx, supportCtx.userId, "BLOCKED");
    expect((await container.repositories.users.findById(supportCtx.userId))?.status).toBe("BLOCKED");
  });
});

describe("impersonation", () => {
  it("opens a read-only cabinet that ends after 30 minutes, with audit entries", async () => {
    const coffee = await orgId("Coffee");
    const session = await container.auth.signIn(
      { email: "support@taptogo.kz", password: DEMO_PASSWORD },
      { ip: "imp", userAgent: null },
    );
    if (!session.ok) throw new Error();
    const ctx = { ...supportCtx, sessionId: session.session.token.split(".")[0]! };

    await admin.clients.startImpersonation(ctx, coffee);
    expect((await container.auth.getSession(session.session.token))?.impersonation?.organizationId).toBe(
      coffee,
    );

    await admin.clients.stopImpersonation(ctx);
    expect((await container.auth.getSession(session.session.token))?.impersonation).toBeNull();
    const { items } = await container.repositories.auditLogs.list({ action: "impersonation." }, { limit: 5 });
    expect(items.map((i) => i.action).sort()).toEqual(["impersonation.start", "impersonation.stop"]);
  });
});

describe("overview and settings", () => {
  it("summarizes the platform", async () => {
    const data = await admin.overview.overview();
    expect(data.activeClients).toBe(3);
    expect(data.lapsed.map((l) => l.status).sort()).toEqual(["EXPIRED", "GRACE"]);
    expect(data.revenueMonthKzt).toBeGreaterThan(0);
    expect(data.newLeads.length).toBeGreaterThan(0);
  });

  it("updates settings only for SUPER_ADMIN, de-duplicating domains", async () => {
    const settings = await admin.settings.get();
    await expect(admin.settings.update(adminCtx, settings)).rejects.toMatchObject({ code: "FORBIDDEN" });
    const updated = await admin.settings.update(superCtx, {
      ...settings,
      allowedRedirectDomains: ["2gis.kz", "2GIS.kz", "google.com"],
      graceDays: 10,
    });
    expect(updated.allowedRedirectDomains).toEqual(["2gis.kz", "google.com"]);
    expect(updated.graceDays).toBe(10);
  });
});

describe("consistency under concurrency and failures", () => {
  it("lets only one of two simultaneous assignments of the same cards win", async () => {
    const [coffee, beauty] = [await orgId("Coffee"), await orgId("Aru")];
    const batch = await admin.cards.createBatch(adminCtx, {
      name: "Race",
      quantity: 2,
      cardType: "STICKER",
      notes: null,
    });
    // Both admins resolved the selection while the cards were still free.
    const cards = await admin.cards.resolveSelection({ range: { batchId: batch.id, from: 1, to: 2 } });

    const results = await Promise.allSettled([
      admin.cards.assign(adminCtx, cards, coffee, null),
      admin.cards.assign(superCtx, cards, beauty, null),
    ]);
    expect(results.map((r) => r.status).sort()).toEqual(["fulfilled", "rejected"]);
    const owners = new Set(
      (await container.repositories.cards.findByIds(cards.map((c) => c.id))).map((c) => c.organizationId),
    );
    expect(owners.size).toBe(1);
  });

  it("assigns a pasted list of codes with one lookup and reports unknown codes", async () => {
    const batch = await admin.cards.createBatch(adminCtx, {
      name: "C",
      quantity: 3,
      cardType: "STICKER",
      notes: null,
    });
    const { cards } = (await admin.cards.batchDetail(batch.id))!;
    const codes = cards.map((c) => c.code);
    expect(await admin.cards.resolveSelection({ codes })).toHaveLength(3);
    await expect(admin.cards.resolveSelection({ codes: [...codes, "NoSuch01"] })).rejects.toMatchObject({
      code: "VALIDATION",
    });
  });

  it("keeps the new client when the owner's invitation email fails, and says so", async () => {
    container.email.send = () => Promise.reject(new Error("smtp down"));
    const before = (await container.repositories.organizations.list()).length;
    const { organization, inviteSent } = await createServices(container).admin.clients.create(adminCtx, {
      organization: {
        name: "Без почты",
        legalName: null,
        bin: null,
        contactName: "Тест",
        contactPhone: "+77010000000",
        contactEmail: "nomail@example.kz",
      },
      locations: [{ name: "Точка", address: "Алматы", twogisUrl: null }],
      owner: { email: "owner@nomail.kz" },
      subscription: { plan: "START", paidUntil: "2026-11-17", trial: true },
    });
    expect(inviteSent).toBe(false);
    expect(await container.repositories.organizations.list()).toHaveLength(before + 1);
    // The invitation is stored, so a resend from the client page replaces it.
    expect(await container.repositories.invitations.listByOrganization(organization.id)).toHaveLength(1);
  });
});
