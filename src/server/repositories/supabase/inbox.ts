import "server-only";

import { internalCommentSchema, supportTicketSchema } from "@/features/support/schemas";
import { notFoundError } from "@/server/i18n";

import type { InternalCommentRepository, SupportTicketRepository } from "../inbox";
import { chunk, fromRow, fromRows, ok, one, readAll, rows, toRow, type DbGetter } from "./support";

export function supabaseSupportTicketRepository(db: DbGetter): SupportTicketRepository {
  return {
    async findById(id, scope) {
      const c = await db();
      let query = c.from("support_tickets").select("*").eq("id", id);
      if (scope) query = query.eq("organization_id", scope.organizationId);
      const data = ok(await query.maybeSingle());
      return data ? fromRow(supportTicketSchema, data) : null;
    },
    async list({ organizationId, statuses, limit }) {
      const c = await db();
      let query = c.from("support_tickets").select("*");
      if (organizationId) query = query.eq("organization_id", organizationId);
      if (statuses) query = query.in("status", statuses);
      const data = rows(await query.order("created_at", { ascending: false }).order("id").limit(limit));
      return fromRows(supportTicketSchema, data);
    },
    async create(input) {
      const c = await db();
      const data = one(await c.from("support_tickets").insert(toRow(input)).select().single());
      return fromRow(supportTicketSchema, data);
    },
    async update(id, patch) {
      const c = await db();
      const values = toRow(patch);
      // `updated_at` is maintained by the touch trigger.
      const data = Object.keys(values).length
        ? ok(await c.from("support_tickets").update(values).eq("id", id).select().maybeSingle())
        : ok(await c.from("support_tickets").select("*").eq("id", id).maybeSingle());
      if (!data) throw notFoundError("SupportTicket");
      return fromRow(supportTicketSchema, data);
    },
  };
}

export function supabaseInternalCommentRepository(db: DbGetter): InternalCommentRepository {
  return {
    async list(subjectType, subjectId) {
      const c = await db();
      const data = await readAll((from, to) =>
        c
          .from("internal_comments")
          .select("*")
          .eq("subject_type", subjectType)
          .eq("subject_id", subjectId)
          .order("created_at")
          .order("id")
          .range(from, to),
      );
      return fromRows(internalCommentSchema, data);
    },
    async listFor(subjectType, subjectIds) {
      const c = await db();
      const parts = await Promise.all(
        chunk(subjectIds).map((part) =>
          readAll((from, to) =>
            c
              .from("internal_comments")
              .select("*")
              .eq("subject_type", subjectType)
              .in("subject_id", part)
              .order("created_at")
              .order("id")
              .range(from, to),
          ),
        ),
      );
      return fromRows(internalCommentSchema, parts.flat()).sort((a, b) =>
        a.createdAt.localeCompare(b.createdAt),
      );
    },
    async create(input) {
      const c = await db();
      const data = one(await c.from("internal_comments").insert(toRow(input)).select().single());
      return fromRow(internalCommentSchema, data);
    },
  };
}
