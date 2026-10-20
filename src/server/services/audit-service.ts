import type { JsonValue } from "@/lib/schemas";
import type { AuditLogRepository } from "@/server/repositories";

export type AuditEntry = {
  actorUserId: string | null;
  action: string;
  entityType: string;
  entityId?: string | null;
  organizationId?: string | null;
  before?: JsonValue | null;
  after?: JsonValue | null;
};

/**
 * The one way to write the audit trail. Services call it for every change so
 * individual actions never assemble log rows by hand.
 */
export class AuditService {
  constructor(private readonly logs: AuditLogRepository) {}

  async record(entry: AuditEntry): Promise<void> {
    await this.logs.append(toRow(entry));
  }

  /** Bulk operations write their trail in one insert instead of one per item. */
  async recordMany(entries: readonly AuditEntry[]): Promise<void> {
    if (entries.length) await this.logs.appendMany(entries.map(toRow));
  }
}

function toRow(entry: AuditEntry) {
  return {
    actorUserId: entry.actorUserId,
    action: entry.action,
    entityType: entry.entityType,
    entityId: entry.entityId ?? null,
    organizationId: entry.organizationId ?? null,
    before: entry.before ?? null,
    after: entry.after ?? null,
  };
}
