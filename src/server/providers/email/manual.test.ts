import { describe, expect, it } from "vitest";

import { ManualOutbox } from "./manual";

const message = (to: string) => ({ to, subject: "s", text: "t", tag: "password_reset" as const });

describe("ManualOutbox", () => {
  it("queues messages newest first and keeps them until someone marks them sent", async () => {
    const outbox = new ManualOutbox();
    const { id } = await outbox.send(message("a@x.kz"));
    await outbox.send(message("b@x.kz"));

    expect((await outbox.list()).map((m) => m.to)).toEqual(["b@x.kz", "a@x.kz"]);
    expect((await outbox.list()).every((m) => m.sentAt === null)).toBe(true);

    expect(await outbox.markSent(id)).toBe(true);
    expect((await outbox.list()).find((m) => m.id === id)?.sentAt).not.toBeNull();
    expect(await outbox.markSent("no-such-id")).toBe(false);
  });

  it("never drops a message that is still waiting, even when the queue is full", async () => {
    const outbox = new ManualOutbox();
    const first = await outbox.send(message("first@x.kz"));
    for (let i = 0; i < 250; i++) await outbox.send(message(`n${i}@x.kz`));

    expect((await outbox.list()).some((m) => m.id === first.id)).toBe(true);
    expect((await outbox.list()).length).toBeLessThanOrEqual(251);
  });
});
