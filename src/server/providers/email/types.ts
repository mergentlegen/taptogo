export const emailTags = [
  "invitation",
  "password_reset",
  "weekly_report",
  "low_activity",
  "subscription_reminder",
  "new_lead",
] as const;
export type EmailTag = (typeof emailTags)[number];

export type EmailMessage = {
  to: string;
  subject: string;
  /** Plain-text body; always required so every email is readable without HTML. */
  text: string;
  html?: string;
  tag: EmailTag;
};

export interface EmailProvider {
  readonly name: string;
  send(message: EmailMessage): Promise<{ id: string }>;
}

export type SentEmail = EmailMessage & { id: string; sentAt: string };

/** Development-only view of "sent" emails, rendered at /dev/outbox. */
export interface DevOutbox {
  list(): SentEmail[];
  clear(): void;
}
