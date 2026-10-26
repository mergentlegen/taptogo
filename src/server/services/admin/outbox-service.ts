import { serviceError } from "@/server/i18n";
import type { Outbox, QueuedMessage } from "@/server/providers/email/types";
import type { AuditService } from "@/server/services/audit-service";

import { assertAdmin, type AdminContext } from "./context";

/** Messages that the administrator sends by hand (password resets, invitations). */
export class AdminOutboxService {
  constructor(
    private readonly outbox: Outbox,
    private readonly audit: AuditService,
  ) {}

  async list(ctx: AdminContext): Promise<QueuedMessage[]> {
    assertAdmin(ctx, "admin.manage");
    return this.outbox.list();
  }

  /**
   * The audit entry records that a message was sent, not its content: the body
   * holds a one-time link, and the recipient's address is personal data.
   */
  async markSent(ctx: AdminContext, id: string): Promise<void> {
    assertAdmin(ctx, "admin.manage");
    const message = (await this.outbox.list()).find((m) => m.id === id);
    if (!message) throw serviceError("NOT_FOUND", "messageNotFound");
    if (message.sentAt) return;
    await this.outbox.markSent(id);
    await this.audit.record({
      actorUserId: ctx.userId,
      action: "outbox.mark_sent",
      entityType: "email",
      entityId: id,
      after: { tag: message.tag },
    });
  }
}
