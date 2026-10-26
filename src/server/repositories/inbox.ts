import type {
  CommentSubject,
  InternalComment,
  SupportTicket,
  TicketStatus,
} from "@/features/support/schemas";

import type { NewEntity, OrgScope } from "./common";

export interface SupportTicketRepository {
  findById(id: string, scope?: OrgScope): Promise<SupportTicket | null>;
  /** Newest first, at most `limit` (tickets accumulate forever). */
  list(filter: {
    organizationId?: string;
    statuses?: TicketStatus[];
    limit: number;
  }): Promise<SupportTicket[]>;
  create(input: NewEntity<SupportTicket, "updatedAt">): Promise<SupportTicket>;
  update(id: string, patch: Partial<Pick<SupportTicket, "status" | "assigneeId">>): Promise<SupportTicket>;
}

export interface InternalCommentRepository {
  /** Oldest first. */
  list(subjectType: CommentSubject, subjectId: string): Promise<InternalComment[]>;
  /** Comments of many subjects in one query (no N+1 on list pages), oldest first. */
  listFor(subjectType: CommentSubject, subjectIds: readonly string[]): Promise<InternalComment[]>;
  create(input: NewEntity<InternalComment>): Promise<InternalComment>;
}
