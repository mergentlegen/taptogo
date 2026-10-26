import JSZip from "jszip";
import { beforeEach, describe, expect, it } from "vitest";

import { createSeedData, DEMO_PASSWORD } from "@/mocks/seed";
import { createMockContainer, type Container } from "@/server/container";
import { CardRedirectService } from "@/server/services/card-redirect-service";

import { createServices, type Services } from "../index";
import type { AdminContext } from "./context";

const NOW = new Date("2026-10-17T10:00:00Z");

let container: Container;
let admin: Services["admin"];
let adminCtx: AdminContext;
/** The second administrator (the team is two people). */
let partnerCtx: AdminContext;

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
    return { userId: user!.id, role: user!.platformRole!, sessionId: signIn.session.token!.split(".")[0]! };
  };
  adminCtx = await ctxFor("admin@taptogo.kz");
  partnerCtx = await ctxFor("admin2@taptogo.kz");
});

const orgId = async (name: string) =>
  (await container.repositories.organizations.list({ search: name }))[0]!.id;

describe("client wizard", () => {
  const input = {
    organization: {
      name: "Шашлычная «Тест»",
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
    owner: { email: "owner@shashlyk.kz", name: "Алия Владелец" },
  };

  it("creates organization, locations, a verified 2GIS target and the owner's account", async () => {
    const { organization: org, account } = await admin.clients.create(adminCtx, input);
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

    // The owner can sign in at once with the temporary password, and must replace it.
    expect(account).toMatchObject({ email: "owner@shashlyk.kz", name: "Алия Владелец" });
    expect(account.temporaryPassword).toMatch(/^[A-Za-z0-9]{12}$/);
    const owner = await repos.users.findByEmail("owner@shashlyk.kz");
    expect(owner?.mustChangePassword).toBe(true);
    expect((await repos.memberships.find(owner!.id, org.id))?.role).toBe("OWNER");
    const signIn = await container.auth.signIn(
      { email: "owner@shashlyk.kz", password: account.temporaryPassword! },
      { ip: "203.0.113.5", userAgent: null },
    );
    expect(signIn.ok && signIn.session.user.mustChangePassword).toBe(true);
    // No mail is involved: nothing is queued for sending.
    expect(await container.outbox.list()).toEqual([]);
  });

  it("works with the title alone: the contact person is optional", async () => {
    const { organization } = await admin.clients.create(adminCtx, {
      ...input,
      organization: { name: "Только название", contactName: null, contactPhone: null, contactEmail: null },
    });
    expect(organization).toMatchObject({ name: "Только название", contactName: null, contactPhone: null });
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
});

describe("batches and cards", () => {
  it("creates unique UNASSIGNED codes and exports a ZIP of SVG QR codes", async () => {
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

    expect(detail?.cards.map((c) => c.number)).toEqual(Array.from({ length: 25 }, (_, i) => i + 1));
    const zip = await JSZip.loadAsync((await admin.cards.exportBatchZip(adminCtx, batch.id)).body);
    const files = Object.keys(zip.files).filter((f) => f.endsWith(".svg"));
    expect(files).toHaveLength(25);
    expect(await zip.file(files[0]!)!.async("string")).toContain("<svg");
    // The list of codes travels inside the archive, in the order of the printed numbers.
    const list = (await zip.file("codes.csv")!.async("string")).split(/\r?\n/);
    expect(list[1]).toMatch(/^1,[A-Za-z0-9]{8},http:\/\/localhost:3000\/t\/[A-Za-z0-9]{8},.+\?s=q$/);
  });

  it("renames a batch and changes its note, leaving the cards alone", async () => {
    const batch = await admin.cards.createBatch(adminCtx, {
      name: "Старое",
      quantity: 3,
      cardType: "STICKER",
      notes: null,
    });
    const after = await admin.cards.updateBatch(adminCtx, batch.id, { name: "Новое", notes: "Для кофейни" });

    expect(after).toMatchObject({ name: "Новое", notes: "Для кофейни", quantity: 3, cardType: "STICKER" });
    expect((await admin.cards.batchDetail(batch.id))?.cards).toHaveLength(3);
    const { items } = await container.repositories.auditLogs.list({ action: "batch.update" }, { limit: 1 });
    expect(items[0]).toMatchObject({ entityId: batch.id });
    await expect(
      admin.cards.updateBatch(adminCtx, crypto.randomUUID(), { name: "x", notes: null }),
    ).rejects.toMatchObject({
      code: "NOT_FOUND",
    });
  });

  it("deletes a batch that was never handed out, and refuses one that was", async () => {
    const spare = await admin.cards.createBatch(adminCtx, {
      name: "Лишняя",
      quantity: 4,
      cardType: "NFC_CARD",
      notes: null,
    });
    const used = await admin.cards.createBatch(adminCtx, {
      name: "Выданная",
      quantity: 2,
      cardType: "NFC_CARD",
      notes: null,
    });
    const coffee = await orgId("Coffee");
    const handedOut = await admin.cards.resolveSelection({ range: { batchId: used.id, from: 1, to: 1 } });
    await admin.cards.assign(adminCtx, handedOut, coffee, null);

    await expect(admin.cards.deleteBatch(adminCtx, used.id)).rejects.toMatchObject({ code: "CONFLICT" });
    expect(await admin.cards.batchDetail(used.id)).not.toBeNull();

    await admin.cards.deleteBatch(adminCtx, spare.id);
    expect(await admin.cards.batchDetail(spare.id)).toBeNull();
    expect(await container.repositories.cards.count({ batchId: spare.id })).toBe(0);
    await expect(admin.cards.deleteBatch(adminCtx, spare.id)).rejects.toMatchObject({ code: "NOT_FOUND" });

    // Once the cards are released again, the batch can go too.
    await admin.cards.setStatus(
      adminCtx,
      handedOut.map((c) => c.id),
      "UNASSIGNED",
    );
    await admin.cards.deleteBatch(adminCtx, used.id);
    expect(await admin.cards.batchDetail(used.id)).toBeNull();
    const { items } = await container.repositories.auditLogs.list({ action: "batch.delete" }, { limit: 5 });
    expect(items).toHaveLength(2);
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

  it("refuses cards that are already assigned", async () => {
    const beauty = await orgId("Aru");
    const [taken] = await container.repositories.cards.list({ statuses: ["ACTIVE"] });
    await expect(admin.cards.assign(adminCtx, [taken!], beauty, null)).rejects.toMatchObject({
      code: "CONFLICT",
    });
  });

  it("pauses a card, then releases it back to the pool", async () => {
    const [card] = await container.repositories.cards.list({ statuses: ["ACTIVE"] });
    await admin.cards.setStatus(adminCtx, [card!.id], "PAUSED");
    expect((await container.repositories.cards.findById(card!.id))?.status).toBe("PAUSED");

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
  it("lets an administrator work tickets and leave internal comments", async () => {
    const [ticket] = await admin.inbox.tickets(["NEW"]);
    await admin.inbox.updateTicket(partnerCtx, ticket!.id, {
      status: "IN_PROGRESS",
      assigneeId: partnerCtx.userId,
    });
    await admin.inbox.addComment(partnerCtx, "TICKET", ticket!.id, "Позвонил клиенту");

    const detail = await admin.inbox.ticket(ticket!.id);
    expect(detail?.ticket).toMatchObject({ status: "IN_PROGRESS", assigneeId: partnerCtx.userId });
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
  it("creates an administrator without a password and queues a set-password link", async () => {
    const user = await admin.staff.create(adminCtx, {
      email: "new.admin@taptogo.kz",
      name: "Новый Админ",
    });
    expect(user.platformRole).toBe("ADMIN");
    expect((await container.outbox.list())[0]).toMatchObject({
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

  it("protects self-changes and the last active administrator", async () => {
    await expect(admin.staff.setStatus(adminCtx, adminCtx.userId, "BLOCKED")).rejects.toMatchObject({
      code: "CONFLICT",
    });

    // With the partner and the former admin blocked, nobody else could sign in: refused.
    await admin.staff.setStatus(adminCtx, partnerCtx.userId, "BLOCKED");
    expect((await container.repositories.users.findById(partnerCtx.userId))?.status).toBe("BLOCKED");
    await expect(admin.staff.setStatus(partnerCtx, adminCtx.userId, "BLOCKED")).rejects.toMatchObject({
      code: "CONFLICT",
    });
  });
});

describe("impersonation", () => {
  it("opens a read-only cabinet that ends after 30 minutes, with audit entries", async () => {
    const coffee = await orgId("Coffee");
    const session = await container.auth.signIn(
      { email: "admin2@taptogo.kz", password: DEMO_PASSWORD },
      { ip: "imp", userAgent: null },
    );
    if (!session.ok) throw new Error();
    const ctx = { ...partnerCtx, sessionId: session.session.token!.split(".")[0]! };

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
    expect(data.activeCards).toBeGreaterThan(0);
    expect(data.newTickets.length).toBeGreaterThan(0);
  });

  it("updates settings, de-duplicating domains", async () => {
    const settings = await admin.settings.get();
    const updated = await admin.settings.update(adminCtx, {
      ...settings,
      allowedRedirectDomains: ["2gis.kz", "2GIS.kz", "google.com"],
    });
    expect(updated.allowedRedirectDomains).toEqual(["2gis.kz", "google.com"]);
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
      admin.cards.assign(partnerCtx, cards, beauty, null),
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
});

describe("accounts and invitation links", () => {
  it("creates an account for a client's employee, who cannot sign up by themselves", async () => {
    const coffee = await orgId("Coffee");
    const account = await admin.clients.createAccount(adminCtx, coffee, {
      email: "Barista@CoffeePoint.kz",
      name: "Новый Бариста",
      role: "MANAGER",
    });

    expect(account.email).toBe("barista@coffeepoint.kz");
    expect(account.temporaryPassword).toMatch(/^[A-Za-z0-9]{12}$/);
    const user = (await container.repositories.users.findByEmail("barista@coffeepoint.kz"))!;
    expect(user.mustChangePassword).toBe(true);
    expect((await container.repositories.memberships.find(user.id, coffee))?.role).toBe("MANAGER");
    const { items } = await container.repositories.auditLogs.list({ action: "user." }, { limit: 5 });
    expect(items[0]).toMatchObject({ action: "user.create", entityId: user.id, organizationId: coffee });
    // The audit trail never contains the password.
    expect(JSON.stringify(items)).not.toContain(account.temporaryPassword!);
  });

  it("only adds someone who already has an account, and refuses members and staff", async () => {
    const beauty = await orgId("Aru");
    const existing = await admin.clients.createAccount(adminCtx, beauty, {
      email: "owner@coffeepoint.kz",
      name: "Игнорируется",
      role: "MANAGER",
    });
    expect(existing).toMatchObject({ email: "owner@coffeepoint.kz", temporaryPassword: null });

    await expect(
      admin.clients.createAccount(adminCtx, beauty, {
        email: "owner@coffeepoint.kz",
        name: "x",
        role: "OWNER",
      }),
    ).rejects.toMatchObject({ code: "CONFLICT" });
    await expect(
      admin.clients.createAccount(adminCtx, beauty, { email: "admin2@taptogo.kz", name: "x", role: "OWNER" }),
    ).rejects.toMatchObject({ code: "CONFLICT" });
  });

  it("refuses an archived client", async () => {
    const coffee = await orgId("Coffee");
    await admin.clients.setStatus(adminCtx, coffee, "ARCHIVED");
    await expect(
      admin.clients.createAccount(adminCtx, coffee, {
        email: "late@coffeepoint.kz",
        name: "x",
        role: "MANAGER",
      }),
    ).rejects.toMatchObject({ code: "NOT_FOUND" });
  });

  it("gives an invitation as a link to copy, usable once, with nothing queued for sending", async () => {
    const coffee = await orgId("Coffee");
    const { link } = await admin.clients.invite(adminCtx, coffee, {
      email: "link@coffeepoint.kz",
      role: "MANAGER",
    });

    expect(link).toMatch(/^http:\/\/localhost:3000\/invite\/[A-Za-z0-9_-]{43}$/);
    expect(await container.outbox.list()).toEqual([]);
    const token = link.split("/").at(-1)!;
    expect((await container.auth.getInvitation(token))?.status).toBe("PENDING");
    const accepted = await container.auth.acceptInvitation(
      { token, name: "По ссылке", password: "Ссылка-сработала-2026" },
      { ip: "203.0.113.6", userAgent: null },
    );
    expect(accepted.ok).toBe(true);
    expect(
      (
        await container.auth.acceptInvitation(
          { token, name: "Ещё", password: "x" },
          { ip: "1", userAgent: null },
        )
      ).ok,
    ).toBe(false);
  });
});

describe("temporary passwords from the admin panel", () => {
  it("is issued only to a member of that client, never to the administrator themselves", async () => {
    const coffee = await orgId("Coffee");
    const member = (await container.repositories.users.findByEmail("manager@coffeepoint.kz"))!;

    await expect(
      admin.clients.issueTemporaryPassword(adminCtx, coffee, adminCtx.userId),
    ).rejects.toMatchObject({
      code: "CONFLICT",
    });
    await expect(
      admin.clients.issueTemporaryPassword(adminCtx, await orgId("Aru"), member.id),
    ).rejects.toMatchObject({ code: "NOT_FOUND" });
  });

  it("returns the password once and records the event without the password itself", async () => {
    const coffee = await orgId("Coffee");
    const member = (await container.repositories.users.findByEmail("manager@coffeepoint.kz"))!;
    const password = await admin.clients.issueTemporaryPassword(adminCtx, coffee, member.id);

    expect(password).toMatch(/^[A-Za-z0-9]{12}$/);
    const { items } = await container.repositories.auditLogs.list({ organizationId: coffee }, { limit: 20 });
    const entry = items.find((e) => e.action === "user.temporary_password");
    expect(entry).toMatchObject({ actorUserId: adminCtx.userId, entityId: member.id });
    expect(JSON.stringify(items)).not.toContain(password);
  });
});
