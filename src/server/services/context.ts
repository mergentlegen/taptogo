import type { OrgRole } from "@/features/team/schemas";
import type { JsonValue } from "@/lib/schemas";
import { serviceError } from "@/server/i18n";
import { orgPermissions, type OrgPermission } from "@/server/permissions";
import type { StatGroup, StatTotals } from "@/server/repositories";

/**
 * Who is acting and in which organization. Built only from the verified
 * session (see orgContextFrom) — never from request input — so a forged id in
 * a form can at most point to a row that the scoped lookups then don't find.
 */
export type OrgContext = {
  userId: string;
  organizationId: string;
  timeZone: string;
  role: OrgRole | null;
};

export function orgContextFrom(access: {
  session: { user: { id: string } };
  organization: { id: string; timezone: string };
  role: OrgRole | null;
}): OrgContext {
  return {
    userId: access.session.user.id,
    organizationId: access.organization.id,
    timeZone: access.organization.timezone,
    role: access.role,
  };
}

/**
 * Second line of defense inside cabinet services, on top of the action-level
 * check: a write reached from any other path is still refused. Staff viewing a
 * cabinet have no role (null), so every write is refused for them too.
 */
export function assertOrgPermission(ctx: OrgContext, permission: OrgPermission): void {
  const allowed: readonly OrgRole[] = orgPermissions[permission];
  if (!ctx.role || !allowed.includes(ctx.role)) throw serviceError("FORBIDDEN", "forbidden");
}

export const ZERO_TOTALS: StatTotals = { taps: 0, uniqueVisitors: 0, nfcTaps: 0, qrTaps: 0 };

/** Grouped stats as a lookup by key. */
export function byKey(groups: readonly StatGroup[]): Map<string, StatTotals> {
  return new Map(groups.map(({ key, ...totals }) => [key, totals]));
}

/** Only the fields that changed, for compact before/after audit entries. */
export function auditDiff<T extends Record<string, unknown>>(
  before: T,
  after: T,
  keys: readonly (keyof T & string)[],
): { before: JsonValue; after: JsonValue } | null {
  const changedBefore: Record<string, JsonValue> = {};
  const changedAfter: Record<string, JsonValue> = {};
  for (const key of keys) {
    if (JSON.stringify(before[key]) === JSON.stringify(after[key])) continue;
    changedBefore[key] = (before[key] ?? null) as JsonValue;
    changedAfter[key] = (after[key] ?? null) as JsonValue;
  }
  return Object.keys(changedAfter).length ? { before: changedBefore, after: changedAfter } : null;
}
