import type { Repositories } from "../index";
import { mockDailyCardStatRepository, mockTapEventRepository } from "./analytics";
import { mockPaymentRepository, mockSubscriptionRepository } from "./billing";
import { mockCardBatchRepository, mockCardRepository } from "./cards";
import type { MockContext } from "./context";
import { mockInternalCommentRepository, mockLeadRepository, mockSupportTicketRepository } from "./inbox";
import {
  mockEmployeeRepository,
  mockLocationRepository,
  mockOrganizationRepository,
  mockRatingSnapshotRepository,
  mockRedirectTargetRepository,
} from "./organizations";
import { mockAuditLogRepository, mockPlatformSettingsRepository } from "./system";
import { mockInvitationRepository, mockMembershipRepository, mockUserRepository } from "./users";

export type { MockContext } from "./context";

export function createMockRepositories(context: MockContext): Repositories {
  return {
    users: mockUserRepository(context),
    memberships: mockMembershipRepository(context),
    invitations: mockInvitationRepository(context),
    organizations: mockOrganizationRepository(context),
    locations: mockLocationRepository(context),
    employees: mockEmployeeRepository(context),
    targets: mockRedirectTargetRepository(context),
    ratingSnapshots: mockRatingSnapshotRepository(context),
    batches: mockCardBatchRepository(context),
    cards: mockCardRepository(context),
    tapEvents: mockTapEventRepository(context),
    dailyStats: mockDailyCardStatRepository(context),
    subscriptions: mockSubscriptionRepository(context),
    payments: mockPaymentRepository(context),
    tickets: mockSupportTicketRepository(context),
    leads: mockLeadRepository(context),
    comments: mockInternalCommentRepository(context),
    auditLogs: mockAuditLogRepository(context),
    platformSettings: mockPlatformSettingsRepository(context),
  };
}
