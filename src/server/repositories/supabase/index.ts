import "server-only";

import type { Repositories } from "../index";
import { supabaseDailyCardStatRepository, supabaseTapEventRepository } from "./analytics";
import { supabaseCardBatchRepository, supabaseCardRepository } from "./cards";
import { supabaseInternalCommentRepository, supabaseSupportTicketRepository } from "./inbox";
import {
  supabaseEmployeeRepository,
  supabaseLocationRepository,
  supabaseOrganizationRepository,
  supabaseRatingSnapshotRepository,
  supabaseRedirectTargetRepository,
} from "./organizations";
import type { DbGetter } from "./support";
import { supabaseAuditLogRepository, supabasePlatformSettingsRepository } from "./system";
import { supabaseInvitationRepository, supabaseMembershipRepository, supabaseUserRepository } from "./users";

export type { DbGetter } from "./support";

/**
 * Every repository on top of one Supabase client getter. The container calls it
 * twice: with the user's client (RLS applies) and with the system client (RLS bypassed).
 */
export function createSupabaseRepositories(db: DbGetter): Repositories {
  return {
    users: supabaseUserRepository(db),
    memberships: supabaseMembershipRepository(db),
    invitations: supabaseInvitationRepository(db),
    organizations: supabaseOrganizationRepository(db),
    locations: supabaseLocationRepository(db),
    employees: supabaseEmployeeRepository(db),
    targets: supabaseRedirectTargetRepository(db),
    ratingSnapshots: supabaseRatingSnapshotRepository(db),
    batches: supabaseCardBatchRepository(db),
    cards: supabaseCardRepository(db),
    tapEvents: supabaseTapEventRepository(db),
    dailyStats: supabaseDailyCardStatRepository(db),
    tickets: supabaseSupportTicketRepository(db),
    comments: supabaseInternalCommentRepository(db),
    auditLogs: supabaseAuditLogRepository(db),
    platformSettings: supabasePlatformSettingsRepository(db),
  };
}
