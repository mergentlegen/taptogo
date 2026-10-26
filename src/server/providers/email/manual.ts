import type { EmailMessage, EmailProvider, QueuedMessage } from "./types";

const QUEUE_LIMIT = 200;

/**
 * Manual sending: keeps messages until an administrator marks them as sent.
 * In memory for now, like the rest of the mock data; a table in Supabase later.
 */
export class ManualOutbox implements EmailProvider {
  readonly name = "manual";
  private readonly queue: QueuedMessage[] = [];

  constructor(private readonly clock: () => Date = () => new Date()) {}

  async send(message: EmailMessage): Promise<{ id: string }> {
    const item: QueuedMessage = {
      ...message,
      id: crypto.randomUUID(),
      queuedAt: this.clock().toISOString(),
      sentAt: null,
    };
    this.queue.unshift(item);
    // Drop the oldest sent messages first; unsent ones are never dropped silently.
    while (this.queue.length > QUEUE_LIMIT) {
      const index = this.queue.findLastIndex((m) => m.sentAt !== null);
      if (index === -1) break;
      this.queue.splice(index, 1);
    }
    return { id: item.id };
  }

  /** Newest first. */
  list(): QueuedMessage[] {
    return this.queue.map((m) => ({ ...m }));
  }

  /** Returns false when there is no such message. */
  markSent(id: string): boolean {
    const item = this.queue.find((m) => m.id === id);
    if (!item) return false;
    item.sentAt ??= this.clock().toISOString();
    return true;
  }

  clear(): void {
    this.queue.length = 0;
  }
}
