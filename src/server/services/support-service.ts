import type { SupportTicket } from "@/features/support/schemas";
import type { Repositories } from "@/server/repositories";
import { forOrganization } from "@/server/repositories/tenant";
import type { AuditService } from "@/server/services/audit-service";

import { assertOrgPermission, type OrgContext } from "./context";

/** The cabinet shows recent tickets; older ones stay in the admin panel. */
const TICKETS_SHOWN = 100;

export class SupportService {
  constructor(
    private readonly repositories: Repositories,
    private readonly audit: AuditService,
  ) {}

  /** Tickets of the organization; internal staff comments are never included. */
  list(ctx: OrgContext): Promise<SupportTicket[]> {
    return forOrganization(this.repositories, ctx.organizationId).tickets.list(TICKETS_SHOWN);
  }

  async create(ctx: OrgContext, input: { subject: string; body: string }): Promise<SupportTicket> {
    assertOrgPermission(ctx, "org.support");
    const ticket = await forOrganization(this.repositories, ctx.organizationId).tickets.create({
      authorId: ctx.userId,
      subject: input.subject,
      body: input.body,
      status: "NEW",
      assigneeId: null,
    });
    await this.audit.record({
      actorUserId: ctx.userId,
      action: "ticket.create",
      entityType: "ticket",
      entityId: ticket.id,
      organizationId: ctx.organizationId,
      after: { subject: ticket.subject },
    });
    return ticket;
  }
}
