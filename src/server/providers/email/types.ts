export const emailTags = ["invitation", "password_reset"] as const;
export type EmailTag = (typeof emailTags)[number];

export type EmailMessage = {
  to: string;
  subject: string;
  /** Plain text: the admin copies it into a messenger, so it must read well as is. */
  text: string;
  tag: EmailTag;
};

/**
 * Where messages go. There is no mail service: the message is queued and an
 * administrator sends it by hand (WhatsApp, phone) from the "manual sending" page.
 */
export interface EmailProvider {
  readonly name: string;
  send(message: EmailMessage): Promise<{ id: string }>;
}

export type QueuedMessage = EmailMessage & {
  id: string;
  queuedAt: string;
  /** Set when the administrator confirms the message has been sent. */
  sentAt: string | null;
};

/** The queue behind the "manual sending" page: messages wait here until an admin marks them sent. */
export interface Outbox extends EmailProvider {
  /** Newest first. */
  list(): Promise<QueuedMessage[]>;
  /** Returns false when there is no such message. */
  markSent(id: string): Promise<boolean>;
}
