import { beforeAll, describe, expect, it } from "vitest";
import type { z } from "zod";

import { dailyCardStatSchema, tapEventSchema } from "@/features/analytics/schemas";
import { auditLogSchema } from "@/features/audit/schemas";
import { cardBatchSchema } from "@/features/batches/schemas";
import { cardSchema } from "@/features/cards/schemas";
import { employeeSchema } from "@/features/employees/schemas";
import { leadSchema } from "@/features/leads/schemas";
import { locationSchema, ratingSnapshotSchema } from "@/features/locations/schemas";
import { notificationSettingSchema } from "@/features/notifications/schemas";
import { organizationSchema } from "@/features/organizations/schemas";
import { platformSettingsSchema } from "@/features/platform/schemas";
import { paymentSchema, subscriptionSchema } from "@/features/subscriptions/schemas";
import { resolveSubscriptionStatus } from "@/features/subscriptions/status";
import { internalCommentSchema, supportTicketSchema } from "@/features/support/schemas";
import { redirectTargetSchema } from "@/features/targets/schemas";
import { checkTargetUrl } from "@/features/targets/url-policy";
import { invitationSchema, membershipSchema } from "@/features/team/schemas";
import { userSchema } from "@/features/users/schemas";
import { localHourAndWeekday, toLocalDate } from "@/lib/dates";

import type { MockDatabase } from "./db";
import { createSeedData, DEMO_INVITATION_TOKEN, demoAccounts, HISTORY_DAYS, sha256 } from "./seed";

const NOW = new Date("2026-10-17T10:00:00Z"); // 15:00 in Almaty
const TZ = "Asia/Almaty";

let db: MockDatabase;
beforeAll(() => {
  db = createSeedData({ now: NOW });
});

function expectAllValid<T extends z.ZodType>(schema: T, rows: unknown[]) {
  for (const row of rows) {
    const result = schema.safeParse(row);
    if (!result.success) throw new Error(`${JSON.stringify(row)}\n${result.error.message}`);
  }
}

describe("seed determinism", () => {
  it("produces identical data for the same seed and date", () => {
    expect(createSeedData({ now: NOW })).toEqual(db);
  });

  it("produces different data for another seed", () => {
    const other = createSeedData({ now: NOW, seed: 1 });
    expect(other.cards.map((c) => c.code)).not.toEqual(db.cards.map((c) => c.code));
  });
});

describe("seed validity", () => {
  it("matches every entity schema", () => {
    expectAllValid(userSchema, db.users);
    expectAllValid(membershipSchema, db.memberships);
    expectAllValid(invitationSchema, db.invitations);
    expectAllValid(organizationSchema, db.organizations);
    expectAllValid(locationSchema, db.locations);
    expectAllValid(employeeSchema, db.employees);
    expectAllValid(redirectTargetSchema, db.targets);
    expectAllValid(ratingSnapshotSchema, db.ratingSnapshots);
    expectAllValid(cardBatchSchema, db.batches);
    expectAllValid(cardSchema, db.cards);
    expectAllValid(tapEventSchema, db.tapEvents);
    expectAllValid(dailyCardStatSchema, db.dailyStats);
    expectAllValid(subscriptionSchema, db.subscriptions);
    expectAllValid(paymentSchema, db.payments);
    expectAllValid(supportTicketSchema, db.tickets);
    expectAllValid(internalCommentSchema, db.comments);
    expectAllValid(leadSchema, db.leads);
    expectAllValid(auditLogSchema, db.auditLogs);
    expectAllValid(notificationSettingSchema, db.notificationSettings);
    expectAllValid(platformSettingsSchema, [db.platformSettings]);
  });

  it("has unique ids and card codes", () => {
    const ids = Object.values(db).flatMap((rows: unknown) =>
      Array.isArray(rows) ? rows.map((row: { id?: string }) => row.id).filter(Boolean) : [],
    );
    expect(new Set(ids).size).toBe(ids.length);
    expect(new Set(db.cards.map((c) => c.code)).size).toBe(db.cards.length);
  });

  it("only points cards at allowed, verified targets of their own organization", () => {
    const targets = new Map(db.targets.map((t) => [t.id, t]));
    for (const card of db.cards.filter((c) => c.targetId)) {
      const target = targets.get(card.targetId ?? "");
      expect(target?.organizationId).toBe(card.organizationId);
      expect(target?.isVerified).toBe(true);
    }
    for (const target of db.targets) {
      expect(checkTargetUrl(target.url, db.platformSettings.allowedRedirectDomains).ok).toBe(true);
    }
  });

  it("keeps references inside one organization", () => {
    const locations = new Map(db.locations.map((l) => [l.id, l]));
    const employees = new Map(db.employees.map((e) => [e.id, e]));
    for (const card of db.cards) {
      if (card.locationId) expect(locations.get(card.locationId)?.organizationId).toBe(card.organizationId);
      if (card.employeeId) expect(employees.get(card.employeeId)?.organizationId).toBe(card.organizationId);
    }
    const cards = new Map(db.cards.map((c) => [c.id, c]));
    for (const event of db.tapEvents) {
      expect(cards.get(event.cardId)?.organizationId).toBe(event.organizationId);
    }
  });

  // Same invariants as the CHECK constraints in docs/supabase/schema.sql.
  it("satisfies the database constraints of the future schema", () => {
    for (const card of db.cards) {
      expect(card.status === "UNASSIGNED", card.code).toBe(card.organizationId === null);
    }
    for (const row of db.dailyStats) expect(row.nfcTaps + row.qrTaps).toBe(row.taps);
    for (const employee of db.employees) {
      if (!employee.locationId) continue;
      const location = db.locations.find((l) => l.id === employee.locationId);
      expect(location?.organizationId).toBe(employee.organizationId);
    }
    const targets = new Map(db.targets.map((t) => [t.id, t]));
    for (const card of db.cards) {
      if (card.targetId) expect(targets.get(card.targetId)?.organizationId).toBe(card.organizationId);
    }
  });

  it("stores the invitation token only as a hash", () => {
    expect(db.invitations.some((i) => i.tokenHash === sha256(DEMO_INVITATION_TOKEN))).toBe(true);
    expect(JSON.stringify(db)).not.toContain(DEMO_INVITATION_TOKEN);
  });
});

describe("seed content (spec section 4)", () => {
  it("has three organizations with 2, 1 and 3 locations", () => {
    const perOrg = db.organizations.map((o) => db.locations.filter((l) => l.organizationId === o.id).length);
    expect(perOrg).toEqual([2, 1, 3]);
  });

  it("has 25–40 cards, 8–10 employees and two batches, one partly unassigned", () => {
    expect(db.cards.length).toBeGreaterThanOrEqual(25);
    expect(db.cards.length).toBeLessThanOrEqual(40);
    expect(db.employees.length).toBeGreaterThanOrEqual(8);
    expect(db.employees.length).toBeLessThanOrEqual(10);
    expect(db.batches).toHaveLength(2);

    const unassignedByBatch = db.batches.map(
      (b) => db.cards.filter((c) => c.batchId === b.id && c.status === "UNASSIGNED").length,
    );
    expect(unassignedByBatch).toEqual([0, 5]);
    expect(new Set(db.cards.map((c) => c.status))).toEqual(
      new Set(["ACTIVE", "PAUSED", "LOST", "REVOKED", "UNASSIGNED"]),
    );
    expect(db.batches.reduce((sum, b) => sum + b.quantity, 0)).toBe(db.cards.length);
  });

  it("has a demo account for every role and one user in two organizations", () => {
    for (const account of demoAccounts) {
      const user = db.users.find((u) => u.email === account.email);
      expect(user, account.email).toBeDefined();
      const roles = [
        user?.platformRole,
        ...db.memberships.filter((m) => m.userId === user?.id).map((m) => m.role),
      ];
      expect(roles).toContain(account.role);
    }
    const orgsPerUser = new Map<string, number>();
    for (const m of db.memberships) orgsPerUser.set(m.userId, (orgsPerUser.get(m.userId) ?? 0) + 1);
    expect(Math.max(...orgsPerUser.values())).toBeGreaterThan(1);
  });

  it("covers active, grace and expired subscriptions", () => {
    const today = toLocalDate(NOW, TZ);
    const statuses = db.subscriptions.map((s) =>
      resolveSubscriptionStatus(s, today, db.platformSettings.graceDays),
    );
    expect(statuses.sort()).toEqual(["ACTIVE", "EXPIRED", "GRACE"]);
  });
});

describe("seed taps", () => {
  it("spans 90 days and never lies in the future", () => {
    const first = db.tapEvents[0]?.occurredAt ?? "";
    const last = db.tapEvents.at(-1)?.occurredAt ?? "";
    expect(last <= NOW.toISOString()).toBe(true);
    const days = (NOW.getTime() - new Date(first).getTime()) / 86_400_000;
    expect(days).toBeLessThanOrEqual(HISTORY_DAYS);
    expect(days).toBeGreaterThan(HISTORY_DAYS - 20);
  });

  it("marks 3–5% of events as bots and as duplicates", () => {
    const share = (flag: "isBot" | "isDuplicate") =>
      db.tapEvents.filter((e) => e[flag]).length / db.tapEvents.length;
    expect(share("isBot")).toBeGreaterThan(0.025);
    expect(share("isBot")).toBeLessThan(0.05);
    expect(share("isDuplicate")).toBeGreaterThan(0.025);
    expect(share("isDuplicate")).toBeLessThan(0.05);
  });

  it("rolls valid events up into daily stats exactly", () => {
    const counted = new Map<string, number>();
    for (const e of db.tapEvents) {
      if (e.isBot || e.isDuplicate) continue;
      const key = `${e.cardId}|${toLocalDate(e.occurredAt, TZ)}`;
      counted.set(key, (counted.get(key) ?? 0) + 1);
    }
    expect(db.dailyStats).toHaveLength(counted.size);
    for (const stat of db.dailyStats) {
      expect(stat.taps).toBe(counted.get(`${stat.cardId}|${stat.date}`));
      expect(stat.nfcTaps + stat.qrTaps).toBe(stat.taps);
      expect(stat.uniqueVisitors).toBeLessThanOrEqual(stat.taps);
    }
  });

  it("is busier on weekends and at lunch/evening peaks", () => {
    const valid = db.tapEvents.filter((e) => !e.isBot && !e.isDuplicate);
    const byWeekday = new Map<number, number>();
    const byHour = new Map<number, number>();
    for (const e of valid) {
      const { weekday, hour } = localHourAndWeekday(e.occurredAt, TZ);
      byWeekday.set(weekday, (byWeekday.get(weekday) ?? 0) + 1);
      byHour.set(hour, (byHour.get(hour) ?? 0) + 1);
    }
    const weekend = ((byWeekday.get(6) ?? 0) + (byWeekday.get(7) ?? 0)) / 2;
    const midweek = ((byWeekday.get(2) ?? 0) + (byWeekday.get(3) ?? 0)) / 2;
    expect(weekend).toBeGreaterThan(midweek * 1.2);

    const peak = [12, 13, 14, 18, 19, 20, 21].reduce((sum, h) => sum + (byHour.get(h) ?? 0), 0);
    expect(peak / valid.length).toBeGreaterThan(0.55);
    expect(byHour.get(3) ?? 0).toBe(0);
  });

  it("stops taps of lost and revoked cards after the status change", () => {
    for (const card of db.cards.filter((c) => c.status === "UNASSIGNED")) {
      expect(db.tapEvents.some((e) => e.cardId === card.id)).toBe(false);
    }
    const lost = db.cards.find((c) => c.status === "LOST");
    const lastLostTap = db.tapEvents.filter((e) => e.cardId === lost?.id).at(-1);
    expect(lastLostTap && lastLostTap.occurredAt < NOW.toISOString()).toBe(true);
    expect(new Date(lastLostTap?.occurredAt ?? 0).getTime()).toBeLessThan(NOW.getTime() - 8 * 86_400_000);
  });
});

describe("seed ratings", () => {
  it("has daily snapshots for linked locations only, with growing review counts", () => {
    for (const location of db.locations) {
      const snapshots = db.ratingSnapshots.filter((s) => s.locationId === location.id);
      if (!location.twogisFirmId) {
        expect(snapshots).toHaveLength(0);
        continue;
      }
      expect(snapshots.length).toBe(HISTORY_DAYS);
      const counts = snapshots.map((s) => s.reviewCount ?? 0);
      expect(counts).toEqual([...counts].sort((a, b) => a - b));
      const first = snapshots[0];
      const last = snapshots.at(-1);
      expect((last?.rating ?? 0) - (first?.rating ?? 0)).toBeGreaterThan(0);
      expect((last?.reviewCount ?? 0) - (first?.reviewCount ?? 0)).toBeGreaterThan(10);
    }
  });
});
