import type { Employee } from "@/features/employees/schemas";
import type { Organization } from "@/features/organizations/schemas";
import type { SupportTicket } from "@/features/support/schemas";
import type { Invitation, OrgRole } from "@/features/team/schemas";

import type { DailyStatDelta, StatDimension, StatFilter, TapFilter } from "./analytics";
import type { CardFilter, CardPatch } from "./cards";
import type { DateRange, NewEntity } from "./common";
import type { Repositories } from "./index";
import type { EmployeePatch } from "./organizations";

type Unscoped<T> = Omit<T, "organizationId">;

/**
 * The repositories as one organization sees them. Client-cabinet services
 * work only through this view (an architecture test enforces it): every read
 * and write is narrowed to `organizationId` by construction, so a forgotten
 * filter cannot leak another client's data — not even on mocks, before RLS
 * exists.
 *
 * It sits on top of `Repositories`, so Supabase needs no extra work here.
 */
export function forOrganization(repos: Repositories, organizationId: string) {
  const scope = { organizationId };
  const ownLocationIds = async (ids: readonly string[]) => {
    const own = new Set((await repos.locations.list(scope)).map((l) => l.id));
    return ids.filter((id) => own.has(id));
  };

  return {
    organizationId,

    organization: {
      get: () => repos.organizations.findById(organizationId),
      update: (
        patch: Partial<
          Pick<Organization, "name" | "legalName" | "bin" | "contactName" | "contactPhone" | "contactEmail">
        >,
      ) => repos.organizations.update(organizationId, patch),
    },
    subscription: () => repos.subscriptions.findByOrganization(organizationId),
    platformSettings: () => repos.platformSettings.get(),

    cards: {
      findById: (id: string) => repos.cards.findById(id, scope),
      list: (filter: Unscoped<CardFilter> = {}) => repos.cards.list({ ...filter, organizationId }),
      count: (filter: Unscoped<CardFilter> = {}) => repos.cards.count({ ...filter, organizationId }),
      update: (
        id: string,
        patch: Pick<CardPatch, "label" | "locationId" | "employeeId" | "targetId" | "status">,
      ) => repos.cards.update(id, patch, scope),
    },
    locations: {
      findById: (id: string) => repos.locations.findById(id, scope),
      list: (filter: { isActive?: boolean } = {}) => repos.locations.list({ ...filter, organizationId }),
    },
    employees: {
      findById: (id: string) => repos.employees.findById(id, scope),
      list: (filter: { locationId?: string; isActive?: boolean } = {}) =>
        repos.employees.list({ ...filter, organizationId }),
      create: (input: Unscoped<NewEntity<Employee>>) => repos.employees.create({ ...input, organizationId }),
      update: (id: string, patch: EmployeePatch) => repos.employees.update(id, patch, scope),
      delete: (id: string) => repos.employees.delete(id, scope),
    },
    targets: {
      findById: (id: string) => repos.targets.findById(id, scope),
      list: (filter: { isVerified?: boolean } = {}) => repos.targets.list({ ...filter, organizationId }),
    },
    ratingSnapshots: {
      /** Foreign location ids are dropped, not trusted. */
      list: async (filter: { locationIds: readonly string[]; range?: DateRange }) =>
        repos.ratingSnapshots.list({ ...filter, locationIds: await ownLocationIds(filter.locationIds) }),
    },

    dailyStats: {
      total: (filter: Unscoped<StatFilter>): Promise<DailyStatDelta> =>
        repos.dailyStats.total({ ...filter, organizationId }),
      totalsBy: (filter: Unscoped<StatFilter>, dimension: Exclude<StatDimension, "organizationId">) =>
        repos.dailyStats.totalsBy({ ...filter, organizationId }, dimension),
    },
    tapEvents: {
      heatmap: (filter: Unscoped<TapFilter> & { range: DateRange }, timeZone: string) =>
        repos.tapEvents.heatmap({ ...filter, organizationId }, timeZone),
      breakdown: (filter: Unscoped<TapFilter> & { range: DateRange }) =>
        repos.tapEvents.breakdown({ ...filter, organizationId }),
      lastTapByCard: (filter: Unscoped<TapFilter> = {}) =>
        repos.tapEvents.lastTapByCard({ ...filter, organizationId }),
    },

    tickets: {
      list: (limit: number) => repos.tickets.list({ organizationId, limit }),
      create: (input: Unscoped<NewEntity<SupportTicket, "updatedAt">>) =>
        repos.tickets.create({ ...input, organizationId }),
    },

    members: {
      list: () => repos.memberships.listByOrganization(organizationId),
      find: (userId: string) => repos.memberships.find(userId, organizationId),
      updateRole: (userId: string, role: OrgRole) =>
        repos.memberships.updateRole(userId, organizationId, role),
      remove: (userId: string) => repos.memberships.delete(userId, organizationId),
      /** Profiles of this organization's members only. */
      users: async () => {
        const memberships = await repos.memberships.listByOrganization(organizationId);
        return repos.users.listByIds(memberships.map((m) => m.userId));
      },
      /** Whether this email already belongs to a member (without revealing other accounts). */
      hasEmail: async (email: string) => {
        const user = await repos.users.findByEmail(email);
        return user !== null && (await repos.memberships.find(user.id, organizationId)) !== null;
      },
    },
    invitations: {
      list: () => repos.invitations.listByOrganization(organizationId),
      findById: async (id: string) => {
        const invitation = await repos.invitations.findById(id);
        return invitation?.organizationId === organizationId ? invitation : null;
      },
      create: (input: Unscoped<NewEntity<Invitation>> & { tokenHash: string }) =>
        repos.invitations.create({ ...input, organizationId }),
      delete: async (id: string) => {
        const invitation = await repos.invitations.findById(id);
        if (invitation?.organizationId === organizationId) await repos.invitations.delete(id);
      },
    },
  };
}

export type TenantRepositories = ReturnType<typeof forOrganization>;
