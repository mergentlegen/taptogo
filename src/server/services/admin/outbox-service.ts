import { serviceError } from "@/server/i18n";
import type { ManualOutbox } from "@/server/providers/email/manual";
import type { QueuedMessage } from "@/server/providers/email/types";
import type { AuditService } from "@/server/services/audit-service";

import { assertAdmin, type AdminContext } from "./context";

/** Messages that the administrator sends by hand (password resets, invitations). */
export class AdminOutboxService {
  constructor(
    private readonly outbox: ManualOutbox,
    private readonly audit: AuditService,
  ) {}

  list(ctx: AdminContext): QueuedMessage[] {
    assertAdmin(ctx, "admin.manage");
    return this.outbox.list();
  }

  /**
   * The audit entry records that a message was sent, not its content: the body
   * holds a one-time link, and the recipient's address is personal data.
   */
  async markSent(ctx: AdminContext, id: string): Promise<void> {
    assertAdmin(ctx, "admin.manage");
    const message = this.outbox.list().find((m) => m.id === id);
    if (!message) throw serviceError("NOT_FOUND", "messageNotFound");
    if (message.sentAt) return;
    this.outbox.markSent(id);
    await this.audit.record({
      actorUserId: ctx.userId,
      action: "outbox.mark_sent",
      entityType: "email",
      entityId: id,
      after: { tag: message.tag },
    });
  }
}
