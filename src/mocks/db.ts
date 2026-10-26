import type { DailyCardStat, TapEvent } from "@/features/analytics/schemas";
import type { AuditLog } from "@/features/audit/schemas";
import type { CardBatch } from "@/features/batches/schemas";
import type { Card } from "@/features/cards/schemas";
import type { Employee } from "@/features/employees/schemas";
import type { Location, RatingSnapshot } from "@/features/locations/schemas";
import type { Organization } from "@/features/organizations/schemas";
import type { PlatformSettings } from "@/features/platform/schemas";
import type { InternalComment, SupportTicket } from "@/features/support/schemas";
import type { RedirectTarget } from "@/features/targets/schemas";
import type { Invitation, Membership } from "@/features/team/schemas";
import type { User } from "@/features/users/schemas";
import { processSingleton, resetProcessSingleton } from "@/server/singleton";

import { createSeedData } from "./seed";

export type StoredInvitation = Invitation & { tokenHash: string };

/** In-memory tables. Shape mirrors docs/supabase/schema.sql (camelCase here). */
export type MockDatabase = {
  users: User[];
  memberships: Membership[];
  invitations: StoredInvitation[];
  organizations: Organization[];
  locations: Location[];
  employees: Employee[];
  targets: RedirectTarget[];
  ratingSnapshots: RatingSnapshot[];
  batches: CardBatch[];
  cards: Card[];
  tapEvents: TapEvent[];
  dailyStats: DailyCardStat[];
  tickets: SupportTicket[];
  comments: InternalComment[];
  auditLogs: AuditLog[];
  platformSettings: PlatformSettings;
};

const KEY = "mock-database";

/** Seeded once per server process; changes live until the process restarts. */
export function getMockDatabase(): MockDatabase {
  return processSingleton(KEY, () => createSeedData());
}

export function resetMockDatabase(): void {
  resetProcessSingleton(KEY);
}
