/**
 * Integration tests of the Supabase repositories against a REAL project.
 * They run only when SUPABASE_URL, SUPABASE_PUBLISHABLE_KEY and SUPABASE_SECRET_KEY
 * are set (.env.local is read automatically) and create their own throw-away rows
 * (random emails / names), which are deleted afterwards. `audit_logs` is append-only by
 * design, so its pagination test runs only with SUPABASE_TEST_AUDIT=1 (it leaves 5 rows).
 */
import { createClient } from "@supabase/supabase-js";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import type { TapEvent } from "@/features/analytics/schemas";
import { generateCardCode } from "@/features/cards/code";
import type { Organization } from "@/features/organizations/schemas";
import type { Repositories } from "@/server/repositories";
import type { Db } from "@/server/supabase/clients";
import type { Database } from "@/server/supabase/database.types";

import { createSupabaseRepositories } from "./index";

try {
  process.loadEnvFile(".env.local");
} catch {
  // no .env.local: the suite below is skipped
}

const { SUPABASE_URL, SUPABASE_PUBLISHABLE_KEY, SUPABASE_SECRET_KEY } = process.env;
const configured = Boolean(SUPABASE_URL && SUPABASE_PUBLISHABLE_KEY && SUPABASE_SECRET_KEY);

const run = crypto.randomUUID().slice(0, 8);
const AUDIT_MARK = `supabase_test_${run}`;
const PASSWORD = `Test-${crypto.randomUUID()}`;
const NOW = new Date();
const HOUR = 3_600_000;
const range = {
  from: new Date(NOW.getTime() - HOUR).toISOString(),
  to: new Date(NOW.getTime() + HOUR).toISOString(),
};
const today = NOW.toISOString().slice(0, 10);

const expectCode = (promise: Promise<unknown>, code: string) =>
  expect(promise).rejects.toMatchObject({ name: "AppError", code });

describe.skipIf(!configured)("Supabase repositories (real project)", () => {
  const options = { auth: { persistSession: false, autoRefreshToken: false } };
  let system: Db;
  let sys: Repositories;
  let owner: Repositories;

  const authIds: string[] = [];
  let adminId: string;
  let ownerId: string;
  let orgA: Organization;
  let orgB: Organization;
  let locationA: string;
  let locationB: string;
  let batchId: string;
  let cards: { id: string; code: string }[];

  async function createAuthUser(label: string) {
    const email = `t-${run}-${label}@example.kz`;
    const { data, error } = await system.auth.admin.createUser({
      email,
      password: PASSWORD,
      email_confirm: true,
    });
    if (error) throw error;
    authIds.push(data.user.id);
    return { id: data.user.id, email };
  }

  const clientInput = (name: string) => ({
    organization: {
      name,
      contactName: "Тест Тестов",
      contactPhone: "+77001112233",
      contactEmail: `t-${run}@example.kz`,
      timezone: "Asia/Almaty",
      status: "ACTIVE" as const,
    },
    locations: [
      {
        location: {
          name: `${name} филиал`,
          address: "Алматы, Абая 1",
          twogisFirmId: null,
          twogisProfileUrl: null,
          isActive: true,
        },
        reviewsTargetUrl: "https://2gis.kz/almaty/firm/70000001000000001/tab/reviews",
      },
    ],
  });

  beforeAll(async () => {
    system = createClient<Database>(SUPABASE_URL!, SUPABASE_SECRET_KEY!, options);
    sys = createSupabaseRepositories(async () => system);

    const admin = await createAuthUser("admin");
    const person = await createAuthUser("owner");
    adminId = admin.id;
    ownerId = person.id;
    for (const [user, platformRole, label] of [
      [admin, "ADMIN", "Админ"],
      [person, null, "Владелец"],
    ] as const) {
      await sys.users.create({
        id: user.id,
        email: user.email,
        name: `${label} ${run}`,
        phone: null,
        platformRole,
        status: "ACTIVE",
        totpEnabled: false,
        mustChangePassword: false,
        lastLoginAt: null,
      });
    }

    const a = await sys.organizations.createClient(clientInput(`Тест A ${run}`));
    const b = await sys.organizations.createClient(clientInput(`Тест B ${run}`));
    orgA = a.organization;
    orgB = b.organization;
    locationA = a.locations[0]!.id;
    locationB = b.locations[0]!.id;
    await sys.memberships.create({ userId: ownerId, organizationId: orgA.id, role: "OWNER" });

    const created = await sys.batches.createWithCards(
      { name: `Партия ${run}`, quantity: 5, cardType: "NFC_CARD", notes: null },
      Array.from({ length: 5 }, (_, i) => ({
        code: generateCardCode(),
        organizationId: null,
        locationId: null,
        employeeId: null,
        targetId: null,
        label: `Карта ${i + 1}`,
        type: "NFC_CARD" as const,
        status: "UNASSIGNED" as const,
        nfcWritten: false,
        nfcLocked: false,
        activatedAt: null,
      })),
    );
    batchId = created.batch.id;
    cards = created.cards.map(({ id, code }) => ({ id, code }));

    // A second client acting as the signed-in owner: RLS applies to it.
    const user = createClient<Database>(SUPABASE_URL!, SUPABASE_PUBLISHABLE_KEY!, options);
    const { error } = await user.auth.signInWithPassword({ email: person.email, password: PASSWORD });
    if (error) throw error;
    owner = createSupabaseRepositories(async () => user);
  }, 60_000);

  afterAll(async () => {
    if (!system) return;
    const orgIds = [orgA?.id, orgB?.id].filter((id): id is string => Boolean(id));
    if (orgIds.length) {
      for (const table of [
        "tap_events",
        "daily_card_stats",
        "support_tickets",
        "cards",
        "employees",
        "redirect_targets",
      ] as const) {
        await system.from(table).delete().in("organization_id", orgIds);
      }
      await system
        .from("cards")
        .delete()
        .eq("batch_id", batchId ?? "");
      await system
        .from("card_batches")
        .delete()
        .eq("id", batchId ?? "");
      await system.from("organizations").delete().in("id", orgIds);
    }
    await system.from("internal_comments").delete().in("author_id", authIds);
    for (const id of authIds) await system.auth.admin.deleteUser(id);
    // audit_logs rows written by the "audit log" test stay (append-only table, by design).
  }, 60_000);

  describe("users and memberships", () => {
    it("creates, finds (email is case-insensitive) and updates users", async () => {
      const found = await sys.users.findById(ownerId);
      expect(found?.name).toBe(`Владелец ${run}`);
      expect((await sys.users.findByEmail(found!.email.toUpperCase()))?.id).toBe(ownerId);
      expect(await sys.users.findById(crypto.randomUUID())).toBeNull();

      const updated = await sys.users.update(ownerId, { phone: "+77005554433", mustChangePassword: true });
      expect(updated.phone).toBe("+77005554433");
      expect(updated.mustChangePassword).toBe(true);
      expect(updated.lastLoginAt).toBeNull();
      await sys.users.update(ownerId, { mustChangePassword: false });

      expect((await sys.users.listByIds([ownerId, adminId])).map((u) => u.id).sort()).toEqual(
        [ownerId, adminId].sort(),
      );
      expect((await sys.users.listPlatformStaff()).some((u) => u.id === adminId)).toBe(true);
      await expectCode(sys.users.update(crypto.randomUUID(), { name: "Никто" }), "NOT_FOUND");
    });

    it("refuses a second user with the same email", async () => {
      const existing = (await sys.users.findById(ownerId))!;
      const other = await createAuthUser("dup");
      await expectCode(
        sys.users.create({ ...existing, id: other.id, email: existing.email.toUpperCase() }),
        "CONFLICT",
      );
      await expect(sys.users.create({ ...existing, id: undefined })).rejects.toThrow(/Auth user id/);
    });

    it("manages memberships and protects the last owner", async () => {
      expect((await sys.memberships.listByUser(ownerId)).map((m) => m.organizationId)).toEqual([orgA.id]);
      await expectCode(
        sys.memberships.create({ userId: ownerId, organizationId: orgA.id, role: "MANAGER" }),
        "CONFLICT",
      );

      await expectCode(sys.memberships.updateRole(ownerId, orgA.id, "MANAGER"), "CONFLICT");
      await expectCode(sys.memberships.delete(ownerId, orgA.id), "CONFLICT");

      await sys.memberships.create({ userId: adminId, organizationId: orgA.id, role: "MANAGER" });
      expect((await sys.memberships.updateRole(adminId, orgA.id, "OWNER")).role).toBe("OWNER");
      await sys.memberships.delete(adminId, orgA.id);
      expect(await sys.memberships.find(adminId, orgA.id)).toBeNull();
      await expectCode(sys.memberships.delete(adminId, orgA.id), "NOT_FOUND");
    });

    it("stores invitations by token hash only", async () => {
      const tokenHash = "a".repeat(63) + run.slice(0, 1).replace(/[^0-9a-f]/, "b");
      const invitation = await sys.invitations.create({
        email: `invited-${run}@example.kz`,
        organizationId: orgA.id,
        role: "MANAGER",
        invitedById: adminId,
        expiresAt: new Date(NOW.getTime() + 7 * 24 * HOUR).toISOString(),
        acceptedAt: null,
        tokenHash,
      });
      expect(invitation).not.toHaveProperty("tokenHash");
      expect((await sys.invitations.findByTokenHash(tokenHash))?.id).toBe(invitation.id);
      const accepted = await sys.invitations.markAccepted(invitation.id, NOW.toISOString());
      expect(accepted.acceptedAt).toBe(NOW.toISOString());
      expect((await sys.invitations.listByOrganization(orgA.id)).length).toBe(1);
      await sys.invitations.delete(invitation.id);
      await expectCode(sys.invitations.delete(invitation.id), "NOT_FOUND");
    });
  });

  describe("organizations, locations, employees, targets", () => {
    it("creates a client with locations and a verified target in one call", async () => {
      expect(orgA.name).toBe(`Тест A ${run}`);
      expect((await sys.locations.list({ organizationId: orgA.id })).length).toBe(1);
      const targets = await sys.targets.list({ organizationId: orgA.id });
      expect(targets).toHaveLength(1);
      expect(targets[0]).toMatchObject({ type: "TWOGIS_REVIEW", isVerified: true, locationId: locationA });
    });

    it("finds organizations by name and updates them", async () => {
      expect((await sys.organizations.list({ search: `Тест A ${run}` })).map((o) => o.id)).toEqual([orgA.id]);
      expect((await sys.organizations.list({ search: "100%_нет" })).length).toBe(0);
      const updated = await sys.organizations.update(orgA.id, { contactName: "Новый контакт" });
      expect(updated.contactName).toBe("Новый контакт");
      expect((await sys.organizations.update(orgA.id, { contactName: null })).contactName).toBeNull();
      expect((await sys.organizations.listByIds([orgA.id, orgB.id])).length).toBe(2);
    });

    it("hides and protects rows of another organization", async () => {
      const employee = await sys.employees.create({
        organizationId: orgB.id,
        locationId: locationB,
        name: "Айгерим",
        position: null,
        isActive: true,
      });
      expect(await sys.employees.findById(employee.id, { organizationId: orgA.id })).toBeNull();
      expect((await sys.employees.findById(employee.id, { organizationId: orgB.id }))?.name).toBe("Айгерим");
      await expectCode(
        sys.employees.update(employee.id, { name: "Взлом" }, { organizationId: orgA.id }),
        "NOT_FOUND",
      );
      await expectCode(sys.employees.delete(employee.id, { organizationId: orgA.id }), "NOT_FOUND");
      expect(await sys.locations.findById(locationB, { organizationId: orgA.id })).toBeNull();
      await sys.employees.delete(employee.id, { organizationId: orgB.id });
    });
  });

  describe("cards", () => {
    it("numbers cards in the batch and rolls back on a code clash", async () => {
      expect(cards).toHaveLength(5);
      const stored = await sys.cards.list({ batchId });
      expect(stored.map((c) => c.number)).toEqual([1, 2, 3, 4, 5]);
      expect(stored.every((c) => c.status === "UNASSIGNED")).toBe(true);

      const before = (await sys.batches.list()).length;
      await expectCode(
        sys.batches.createWithCards(
          { name: `Дубль ${run}`, quantity: 2, cardType: "STICKER", notes: null },
          [cards[0]!.code, generateCardCode()].map((code) => ({
            code,
            organizationId: null,
            locationId: null,
            employeeId: null,
            targetId: null,
            label: "x",
            type: "STICKER" as const,
            status: "UNASSIGNED" as const,
            nfcWritten: false,
            nfcLocked: false,
            activatedAt: null,
          })),
        ),
        "CONFLICT",
      );
      expect((await sys.batches.list()).length).toBe(before);
    });

    it("looks cards up by id, code and batch lists", async () => {
      expect((await sys.cards.findByCode(cards[0]!.code))?.id).toBe(cards[0]!.id);
      expect(await sys.cards.findByCode("ZZZZZZZZ")).toBeNull();
      expect((await sys.cards.findByCodes([cards[1]!.code, "ZZZZZZZZ"])).length).toBe(1);
      expect((await sys.cards.findByIds(cards.map((c) => c.id))).length).toBe(5);
      expect((await sys.cards.list({ batchId, numbers: { from: 2, to: 3 } })).map((c) => c.number)).toEqual([
        2, 3,
      ]);
      expect((await sys.cards.list({ batchId, search: "Карта 4" })).map((c) => c.number)).toEqual([4]);
      expect(
        (await sys.cards.list({ batchId, search: cards[2]!.code.slice(0, 5) })).map((c) => c.number),
      ).toContain(3);
      expect(await sys.cards.count({ batchId, search: "100%" })).toBe(0);
      expect(await sys.cards.count({ batchId })).toBe(5);

      const page = await sys.cards.search({ batchId }, 2);
      expect(page.items.map((c) => c.number)).toEqual([1, 2]);
      expect(page.total).toBe(5);
    });

    it("assigns atomically: a card is handed out only once", async () => {
      const target = (await sys.targets.list({ organizationId: orgA.id }))[0]!;
      const base = {
        organizationId: orgA.id,
        locationId: locationA,
        targetId: target.id,
        activatedAt: NOW.toISOString(),
      };
      const ids = cards.map((c) => c.id);

      expect(await sys.cards.assign({ ...base, cardIds: [ids[0]!, crypto.randomUUID()] })).toEqual({
        ok: false,
        reason: "NOT_FOUND",
      });
      expect(await sys.cards.count({ batchId, statuses: ["ACTIVE"] })).toBe(0);

      const done = await sys.cards.assign({ ...base, cardIds: ids.slice(0, 3) });
      expect(done.ok && done.cards.map((c) => c.status)).toEqual(["ACTIVE", "ACTIVE", "ACTIVE"]);
      expect(await sys.cards.assign({ ...base, cardIds: [ids[0]!] })).toEqual({
        ok: false,
        reason: "NOT_UNASSIGNED",
      });

      expect(await sys.cards.countBy("organizationId", { batchId })).toEqual({ [orgA.id]: 3 });
      expect(await sys.cards.countBy("batchId", { organizationId: orgA.id })).toEqual({ [batchId]: 3 });
      expect((await sys.batches.progress())[batchId]).toEqual({ assigned: 3, written: 0, locked: 0 });
    });

    it("renames a batch and deletes it only while nothing was handed out", async () => {
      const spare = await sys.batches.createWithCards(
        { name: `Лишняя ${run}`, quantity: 2, cardType: "STICKER", notes: null },
        [generateCardCode(), generateCardCode()].map((code) => ({
          code,
          organizationId: null,
          locationId: null,
          employeeId: null,
          targetId: null,
          label: "x",
          type: "STICKER" as const,
          status: "UNASSIGNED" as const,
          nfcWritten: false,
          nfcLocked: false,
          activatedAt: null,
        })),
      );
      const renamed = await sys.batches.update(spare.batch.id, { name: `Новое ${run}`, notes: "заметка" });
      expect(renamed).toMatchObject({ name: `Новое ${run}`, notes: "заметка", quantity: 2 });
      await expectCode(sys.batches.update(crypto.randomUUID(), { name: "x" }), "NOT_FOUND");

      expect(await sys.batches.delete(batchId)).toBe("IN_USE");
      expect(await sys.cards.count({ batchId })).toBe(5);
      expect(await sys.batches.delete(spare.batch.id)).toBe("OK");
      expect(await sys.batches.findById(spare.batch.id)).toBeNull();
      expect(await sys.cards.count({ batchId: spare.batch.id })).toBe(0);
      expect(await sys.batches.delete(spare.batch.id)).toBe("NOT_FOUND");
    });

    it("updates cards one by one and in bulk, and finds idle ones", async () => {
      const [first, second] = cards;
      expect((await sys.cards.update(first!.id, { label: "Касса" })).label).toBe("Касса");
      await expectCode(
        sys.cards.update(first!.id, { label: "Взлом" }, { organizationId: orgB.id }),
        "NOT_FOUND",
      );
      expect((await sys.cards.update(first!.id, {})).label).toBe("Касса");

      const written = await sys.cards.updateMany([first!.id, second!.id], { nfcWritten: true });
      expect(written.every((c) => c.nfcWritten)).toBe(true);
      await expectCode(
        sys.cards.updateMany([first!.id, crypto.randomUUID()], { nfcLocked: true }),
        "NOT_FOUND",
      );
      expect((await sys.cards.findById(first!.id))?.nfcLocked).toBe(false);

      const future = new Date(NOW.getTime() + 24 * HOUR).toISOString();
      const idle = await sys.cards.listIdle({ activatedBefore: future, noTapsSince: today, limit: 100 });
      expect(idle.map((c) => c.id)).toEqual(expect.arrayContaining(cards.slice(0, 3).map((c) => c.id)));
    });
  });

  describe("analytics", () => {
    const event = (n: number, patch: Partial<TapEvent> = {}): TapEvent => ({
      id: crypto.randomUUID(),
      cardId: cards[0]!.id,
      organizationId: orgA.id,
      locationId: locationA,
      employeeId: null,
      occurredAt: new Date(NOW.getTime() - n * 60_000).toISOString(),
      source: "NFC",
      deviceType: "MOBILE",
      os: "IOS",
      isBot: false,
      isDuplicate: false,
      ...patch,
    });

    it("inserts tap events idempotently", async () => {
      const e = event(1);
      expect((await sys.tapEvents.insert(e)).created).toBe(true);
      const again = await sys.tapEvents.insert({ ...e, source: "QR" });
      expect(again.created).toBe(false);
      expect(again.event).toEqual(e);
    });

    it("counts valid taps, bots and duplicates and groups them", async () => {
      await sys.tapEvents.insert(event(2, { source: "QR", os: "ANDROID" }));
      await sys.tapEvents.insert(event(3, { isBot: true }));
      await sys.tapEvents.insert(event(4, { isDuplicate: true }));
      const filter = { organizationId: orgA.id, range };

      expect(await sys.tapEvents.count(filter)).toBe(2);
      expect(await sys.tapEvents.count({ ...filter, kind: "bots" })).toBe(1);
      expect(await sys.tapEvents.count({ ...filter, kind: "duplicates" })).toBe(1);
      expect(await sys.tapEvents.count({ ...filter, kind: "all" })).toBe(4);
      expect(await sys.tapEvents.count({ ...filter, cardIds: [cards[1]!.id] })).toBe(0);
      expect(await sys.tapEvents.count({ organizationId: orgB.id, range })).toBe(0);

      const breakdown = await sys.tapEvents.breakdown(filter);
      expect(breakdown.sources).toEqual({ NFC: 1, QR: 1 });
      expect(breakdown.operatingSystems).toMatchObject({ IOS: 1, ANDROID: 1, WINDOWS: 0 });
      expect(breakdown.deviceTypes).toMatchObject({ MOBILE: 2, DESKTOP: 0 });

      const heat = await sys.tapEvents.heatmap(filter, "Asia/Almaty");
      expect(heat.reduce((sum, cell) => sum + cell.taps, 0)).toBe(2);
      expect(
        heat.every((cell) => cell.weekday >= 1 && cell.weekday <= 7 && cell.hour >= 0 && cell.hour <= 23),
      ).toBe(true);

      const last = await sys.tapEvents.lastTapByCard({ organizationId: orgA.id });
      expect(Object.keys(last)).toEqual([cards[0]!.id]);
      expect(last[cards[0]!.id]).toBe(new Date(NOW.getTime() - 60_000).toISOString());
    });

    it("adds up daily stats atomically, grouped or not", async () => {
      const key = {
        cardId: cards[0]!.id,
        organizationId: orgA.id,
        locationId: locationA,
        employeeId: null,
        date: today,
      };
      await Promise.all([
        sys.dailyStats.increment(key, { taps: 1, uniqueVisitors: 1, nfcTaps: 1, qrTaps: 0 }),
        sys.dailyStats.increment(key, { taps: 2, uniqueVisitors: 1, nfcTaps: 0, qrTaps: 2 }),
      ]);
      await sys.dailyStats.increment(
        { ...key, cardId: cards[1]!.id },
        { taps: 4, uniqueVisitors: 3, nfcTaps: 4, qrTaps: 0 },
      );

      const filter = { organizationId: orgA.id, from: today, to: today };
      expect(await sys.dailyStats.total(filter)).toEqual({
        taps: 7,
        uniqueVisitors: 5,
        nfcTaps: 5,
        qrTaps: 2,
      });
      const byCard = await sys.dailyStats.totalsBy(filter, "cardId");
      expect(byCard.find((g) => g.key === cards[0]!.id)).toMatchObject({ taps: 3, nfcTaps: 1, qrTaps: 2 });
      expect(byCard.reduce((sum, g) => sum + g.taps, 0)).toBe(7);
      expect((await sys.dailyStats.totalsBy(filter, "employeeId")).length).toBe(0);
      expect(await sys.dailyStats.total({ organizationId: orgB.id, from: today, to: today })).toEqual({
        taps: 0,
        uniqueVisitors: 0,
        nfcTaps: 0,
        qrTaps: 0,
      });

      // The card with taps today is no longer idle; the other assigned ones still are.
      const future = new Date(NOW.getTime() + 24 * HOUR).toISOString();
      const idle = (
        await sys.cards.listIdle({ activatedBefore: future, noTapsSince: today, limit: 100 })
      ).map((c) => c.id);
      expect(idle).not.toContain(cards[0]!.id);
      expect(idle).toContain(cards[2]!.id);
    });
  });

  describe("support and audit", () => {
    it("handles tickets and staff comments", async () => {
      const ticket = await sys.tickets.create({
        organizationId: orgA.id,
        authorId: ownerId,
        subject: "Не работает карта",
        body: "Приложил — тишина",
        status: "NEW",
        assigneeId: null,
      });
      expect(ticket.updatedAt).toBeTruthy();
      const updated = await sys.tickets.update(ticket.id, { status: "IN_PROGRESS", assigneeId: adminId });
      expect(updated).toMatchObject({ status: "IN_PROGRESS", assigneeId: adminId });
      expect(updated.updatedAt >= ticket.updatedAt).toBe(true);
      expect(await sys.tickets.findById(ticket.id, { organizationId: orgB.id })).toBeNull();
      expect(
        (await sys.tickets.list({ organizationId: orgA.id, statuses: ["IN_PROGRESS"], limit: 5 })).length,
      ).toBe(1);
      await expectCode(sys.tickets.update(crypto.randomUUID(), { status: "CLOSED" }), "NOT_FOUND");

      for (const body of ["первый", "второй"]) {
        await sys.comments.create({ subjectType: "TICKET", subjectId: ticket.id, authorId: adminId, body });
      }
      expect((await sys.comments.list("TICKET", ticket.id)).map((c) => c.body)).toEqual(["первый", "второй"]);
      expect((await sys.comments.listFor("TICKET", [ticket.id, crypto.randomUUID()])).length).toBe(2);
    });

    // `audit_logs` is append-only, so this test leaves 5 rows behind on every run: opt in with SUPABASE_TEST_AUDIT=1.
    it.skipIf(!process.env.SUPABASE_TEST_AUDIT)(
      "paginates the audit log newest first without overlaps",
      async () => {
        const entry = (n: number) => ({
          actorUserId: null,
          action: "test.step",
          entityType: AUDIT_MARK,
          entityId: String(n),
          organizationId: null,
          before: null,
          after: { n },
        });
        await sys.auditLogs.append(entry(0));
        await sys.auditLogs.appendMany([1, 2, 3, 4].map(entry));
        await sys.auditLogs.appendMany([]);

        const seen: string[] = [];
        let cursor: string | null = null;
        let pages = 0;
        do {
          const page: Awaited<ReturnType<Repositories["auditLogs"]["list"]>> = await sys.auditLogs.list(
            { entityType: AUDIT_MARK, action: "test." },
            { limit: 2, cursor },
          );
          seen.push(...page.items.map((l) => l.id));
          cursor = page.nextCursor;
          pages++;
        } while (cursor);

        expect(pages).toBe(3);
        expect(seen).toHaveLength(5);
        expect(new Set(seen).size).toBe(5);
        expect(
          (await sys.auditLogs.list({ entityType: AUDIT_MARK, action: "nope." }, { limit: 5 })).items,
        ).toEqual([]);
      },
    );

    it("reads and rewrites the platform settings", async () => {
      const settings = await sys.platformSettings.get();
      expect(settings.allowedRedirectDomains).toContain("2gis.kz");
      expect(
        await sys.platformSettings.update({ allowedRedirectDomains: settings.allowedRedirectDomains }),
      ).toEqual(settings);
    });
  });

  describe("as a signed-in client (Row Level Security)", () => {
    it("sees only its own organization", async () => {
      expect((await owner.organizations.list()).map((o) => o.id)).toEqual([orgA.id]);
      expect(await owner.organizations.findById(orgB.id)).toBeNull();
      expect((await owner.cards.list({ batchId })).length).toBe(3);
      expect(await owner.cards.count({ organizationId: orgB.id })).toBe(0);
      expect(await owner.locations.findById(locationB)).toBeNull();
      expect((await owner.dailyStats.total({ from: today, to: today })).taps).toBe(7);
      expect(await owner.tapEvents.count({ range })).toBe(2);
    });

    it("may edit what belongs to it, but not what TapToGo manages", async () => {
      const mine = cards[2]!;
      expect((await owner.cards.update(mine.id, { label: "Стол 3" })).label).toBe("Стол 3");
      await expectCode(owner.cards.update(mine.id, { status: "REVOKED" }), "FORBIDDEN");
      await expectCode(owner.cards.update(mine.id, { nfcLocked: true }), "FORBIDDEN");
      await expectCode(owner.cards.update(cards[4]!.id, { label: "Чужая" }), "NOT_FOUND");
      await expectCode(owner.organizations.update(orgA.id, { status: "SUSPENDED" }), "FORBIDDEN");
      await expectCode(owner.users.update(ownerId, { platformRole: "ADMIN" }), "FORBIDDEN");
    });

    it("cannot create batches, delete them or change settings", async () => {
      await expect(owner.batches.delete(batchId)).rejects.toMatchObject({ code: "FORBIDDEN" });
      await expectCode(
        owner.batches.createWithCards({ name: "Взлом", quantity: 1, cardType: "NFC_CARD", notes: null }, [
          {
            code: generateCardCode(),
            organizationId: null,
            locationId: null,
            employeeId: null,
            targetId: null,
            label: "x",
            type: "NFC_CARD",
            status: "UNASSIGNED",
            nfcWritten: false,
            nfcLocked: false,
            activatedAt: null,
          },
        ]),
        "FORBIDDEN",
      );
      await expectCode(
        owner.platformSettings.update({ allowedRedirectDomains: ["evil.example"] }),
        "FORBIDDEN",
      );
    });
  });
});
