import type { Lead, LeadStatus } from "@/features/leads/schemas";
import type {
  CommentSubject,
  InternalComment,
  SupportTicket,
  TicketStatus,
} from "@/features/support/schemas";
import { serviceError } from "@/server/i18n";
import type { Repositories } from "@/server/repositories";
import type { AuditService } from "@/server/services/audit-service";

import { assertAdmin, type AdminContext } from "./context";

export type CommentView = InternalComment & { author: string };
export type TicketRow = SupportTicket & { organization: string; author: string; assignee: string | null };
export type LeadRow = Lead & { assignee: string | null };

/** Tickets and leads pile up forever; inbox pages show the newest ones. */
export const INBOX_SHOWN = 100;

/** Support tickets and landing-page leads, with internal (staff-only) comments. */
export class AdminInboxService {
  constructor(
    private readonly repositories: Repositories,
    private readonly audit: AuditService,
  ) {}

  private async userNames(ids: (string | null)[]): Promise<Map<string, string>> {
    const users = await this.repositories.users.listByIds(ids.filter((id): id is string => id !== null));
    return new Map(users.map((u) => [u.id, u.name]));
  }

  async staffOptions(): Promise<{ id: string; name: string }[]> {
    const staff = await this.repositories.users.listPlatformStaff();
    return staff.filter((u) => u.status === "ACTIVE").map((u) => ({ id: u.id, name: u.name }));
  }

  async tickets(statuses?: TicketStatus[]): Promise<TicketRow[]> {
    return this.withNames(await this.repositories.tickets.list({ statuses, limit: INBOX_SHOWN }));
  }

  async ticket(id: string): Promise<{ ticket: TicketRow; comments: CommentView[] } | null> {
    const found = await this.repositories.tickets.findById(id);
    if (!found) return null;
    const [[ticket], comments] = await Promise.all([this.withNames([found]), this.comments("TICKET", id)]);
    return ticket ? { ticket, comments } : null;
  }

  private async withNames(tickets: SupportTicket[]): Promise<TicketRow[]> {
    const [organizations, names] = await Promise.all([
      this.repositories.organizations.listByIds([...new Set(tickets.map((t) => t.organizationId))]),
      this.userNames(tickets.flatMap((t) => [t.authorId, t.assigneeId])),
    ]);
    const orgName = new Map(organizations.map((o) => [o.id, o.name]));
    return tickets.map((t) => ({
      ...t,
      organization: orgName.get(t.organizationId) ?? "—",
      author: names.get(t.authorId) ?? "—",
      assignee: t.assigneeId ? (names.get(t.assigneeId) ?? null) : null,
    }));
  }

  async leads(statuses?: LeadStatus[]): Promise<LeadRow[]> {
    const leads = await this.repositories.leads.list({ statuses, limit: INBOX_SHOWN });
    const names = await this.userNames(leads.map((l) => l.assigneeId));
    return leads.map((l) => ({ ...l, assignee: l.assigneeId ? (names.get(l.assigneeId) ?? null) : null }));
  }

  async comments(subjectType: CommentSubject, subjectId: string): Promise<CommentView[]> {
    return (await this.commentsFor(subjectType, [subjectId])).get(subjectId) ?? [];
  }

  /** Comments of a whole list page in one query (no query per ticket or lead). */
  async commentsFor(subjectType: CommentSubject, subjectIds: string[]): Promise<Map<string, CommentView[]>> {
    const comments = subjectIds.length
      ? await this.repositories.comments.listFor(subjectType, subjectIds)
      : [];
    const names = await this.userNames(comments.map((c) => c.authorId));
    const bySubject = new Map<string, CommentView[]>();
    for (const c of comments) {
      bySubject.set(c.subjectId, [
        ...(bySubject.get(c.subjectId) ?? []),
        { ...c, author: names.get(c.authorId) ?? "—" },
      ]);
    }
    return bySubject;
  }

  async updateTicket(
    ctx: AdminContext,
    id: string,
    patch: { status?: TicketStatus; assigneeId?: string | null },
  ) {
    assertAdmin(ctx, "admin.inbox");
    const before = await this.repositories.tickets.findById(id);
    if (!before) throw serviceError("NOT_FOUND", "ticketNotFound");
    await this.assertAssignee(patch.assigneeId);
    const after = await this.repositories.tickets.update(id, patch);
    await this.audit.record({
      actorUserId: ctx.userId,
      action: "ticket.update",
      entityType: "ticket",
      entityId: id,
      organizationId: before.organizationId,
      before: { status: before.status, assigneeId: before.assigneeId },
      after: { status: after.status, assigneeId: after.assigneeId },
    });
  }

  async updateLead(
    ctx: AdminContext,
    id: string,
    patch: { status?: LeadStatus; assigneeId?: string | null },
  ) {
    assertAdmin(ctx, "admin.inbox");
    const before = await this.repositories.leads.findById(id);
    if (!before) throw serviceError("NOT_FOUND", "leadNotFound");
    await this.assertAssignee(patch.assigneeId);
    const after = await this.repositories.leads.update(id, patch);
    await this.audit.record({
      actorUserId: ctx.userId,
      action: "lead.update",
      entityType: "lead",
      entityId: id,
      before: { status: before.status, assigneeId: before.assigneeId },
      after: { status: after.status, assigneeId: after.assigneeId },
    });
  }

  async addComment(ctx: AdminContext, subjectType: CommentSubject, subjectId: string, body: string) {
    assertAdmin(ctx, "admin.inbox");
    const exists =
      subjectType === "TICKET"
        ? await this.repositories.tickets.findById(subjectId)
        : await this.repositories.leads.findById(subjectId);
    if (!exists)
      throw serviceError("NOT_FOUND", subjectType === "TICKET" ? "ticketNotFound" : "leadNotFound");
    const comment = await this.repositories.comments.create({
      subjectType,
      subjectId,
      authorId: ctx.userId,
      body,
    });
    await this.audit.record({
      actorUserId: ctx.userId,
      action: "comment.create",
      entityType: subjectType === "TICKET" ? "ticket" : "lead",
      entityId: subjectId,
      organizationId: "organizationId" in exists ? exists.organizationId : null,
    });
    return comment;
  }

  /** Only active platform staff can be assignees. */
  private async assertAssignee(assigneeId: string | null | undefined) {
    if (!assigneeId) return;
    const user = await this.repositories.users.findById(assigneeId);
    if (!user?.platformRole || user.status !== "ACTIVE") throw serviceError("VALIDATION", "staffNotFound");
  }
}
