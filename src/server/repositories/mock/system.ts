import type {
  AuditLogRepository,
  NotificationSettingRepository,
  PlatformSettingsRepository,
} from "../system";
import { applyPatch, clone, cloneOrNull, type MockContext } from "./context";

export function mockAuditLogRepository({ db, clock, newId }: MockContext): AuditLogRepository {
  return {
    async append(entry) {
      const log = { ...clone(entry), id: newId(), createdAt: clock().toISOString() };
      db.auditLogs.push(log);
      return clone(log);
    },
    async appendMany(entries) {
      const createdAt = clock().toISOString();
      db.auditLogs.push(...entries.map((entry) => ({ ...clone(entry), id: newId(), createdAt })));
    },
    async list(filter, { limit, cursor }) {
      const matching = db.auditLogs
        .filter(
          (l) =>
            (!filter.organizationId || l.organizationId === filter.organizationId) &&
            (!filter.actorUserId || l.actorUserId === filter.actorUserId) &&
            (!filter.entityType || l.entityType === filter.entityType) &&
            (!filter.entityId || l.entityId === filter.entityId) &&
            (!filter.action || l.action.startsWith(filter.action)) &&
            (!filter.range || (l.createdAt >= filter.range.from && l.createdAt < filter.range.to)),
        )
        .sort((a, b) => b.createdAt.localeCompare(a.createdAt) || b.id.localeCompare(a.id));

      // The cursor is the id of the last row of the previous page.
      const start = cursor ? matching.findIndex((l) => l.id === cursor) + 1 : 0;
      const items = matching.slice(start, start + limit);
      const hasMore = start + limit < matching.length;
      return { items: clone(items), nextCursor: hasMore ? (items.at(-1)?.id ?? null) : null };
    },
  };
}

export function mockNotificationSettingRepository({ db }: MockContext): NotificationSettingRepository {
  return {
    async find(userId, organizationId) {
      return cloneOrNull(
        db.notificationSettings.find((s) => s.userId === userId && s.organizationId === organizationId),
      );
    },
    async listEnabled(kind) {
      return clone(db.notificationSettings.filter((s) => s[kind]));
    },
    async upsert(setting) {
      const index = db.notificationSettings.findIndex(
        (s) => s.userId === setting.userId && s.organizationId === setting.organizationId,
      );
      const row = clone(setting);
      if (index === -1) db.notificationSettings.push(row);
      else db.notificationSettings[index] = row;
      return clone(row);
    },
  };
}

export function mockPlatformSettingsRepository({ db }: MockContext): PlatformSettingsRepository {
  return {
    async get() {
      return clone(db.platformSettings);
    },
    async update(patch) {
      return clone(applyPatch(db.platformSettings, patch));
    },
  };
}
