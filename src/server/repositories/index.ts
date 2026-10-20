import type { DailyCardStatRepository, TapEventRepository } from "./analytics";
import type { PaymentRepository, SubscriptionRepository } from "./billing";
import type { CardBatchRepository, CardRepository } from "./cards";
import type { InternalCommentRepository, LeadRepository, SupportTicketRepository } from "./inbox";
import type {
  EmployeeRepository,
  LocationRepository,
  OrganizationRepository,
  RatingSnapshotRepository,
  RedirectTargetRepository,
} from "./organizations";
import type { AuditLogRepository, NotificationSettingRepository, PlatformSettingsRepository } from "./system";
import type { InvitationRepository, MembershipRepository, UserRepository } from "./users";

/** Every data access interface. Implementations: ./mock (now), ./supabase (later). */
export type Repositories = {
  users: UserRepository;
  memberships: MembershipRepository;
  invitations: InvitationRepository;
  organizations: OrganizationRepository;
  locations: LocationRepository;
  employees: EmployeeRepository;
  targets: RedirectTargetRepository;
  ratingSnapshots: RatingSnapshotRepository;
  batches: CardBatchRepository;
  cards: CardRepository;
  tapEvents: TapEventRepository;
  dailyStats: DailyCardStatRepository;
  subscriptions: SubscriptionRepository;
  payments: PaymentRepository;
  tickets: SupportTicketRepository;
  leads: LeadRepository;
  comments: InternalCommentRepository;
  auditLogs: AuditLogRepository;
  notificationSettings: NotificationSettingRepository;
  platformSettings: PlatformSettingsRepository;
};

export type * from "./analytics";
export type * from "./billing";
export type * from "./cards";
export type * from "./common";
export type * from "./inbox";
export type * from "./organizations";
export type * from "./system";
export type * from "./users";
