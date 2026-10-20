import type { AuditLog } from "@/features/audit/schemas";
import { addDays, DEFAULT_TIME_ZONE, zonedTimeToUtc, type IsoDate } from "@/lib/dates";
import type { AuditLogFilter, Repositories } from "@/server/repositories";

export type AuditRow = AuditLog & { actor: string | null; organization: string | null };

export type AuditQuery = {
  actorUserId?: string;
  organizationId?: string;
  action?: string;
  entityType?: string;
  from?: IsoDate;
  to?: IsoDate;
  cursor?: string | null;
};

const PAGE_SIZE = 50;

/** Read side of the append-only audit log. */
export class AdminAuditService {
  constructor(private readonly repositories: Repositories) {}

  async list(query: AuditQuery): Promise<{ items: AuditRow[]; nextCursor: string | null }> {
    const filter: AuditLogFilter = {
      actorUserId: query.actorUserId,
      organizationId: query.organizationId,
      action: query.action,
      entityType: query.entityType,
      range:
        query.from || query.to
          ? {
              from: query.from
                ? zonedTimeToUtc(query.from, { hour: 0 }, DEFAULT_TIME_ZONE).toISOString()
                : "0000",
              to: query.to
                ? zonedTimeToUtc(addDays(query.to, 1), { hour: 0 }, DEFAULT_TIME_ZONE).toISOString()
                : "9999",
            }
          : undefined,
    };
    const page = await this.repositories.auditLogs.list(filter, { limit: PAGE_SIZE, cursor: query.cursor });
    const [users, organizations] = await Promise.all([
      this.repositories.users.listByIds(
        page.items.map((i) => i.actorUserId).filter((id): id is string => id !== null),
      ),
      this.repositories.organizations.list(),
    ]);
    return {
      nextCursor: page.nextCursor,
      items: page.items.map((item) => ({
        ...item,
        actor: item.actorUserId ? (users.find((u) => u.id === item.actorUserId)?.name ?? null) : null,
        organization: item.organizationId
          ? (organizations.find((o) => o.id === item.organizationId)?.name ?? null)
          : null,
      })),
    };
  }

  /** Values for the filter selects. */
  async filterOptions() {
    const [staff, organizations] = await Promise.all([
      this.repositories.users.listPlatformStaff(),
      this.repositories.organizations.list(),
    ]);
    return {
      actors: staff.map((u) => ({ id: u.id, name: u.name })),
      organizations: organizations.map((o) => ({ id: o.id, name: o.name })),
    };
  }
}
