import type { DevOutbox, EmailMessage, EmailProvider, SentEmail } from "./types";

const OUTBOX_LIMIT = 100;

/**
 * Development provider: prints emails to the server console and keeps the
 * last ones in memory for /dev/outbox. Replaced by ResendEmailProvider later.
 */
export class ConsoleEmailProvider implements EmailProvider, DevOutbox {
  readonly name = "console";
  private readonly sent: SentEmail[] = [];

  constructor(private readonly clock: () => Date = () => new Date()) {}

  async send(message: EmailMessage): Promise<{ id: string }> {
    const email: SentEmail = { ...message, id: crypto.randomUUID(), sentAt: this.clock().toISOString() };
    this.sent.unshift(email);
    this.sent.length = Math.min(this.sent.length, OUTBOX_LIMIT);

    console.info(
      [
        "",
        `📧 [dev email] ${email.tag} → ${email.to}`,
        `   Subject: ${email.subject}`,
        ...email.text.split("\n").map((line) => `   ${line}`),
        "",
      ].join("\n"),
    );
    return { id: email.id };
  }

  list(): SentEmail[] {
    return this.sent.map((email) => ({ ...email }));
  }

  clear(): void {
    this.sent.length = 0;
  }
}
