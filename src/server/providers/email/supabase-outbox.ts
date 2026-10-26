import "server-only";

import { ok, one, rows } from "@/server/repositories/supabase/support";
import type { Db } from "@/server/supabase/clients";

import type { EmailMessage, Outbox, QueuedMessage } from "./types";

/** At most this many messages are shown on the manual sending page. */
const LIST_LIMIT = 200;

/**
 * Manual sending, persisted: messages wait in `outbox_messages` until an
 * administrator marks them as sent. Uses the system client — messages are
 * queued by flows without a session (password reset requests) — so callers
 * (AdminOutboxService) check the administrator's permission themselves.
 */
export class SupabaseOutbox implements Outbox {
  readonly name = "manual";

  constructor(private readonly db: () => Db) {}

  async send(message: EmailMessage): Promise<{ id: string }> {
    const { id } = one(
      await this.db()
        .from("outbox_messages")
        .insert({ to_address: message.to, subject: message.subject, body: message.text, tag: message.tag })
        .select("id")
        .single(),
    );
    return { id };
  }

  async list(): Promise<QueuedMessage[]> {
    const data = rows(
      await this.db()
        .from("outbox_messages")
        .select("*")
        .order("queued_at", { ascending: false })
        .limit(LIST_LIMIT),
    );
    return data.map((row) => ({
      id: row.id,
      to: row.to_address,
      subject: row.subject,
      text: row.body,
      tag: row.tag as QueuedMessage["tag"],
      queuedAt: new Date(row.queued_at).toISOString(),
      sentAt: row.sent_at ? new Date(row.sent_at).toISOString() : null,
    }));
  }

  async markSent(id: string): Promise<boolean> {
    const db = this.db();
    // Only the first confirmation sets the time; repeating it keeps the original.
    const [existing] = rows(await db.from("outbox_messages").select("*").eq("id", id).limit(1));
    if (!existing) return false;
    if (!existing.sent_at) {
      ok(
        await db
          .from("outbox_messages")
          .update({ sent_at: new Date().toISOString() })
          .eq("id", id)
          .is("sent_at", null),
      );
    }
    return true;
  }
}
