import type { AuditLog } from "@/features/audit/schemas";
import { cardStatuses, type Card } from "@/features/cards/schemas";
import type { Location } from "@/features/locations/schemas";
import { parseTwogisFirmUrl, twogisProfileUrl, twogisReviewsUrl } from "@/features/locations/twogis-url";
import type { Organization, OrganizationStatus } from "@/features/organizations/schemas";
import type { Payment, Plan, Subscription, SubscriptionStatus } from "@/features/subscriptions/schemas";
import { resolveSubscriptionStatus } from "@/features/subscriptions/status";
import type { SupportTicket } from "@/features/support/schemas";
import type { RedirectTarget } from "@/features/targets/schemas";
import type { OrgRole } from "@/features/team/schemas";
import { addDays, DEFAULT_TIME_ZONE, toLocalDate } from "@/lib/dates";
import type { AuthService, Impersonation } from "@/server/auth/types";
import { serviceError } from "@/server/i18n";
import type { FirmPreview, ReviewsProvider } from "@/server/providers/reviews/types";
import type { Repositories } from "@/server/repositories";
import type { AuditService } from "@/server/services/audit-service";
import { auditDiff, byKey } from "@/server/services/context";
import type { TeamService } from "@/server/services/team-service";

import { assertAdmin, type AdminContext } from "./context";

const HELD_STATUSES = cardStatuses.filter((s) => s !== "REVOKED");
/** The client page shows recent history; the full trail is in billing and the audit log. */
const DETAIL_HISTORY = 50;

export const IMPERSONATION_TTL_MS = 30 * 60 * 1000;

export type ClientRow = {
  id: string;
  name: string;
  city: string | null;
  plan: Plan | null;
  paidUntil: string | null;
  subscriptionStatus: SubscriptionStatus | null;
  cards: number;
  taps30: number;
  status: OrganizationStatus;
};

export type ClientDetail = {
  organization: Organization;
  subscription: (Subscription & { effectiveStatus: SubscriptionStatus }) | null;
  locations: (Location & { rating: number | null; reviewCount: number | null })[];
  cards: (Card & { locationName: string | null; taps30: number })[];
  targets: (RedirectTarget & { locationName: string | null })[];
  members: { userId: string; name: string; email: string; role: OrgRole; lastLoginAt: string | null }[];
  invitations: { id: string; email: string; role: OrgRole; expiresAt: string }[];
  payments: Payment[];
  tickets: SupportTicket[];
  audit: AuditLog[];
  taps30: number;
};

type NewLocation = { name: string; address: string; twogisUrl: string | null };

export class AdminClientService {
  constructor(
    private readonly repositories: Repositories,
    private readonly reviews: ReviewsProvider,
    private readonly team: TeamService,
    private readonly auth: AuthService,
    private readonly audit: AuditService,
    private readonly clock: () => Date,
  ) {}

  private today() {
    return toLocalDate(this.clock(), DEFAULT_TIME_ZONE);
  }

  async list(): Promise<ClientRow[]> {
    const repos = this.repositories;
    const today = this.today();
    // Counts and sums come aggregated from storage; lookups below are maps, not nested scans.
    const [organizations, subscriptions, settings, cardCounts, locations, stats] = await Promise.all([
      repos.organizations.list(),
      repos.subscriptions.list(),
      repos.platformSettings.get(),
      repos.cards.countBy("organizationId", { statuses: HELD_STATUSES }),
      repos.locations.list(),
      repos.dailyStats.totalsBy({ from: addDays(today, -29), to: today }, "organizationId"),
    ]);
    const taps = byKey(stats);
    const subscriptionOf = new Map(subscriptions.map((s) => [s.organizationId, s]));
    const firstAddressOf = new Map<string, string>();
    for (const l of locations)
      if (!firstAddressOf.has(l.organizationId)) firstAddressOf.set(l.organizationId, l.address);

    return organizations.map((org) => {
      const subscription = subscriptionOf.get(org.id);
      const firstAddress = firstAddressOf.get(org.id);
      return {
        id: org.id,
        name: org.name,
        city: firstAddress?.split(",")[0]?.trim() ?? null,
        plan: subscription?.plan ?? null,
        paidUntil: subscription?.paidUntil ?? null,
        subscriptionStatus: subscription
          ? resolveSubscriptionStatus(subscription, today, settings.graceDays)
          : null,
        cards: cardCounts[org.id] ?? 0,
        taps30: taps.get(org.id)?.taps ?? 0,
        status: org.status,
      };
    });
  }

  /** Clients that can receive cards or targets, each with its locations (for pickers). */
  async assignmentOptions(): Promise<
    { id: string; name: string; locations: { id: string; name: string }[] }[]
  > {
    const [organizations, locations] = await Promise.all([
      this.repositories.organizations.list({ statuses: ["ACTIVE", "SUSPENDED"] }),
      this.repositories.locations.list(),
    ]);
    const byOrganization = new Map<string, { id: string; name: string }[]>();
    for (const l of locations) {
      byOrganization.set(l.organizationId, [
        ...(byOrganization.get(l.organizationId) ?? []),
        { id: l.id, name: l.name },
      ]);
    }
    return organizations.map((o) => ({ id: o.id, name: o.name, locations: byOrganization.get(o.id) ?? [] }));
  }

  async detail(organizationId: string): Promise<ClientDetail | null> {
    const repos = this.repositories;
    const organization = await repos.organizations.findById(organizationId);
    if (!organization) return null;
    const today = this.today();
    const scope = { organizationId };

    const [
      subscription,
      settings,
      locations,
      cards,
      targets,
      memberships,
      invitations,
      payments,
      tickets,
      audit,
      total,
      byCard,
    ] = await Promise.all([
      repos.subscriptions.findByOrganization(organizationId),
      repos.platformSettings.get(),
      repos.locations.list(scope),
      repos.cards.list(scope),
      repos.targets.list(scope),
      repos.memberships.listByOrganization(organizationId),
      repos.invitations.listByOrganization(organizationId),
      repos.payments.list({ organizationId, limit: DETAIL_HISTORY }),
      repos.tickets.list({ organizationId, limit: DETAIL_HISTORY }),
      repos.auditLogs.list({ organizationId }, { limit: DETAIL_HISTORY }),
      repos.dailyStats.total({ organizationId, from: addDays(today, -29), to: today }),
      repos.dailyStats.totalsBy({ organizationId, from: addDays(today, -29), to: today }, "cardId"),
    ]);
    const [users, snapshots] = await Promise.all([
      repos.users.listByIds(memberships.map((m) => m.userId)),
      repos.ratingSnapshots.latestForLocations(locations.map((l) => l.id)),
    ]);
    const locationName = new Map(locations.map((l) => [l.id, l.name]));
    const tapsByCard = byKey(byCard);
    const now = this.clock().toISOString();

    return {
      organization,
      subscription: subscription
        ? {
            ...subscription,
            effectiveStatus: resolveSubscriptionStatus(subscription, today, settings.graceDays),
          }
        : null,
      locations: locations.map((l) => {
        const snap = snapshots.find((s) => s.locationId === l.id);
        return { ...l, rating: snap?.rating ?? null, reviewCount: snap?.reviewCount ?? null };
      }),
      cards: cards.map((c) => ({
        ...c,
        locationName: c.locationId ? (locationName.get(c.locationId) ?? null) : null,
        taps30: tapsByCard.get(c.id)?.taps ?? 0,
      })),
      targets: targets.map((t) => ({
        ...t,
        locationName: t.locationId ? (locationName.get(t.locationId) ?? null) : null,
      })),
      members: memberships.flatMap((m) => {
        const u = users.find((x) => x.id === m.userId);
        return u
          ? [{ userId: u.id, name: u.name, email: u.email, role: m.role, lastLoginAt: u.lastLoginAt }]
          : [];
      }),
      invitations: invitations
        .filter((i) => !i.acceptedAt && i.expiresAt > now)
        .map(({ id, email, role, expiresAt }) => ({ id, email, role, expiresAt })),
      payments,
      tickets,
      audit: audit.items,
      taps30: total.taps,
    };
  }

  /** Preview for the "link to 2GIS" field; never stores anything. */
  resolveTwogis(url: string): Promise<FirmPreview | null> {
    return this.reviews.resolveFirm(url);
  }

  async create(
    ctx: AdminContext,
    input: {
      organization: Omit<Organization, "id" | "timezone" | "status" | "createdAt">;
      locations: NewLocation[];
      owner: { email: string };
      subscription: { plan: Plan; paidUntil: string; trial: boolean };
    },
  ): Promise<Organization> {
    assertAdmin(ctx, "admin.manage");
    // Validate every 2GIS link before writing anything.
    const parsed = input.locations.map((location) => {
      const firm = location.twogisUrl ? parseTwogisFirmUrl(location.twogisUrl) : null;
      if (location.twogisUrl && !firm) throw serviceError("VALIDATION", "twogisLinkInvalid");
      return { location, firm };
    });

    const repos = this.repositories;
    const settings = await repos.platformSettings.get();
    // One transaction: a failure leaves no half-created client to clean up or duplicate on retry.
    const { organization, locations } = await repos.organizations.createClient({
      organization: { ...input.organization, timezone: DEFAULT_TIME_ZONE, status: "ACTIVE" },
      locations: parsed.map(({ location, firm }) => ({
        location: {
          name: location.name,
          address: location.address,
          twogisFirmId: firm?.firmId ?? null,
          twogisProfileUrl: firm ? twogisProfileUrl(firm) : null,
          isActive: true,
        },
        reviewsTargetUrl: firm ? twogisReviewsUrl(firm) : null,
      })),
      subscription: {
        plan: input.subscription.plan,
        cardLimit: settings.plans.find((p) => p.plan === input.subscription.plan)?.cardLimit ?? 10,
        paidUntil: input.subscription.paidUntil,
        status: input.subscription.trial ? "TRIAL" : "ACTIVE",
      },
    });
    await this.audit.recordMany([
      {
        actorUserId: ctx.userId,
        action: "organization.create",
        entityType: "organization",
        entityId: organization.id,
        organizationId: organization.id,
        after: { name: organization.name, plan: input.subscription.plan, locations: locations.length },
      },
      ...locations.map((location) => ({
        actorUserId: ctx.userId,
        action: "location.create",
        entityType: "location",
        entityId: location.id,
        organizationId: organization.id,
        after: { name: location.name, twogisFirmId: location.twogisFirmId },
      })),
    ]);
    // The owner's invitation goes into the manual sending queue (/admin/outbox).
    await this.team.createInvitation(
      { organizationId: organization.id, invitedById: ctx.userId },
      { email: input.owner.email, role: "OWNER" },
    );
    return organization;
  }

  /**
   * Gives a client member a temporary password (for when mail is not used). The
   * password is returned once, to the administrator's screen; it is not logged,
   * and the member's sessions end so the new password is the only way in.
   */
  async issueTemporaryPassword(ctx: AdminContext, organizationId: string, userId: string): Promise<string> {
    assertAdmin(ctx, "admin.manage");
    if (userId === ctx.userId) throw serviceError("CONFLICT", "cannotChangeSelf");
    if (!(await this.repositories.memberships.find(userId, organizationId))) {
      throw serviceError("NOT_FOUND", "memberNotFound");
    }
    const password = await this.auth.issueTemporaryPassword(userId);
    if (!password) throw serviceError("NOT_FOUND", "memberNotFound");
    await this.audit.record({
      actorUserId: ctx.userId,
      action: "user.temporary_password",
      entityType: "user",
      entityId: userId,
      organizationId,
    });
    return password;
  }

  async invite(ctx: AdminContext, organizationId: string, input: { email: string; role: OrgRole }) {
    assertAdmin(ctx, "admin.manage");
    const organization = await this.repositories.organizations.findById(organizationId);
    if (!organization || organization.status === "ARCHIVED")
      throw serviceError("NOT_FOUND", "organizationNotFound");
    return this.team.createInvitation({ organizationId, invitedById: ctx.userId }, input);
  }

  async addLocation(ctx: AdminContext, organizationId: string, location: NewLocation): Promise<Location> {
    assertAdmin(ctx, "admin.manage");
    if (!(await this.repositories.organizations.findById(organizationId))) {
      throw serviceError("NOT_FOUND", "organizationNotFound");
    }
    if (location.twogisUrl && !parseTwogisFirmUrl(location.twogisUrl)) {
      throw serviceError("VALIDATION", "twogisLinkInvalid");
    }
    return this.createLocation(ctx, organizationId, location);
  }

  /** Creates the location and, when linked to 2GIS, its verified "reviews" target. */
  private async createLocation(
    ctx: AdminContext,
    organizationId: string,
    input: NewLocation,
  ): Promise<Location> {
    const parsed = input.twogisUrl ? parseTwogisFirmUrl(input.twogisUrl) : null;
    const location = await this.repositories.locations.create({
      organizationId,
      name: input.name,
      address: input.address,
      twogisFirmId: parsed?.firmId ?? null,
      twogisProfileUrl: parsed ? twogisProfileUrl(parsed) : null,
      isActive: true,
    });
    if (parsed) {
      await this.repositories.targets.create({
        organizationId,
        locationId: location.id,
        type: "TWOGIS_REVIEW",
        url: twogisReviewsUrl(parsed),
        isVerified: true,
      });
    }
    await this.audit.record({
      actorUserId: ctx.userId,
      action: "location.create",
      entityType: "location",
      entityId: location.id,
      organizationId,
      after: { name: location.name, twogisFirmId: location.twogisFirmId },
    });
    return location;
  }

  async update(
    ctx: AdminContext,
    organizationId: string,
    input: Pick<Organization, "name" | "legalName" | "bin" | "contactName" | "contactPhone" | "contactEmail">,
  ): Promise<Organization> {
    assertAdmin(ctx, "admin.manage");
    const before = await this.repositories.organizations.findById(organizationId);
    if (!before) throw serviceError("NOT_FOUND", "organizationNotFound");
    const after = await this.repositories.organizations.update(organizationId, input);
    const diff = auditDiff(before, after, [
      "name",
      "legalName",
      "bin",
      "contactName",
      "contactPhone",
      "contactEmail",
    ]);
    if (diff) {
      await this.audit.record({
        actorUserId: ctx.userId,
        action: "organization.update",
        entityType: "organization",
        entityId: organizationId,
        organizationId,
        ...diff,
      });
    }
    return after;
  }

  /** Suspend, archive or reactivate. Archived clients disappear from the cabinet and their cards stop. */
  async setStatus(ctx: AdminContext, organizationId: string, status: OrganizationStatus): Promise<void> {
    assertAdmin(ctx, "admin.manage");
    const before = await this.repositories.organizations.findById(organizationId);
    if (!before) throw serviceError("NOT_FOUND", "organizationNotFound");
    if (before.status === status) return;
    await this.repositories.organizations.update(organizationId, { status });
    await this.audit.record({
      actorUserId: ctx.userId,
      action: "organization.status_change",
      entityType: "organization",
      entityId: organizationId,
      organizationId,
      before: { status: before.status },
      after: { status },
    });
  }

  async startImpersonation(ctx: AdminContext, organizationId: string): Promise<Impersonation> {
    assertAdmin(ctx, "admin.impersonate");
    const organization = await this.repositories.organizations.findById(organizationId);
    if (!organization || organization.status === "ARCHIVED")
      throw serviceError("NOT_FOUND", "organizationNotFound");
    const impersonation = await this.auth.startImpersonation(
      ctx.sessionId,
      organizationId,
      IMPERSONATION_TTL_MS,
    );
    await this.audit.record({
      actorUserId: ctx.userId,
      action: "impersonation.start",
      entityType: "organization",
      entityId: organizationId,
      organizationId,
      after: { expiresAt: impersonation.expiresAt },
    });
    return impersonation;
  }

  async stopImpersonation(ctx: AdminContext): Promise<Impersonation | null> {
    const previous = await this.auth.stopImpersonation(ctx.sessionId);
    if (previous) {
      await this.audit.record({
        actorUserId: ctx.userId,
        action: "impersonation.stop",
        entityType: "organization",
        entityId: previous.organizationId,
        organizationId: previous.organizationId,
        after: { startedAt: previous.startedAt },
      });
    }
    return previous;
  }
}
