import type { AuditLog } from "@/features/audit/schemas";
import type { PlatformSettings } from "@/features/platform/schemas";

import type { DateRange, NewEntity, Page } from "./common";

export type AuditLogFilter = {
  organizationId?: string;
  actorUserId?: string;
  entityType?: string;
  entityId?: string;
  /** Prefix match, e.g. "card." */
  action?: string;
  range?: DateRange;
};

/** Append-only by design: there is no update or delete. */
export interface AuditLogRepository {
  append(entry: NewEntity<AuditLog>): Promise<AuditLog>;
  /** One multi-row insert, e.g. assigning 500 cards. */
  appendMany(entries: readonly NewEntity<AuditLog>[]): Promise<void>;
  /** Newest first, cursor-paginated. */
  list(filter: AuditLogFilter, page: { limit: number; cursor?: string | null }): Promise<Page<AuditLog>>;
}

export interface PlatformSettingsRepository {
  get(): Promise<PlatformSettings>;
  update(patch: Partial<PlatformSettings>): Promise<PlatformSettings>;
}
