import "server-only";

import { auditLogSchema } from "@/features/audit/schemas";
import { platformSettingsSchema } from "@/features/platform/schemas";
import { serviceError } from "@/server/i18n";

import type { AuditLogRepository, PlatformSettingsRepository } from "../system";
import { escapeLike, fromRow, fromRows, ok, one, quote, rows, toRow, type DbGetter } from "./support";

/**
 * Cursor = base64url of [created_at, id] of the last row of the page, with
 * `created_at` exactly as Postgres returned it (microseconds included), so the
 * keyset comparison is precise.
 */
function encodeCursor(createdAt: string, id: string): string {
  return Buffer.from(JSON.stringify([createdAt, id])).toString("base64url");
}

function decodeCursor(cursor: string): { createdAt: string; id: string } | null {
  try {
    const [createdAt, id] = JSON.parse(Buffer.from(cursor, "base64url").toString("utf8")) as unknown[];
    return typeof createdAt === "string" && typeof id === "string" ? { createdAt, id } : null;
  } catch {
    return null;
  }
}

export function supabaseAuditLogRepository(db: DbGetter): AuditLogRepository {
  return {
    async append(entry) {
      const c = await db();
      return fromRow(auditLogSchema, one(await c.from("audit_logs").insert(toRow(entry)).select().single()));
    },
    async appendMany(entries) {
      if (entries.length === 0) return;
      const c = await db();
      // One multi-row insert, one statement: all entries or none.
      const { error } = await c.from("audit_logs").insert(entries.map((entry) => toRow(entry)));
      if (error) throw new Error(`Supabase: ${error.code ?? "?"} ${error.message}`);
    },
    async list(filter, { limit, cursor }) {
      const c = await db();
      let query = c.from("audit_logs").select("*");
      if (filter.organizationId) query = query.eq("organization_id", filter.organizationId);
      if (filter.actorUserId) query = query.eq("actor_user_id", filter.actorUserId);
      if (filter.entityType) query = query.eq("entity_type", filter.entityType);
      if (filter.entityId) query = query.eq("entity_id", filter.entityId);
      if (filter.action) query = query.like("action", `${escapeLike(filter.action)}%`);
      if (filter.range) query = query.gte("created_at", filter.range.from).lt("created_at", filter.range.to);

      const after = cursor ? decodeCursor(cursor) : null;
      if (after) {
        const at = quote(after.createdAt);
        query = query.or(`created_at.lt.${at},and(created_at.eq.${at},id.lt.${quote(after.id)})`);
      }

      // One extra row tells whether there is a next page.
      const data = rows(
        await query
          .order("created_at", { ascending: false })
          .order("id", { ascending: false })
          .limit(limit + 1),
      );
      const page = data.slice(0, limit);
      const last = page.at(-1);
      return {
        items: fromRows(auditLogSchema, page),
        nextCursor: data.length > limit && last ? encodeCursor(last.created_at, last.id) : null,
      };
    },
  };
}

export function supabasePlatformSettingsRepository(db: DbGetter): PlatformSettingsRepository {
  return {
    async get() {
      const c = await db();
      return fromRow(
        platformSettingsSchema,
        one(await c.from("platform_settings").select("*").eq("id", true).single()),
      );
    },
    async update(patch) {
      const c = await db();
      const values = toRow(patch);
      if (Object.keys(values).length === 0) return this.get();
      const data = ok(await c.from("platform_settings").update(values).eq("id", true).select().maybeSingle());
      // The settings row always exists, so "no row updated" means Row Level Security refused it.
      if (!data) throw serviceError("FORBIDDEN", "forbidden");
      return fromRow(platformSettingsSchema, data);
    },
  };
}
