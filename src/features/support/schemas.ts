import { z } from "zod";

import { idSchema, textSchema, timestampSchema } from "@/lib/schemas";

export const ticketStatuses = ["NEW", "IN_PROGRESS", "CLOSED"] as const;
export const ticketStatusSchema = z.enum(ticketStatuses);
export type TicketStatus = z.infer<typeof ticketStatusSchema>;

export const supportTicketSchema = z.object({
  id: idSchema,
  organizationId: idSchema,
  authorId: idSchema,
  subject: textSchema(200),
  body: textSchema(5000),
  status: ticketStatusSchema,
  /** Platform staff member handling the ticket. */
  assigneeId: idSchema.nullable(),
  createdAt: timestampSchema,
  updatedAt: timestampSchema,
});
export type SupportTicket = z.infer<typeof supportTicketSchema>;

/** Staff-only notes on tickets and leads; never shown to clients. */
export const commentSubjects = ["TICKET", "LEAD"] as const;
export const commentSubjectSchema = z.enum(commentSubjects);
export type CommentSubject = z.infer<typeof commentSubjectSchema>;

export const internalCommentSchema = z.object({
  id: idSchema,
  subjectType: commentSubjectSchema,
  subjectId: idSchema,
  authorId: idSchema,
  body: textSchema(2000),
  createdAt: timestampSchema,
});
export type InternalComment = z.infer<typeof internalCommentSchema>;
