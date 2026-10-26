import type { EmailMessage, Outbox, QueuedMessage } from "./types";

const QUEUE_LIMIT = 200;

/**
 * Manual sending: keeps messages until an administrator marks them as sent.
 * In memory: the mock data source. Supabase uses `SupabaseOutbox` (a table).
 */
export class ManualOutbox implements Outbox {
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
  async list(): Promise<QueuedMessage[]> {
    return this.queue.map((m) => ({ ...m }));
  }

  async markSent(id: string): Promise<boolean> {
    const item = this.queue.find((m) => m.id === id);
    if (!item) return false;
    item.sentAt ??= this.clock().toISOString();
    return true;
  }

  async clear(): Promise<void> {
    this.queue.length = 0;
  }
}
