import type { InternalCommentRepository, SupportTicketRepository } from "../inbox";
import {
  applyPatch,
  clone,
  cloneOrNull,
  inScope,
  newestFirst,
  requireRow,
  type MockContext,
} from "./context";

export function mockSupportTicketRepository({ db, clock, newId }: MockContext): SupportTicketRepository {
  return {
    async findById(id, scope) {
      return cloneOrNull(db.tickets.find((t) => t.id === id && inScope(t, scope)));
    },
    async list(filter) {
      return clone(
        newestFirst(
          db.tickets.filter(
            (t) =>
              (!filter.organizationId || t.organizationId === filter.organizationId) &&
              (!filter.statuses || filter.statuses.includes(t.status)),
          ),
        ).slice(0, filter.limit),
      );
    },
    async create(input) {
      const now = clock().toISOString();
      const ticket = { ...clone(input), id: newId(), createdAt: now, updatedAt: now };
      db.tickets.push(ticket);
      return clone(ticket);
    },
    async update(id, patch) {
      const ticket = requireRow(
        db.tickets.find((t) => t.id === id),
        "SupportTicket",
      );
      applyPatch(ticket, patch);
      ticket.updatedAt = clock().toISOString();
      return clone(ticket);
    },
  };
}

export function mockInternalCommentRepository({ db, clock, newId }: MockContext): InternalCommentRepository {
  return {
    async list(subjectType, subjectId) {
      return clone(
        db.comments
          .filter((c) => c.subjectType === subjectType && c.subjectId === subjectId)
          .sort((a, b) => a.createdAt.localeCompare(b.createdAt)),
      );
    },
    async listFor(subjectType, subjectIds) {
      const wanted = new Set(subjectIds);
      return clone(
        db.comments
          .filter((c) => c.subjectType === subjectType && wanted.has(c.subjectId))
          .sort((a, b) => a.createdAt.localeCompare(b.createdAt)),
      );
    },
    async create(input) {
      const comment = { ...clone(input), id: newId(), createdAt: clock().toISOString() };
      db.comments.push(comment);
      return clone(comment);
    },
  };
}
