import { beforeEach, describe, expect, it } from "vitest";

import { createSeedData } from "@/mocks/seed";
import { createMockContainer } from "@/server/container";
import type { Repositories } from "@/server/repositories";

import type { RedirectableCard } from "./card-redirect-service";
import { TapRecorder, type TapInput } from "./tap-recorder";

const NOW = new Date("2026-10-17T10:00:00Z"); // 15:00 in Almaty
const TODAY = "2026-10-17";
const IPHONE =
  "Mozilla/5.0 (iPhone; CPU iPhone OS 18_5 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.5 Mobile/15E148 Safari/604.1";

let repos: Repositories;
let recorder: TapRecorder;
let card: RedirectableCard;

beforeEach(async () => {
  repos = createMockContainer(createSeedData({ now: NOW }), () => NOW).repositories;
  recorder = new TapRecorder(repos);
  const [active] = await repos.cards.list({ statuses: ["ACTIVE"] });
  if (!active?.organizationId) throw new Error("seed changed");
  card = { ...active, organizationId: active.organizationId };
});

const input = (overrides: Partial<TapInput> = {}): TapInput => ({
  eventId: crypto.randomUUID(),
  card,
  occurredAt: NOW,
  source: "NFC",
  userAgent: IPHONE,
  isHeadRequest: false,
  visit: { isDuplicate: false, isNewVisitorToday: true },
  timeZone: "Asia/Almaty",
  ...overrides,
});

async function todayStat() {
  return repos.dailyStats.total({ cardIds: [card.id], from: TODAY, to: TODAY });
}

describe("TapRecorder", () => {
  it("stores the event with device facts only and counts it", async () => {
    const before = await todayStat();
    const event = await recorder.record(input());

    expect(event).toMatchObject({ deviceType: "MOBILE", os: "IOS", isBot: false, isDuplicate: false });
    expect(Object.keys(event).sort()).toEqual(
      [
        "cardId",
        "deviceType",
        "employeeId",
        "id",
        "isBot",
        "isDuplicate",
        "locationId",
        "occurredAt",
        "organizationId",
        "os",
        "source",
      ].sort(),
    );
    expect(await todayStat()).toMatchObject({
      taps: before.taps + 1,
      uniqueVisitors: before.uniqueVisitors + 1,
      nfcTaps: before.nfcTaps + 1,
    });
  });

  it("counts QR scans separately and repeat visitors without a new unique", async () => {
    const before = await todayStat();
    await recorder.record(input({ source: "QR", visit: { isDuplicate: false, isNewVisitorToday: false } }));

    expect(await todayStat()).toMatchObject({
      taps: before.taps + 1,
      uniqueVisitors: before.uniqueVisitors,
      qrTaps: before.qrTaps + 1,
    });
  });

  it.each([
    ["a messenger preview bot", { userAgent: "WhatsApp/2.24.1 A" }, { isBot: true, isDuplicate: false }],
    ["a HEAD request", { isHeadRequest: true }, { isBot: true, isDuplicate: false }],
    [
      "a duplicate",
      { visit: { isDuplicate: true, isNewVisitorToday: false } },
      { isBot: false, isDuplicate: true },
    ],
  ] as const)("stores but does not count %s", async (_name, overrides, flags) => {
    const before = await todayStat();
    const event = await recorder.record(input(overrides));

    expect(event).toMatchObject(flags);
    expect(await todayStat()).toEqual(before);
  });

  it("is idempotent for a retried event id", async () => {
    const before = await todayStat();
    const tap = input();
    await recorder.record(tap);
    await recorder.record(tap);

    expect((await todayStat()).taps).toBe(before.taps + 1);
  });

  it("files late-evening taps under the organization's local date", async () => {
    const lateEvening = new Date("2026-10-17T18:30:00Z"); // 23:30 in Almaty
    const nextMorningUtc = new Date("2026-10-17T19:30:00Z"); // 00:30 on the 18th
    await recorder.record(input({ occurredAt: lateEvening }));
    await recorder.record(input({ occurredAt: nextMorningUtc }));

    const stat18 = await repos.dailyStats.total({ cardIds: [card.id], from: "2026-10-18", to: "2026-10-18" });
    expect(stat18.taps).toBe(1);
  });
});
