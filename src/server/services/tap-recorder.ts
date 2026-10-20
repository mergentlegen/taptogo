import type { TapEvent, TapSource } from "@/features/analytics/schemas";
import { detectDeviceType, detectOperatingSystem, isBotUserAgent } from "@/features/analytics/user-agent";
import { toLocalDate } from "@/lib/dates";
import type { Repositories } from "@/server/repositories";

import type { RedirectableCard } from "./card-redirect-service";

export type TapInput = {
  /** Generated when the request arrives, so a retried write stays idempotent. */
  eventId: string;
  card: RedirectableCard;
  occurredAt: Date;
  source: TapSource;
  userAgent: string | null;
  isHeadRequest: boolean;
  visit: { isDuplicate: boolean; isNewVisitorToday: boolean };
  timeZone: string;
};

/**
 * Stores one tap and updates the daily rollup. No IP, user agent or visitor
 * id is kept — only device type, OS and the bot/duplicate flags.
 * Bots and duplicates are stored for transparency but never counted.
 */
export class TapRecorder {
  constructor(private readonly repositories: Pick<Repositories, "tapEvents" | "dailyStats">) {}

  async record(input: TapInput): Promise<TapEvent> {
    const isBot = input.isHeadRequest || isBotUserAgent(input.userAgent);
    const isDuplicate = !isBot && input.visit.isDuplicate;

    const { event, created } = await this.repositories.tapEvents.insert({
      id: input.eventId,
      cardId: input.card.id,
      organizationId: input.card.organizationId,
      locationId: input.card.locationId,
      employeeId: input.card.employeeId,
      occurredAt: input.occurredAt.toISOString(),
      source: input.source,
      deviceType: detectDeviceType(input.userAgent),
      os: detectOperatingSystem(input.userAgent),
      isBot,
      isDuplicate,
    });

    if (created && !isBot && !isDuplicate) {
      await this.repositories.dailyStats.increment(
        {
          cardId: event.cardId,
          organizationId: event.organizationId,
          locationId: event.locationId,
          employeeId: event.employeeId,
          date: toLocalDate(input.occurredAt, input.timeZone),
        },
        {
          taps: 1,
          uniqueVisitors: input.visit.isNewVisitorToday ? 1 : 0,
          nfcTaps: event.source === "NFC" ? 1 : 0,
          qrTaps: event.source === "QR" ? 1 : 0,
        },
      );
    }
    return event;
  }
}
