import { features } from "@/config/features";
import type { CardStatus } from "@/features/cards/schemas";
import { addDays, eachDate, toLocalDate, type IsoDate } from "@/lib/dates";
import { serverText, serviceError } from "@/server/i18n";
import type { Repositories } from "@/server/repositories";
import { forOrganization } from "@/server/repositories/tenant";
import type { AuditService } from "@/server/services/audit-service";

import { assertOrgPermission, byKey, type OrgContext } from "./context";
import { RatingHistory } from "./rating-history";

export type LocationListItem = {
  id: string;
  name: string;
  address: string;
  linkedToTwogis: boolean;
  rating: number | null;
  reviewCount: number | null;
  /** Reviews added over the last 30 days. */
  newReviews30: number | null;
  taps30: number;
  cardCount: number;
};

export type LocationDetail = {
  location: { id: string; name: string; address: string; twogisProfileUrl: string | null };
  history: { date: IsoDate; rating: number | null; reviewCount: number | null; taps: number }[];
  cards: { id: string; label: string; status: CardStatus; taps: number }[];
  totals: { taps: number; newReviews: number | null; ratingChange: number | null };
};

const LIST_DAYS = 30;
const HISTORY_DAYS = 90;

export class LocationService {
  constructor(
    private readonly repositories: Repositories,
    private readonly audit: AuditService,
    private readonly clock: () => Date,
  ) {}

  /** Names only, for pickers and filters. */
  async options(ctx: OrgContext): Promise<{ id: string; name: string }[]> {
    const locations = await forOrganization(this.repositories, ctx.organizationId).locations.list();
    return locations.map(({ id, name }) => ({ id, name }));
  }

  async list(ctx: OrgContext): Promise<LocationListItem[]> {
    const repos = forOrganization(this.repositories, ctx.organizationId);
    const today = toLocalDate(this.clock(), ctx.timeZone);
    const from = addDays(today, -(LIST_DAYS - 1));
    const locations = await repos.locations.list();
    const ids = locations.map((l) => l.id);
    const [snapshots, stats, cards] = await Promise.all([
      features.twogisApi ? repos.ratingSnapshots.list({ locationIds: ids }) : [],
      repos.dailyStats.totalsBy({ from, to: today }, "locationId"),
      repos.cards.list(),
    ]);
    const history = new RatingHistory(snapshots, ctx.timeZone);
    const taps = byKey(stats);
    const tomorrow = addDays(today, 1);

    return locations.map((location) => {
      const latest = history.at(location.id, tomorrow);
      return {
        id: location.id,
        name: location.name,
        address: location.address,
        linkedToTwogis: location.twogisFirmId !== null,
        rating: latest?.rating ?? null,
        reviewCount: latest?.reviewCount ?? null,
        newReviews30: history.newReviews([location.id], from, today),
        taps30: taps.get(location.id)?.taps ?? 0,
        cardCount: cards.filter((c) => c.locationId === location.id).length,
      };
    });
  }

  async detail(ctx: OrgContext, locationId: string): Promise<LocationDetail | null> {
    const repos = forOrganization(this.repositories, ctx.organizationId);
    const location = await repos.locations.findById(locationId);
    if (!location) return null;

    const today = toLocalDate(this.clock(), ctx.timeZone);
    const from = addDays(today, -(HISTORY_DAYS - 1));
    const statFilter = { locationId: location.id, from, to: today };
    const [snapshots, total, byDate, byCard, cards] = await Promise.all([
      features.twogisApi ? repos.ratingSnapshots.list({ locationIds: [location.id] }) : [],
      repos.dailyStats.total(statFilter),
      repos.dailyStats.totalsBy(statFilter, "date"),
      repos.dailyStats.totalsBy(statFilter, "cardId"),
      repos.cards.list({ locationId: location.id }),
    ]);
    const history = new RatingHistory(snapshots, ctx.timeZone);
    const tapsByDate = byKey(byDate);
    const tapsByCard = byKey(byCard);
    const ids = [location.id];
    const startRating = history.ratingAt(ids, from);
    const endRating = history.ratingAt(ids, addDays(today, 1));

    return {
      location: {
        id: location.id,
        name: location.name,
        address: location.address,
        twogisProfileUrl: location.twogisProfileUrl,
      },
      history: eachDate(from, today).map((date) => {
        const snapshot = history.at(location.id, addDays(date, 1));
        return {
          date,
          rating: snapshot?.rating ?? null,
          reviewCount: snapshot?.reviewCount ?? null,
          taps: tapsByDate.get(date)?.taps ?? 0,
        };
      }),
      cards: cards
        .map((c) => ({ id: c.id, label: c.label, status: c.status, taps: tapsByCard.get(c.id)?.taps ?? 0 }))
        .sort((a, b) => b.taps - a.taps),
      totals: {
        taps: total.taps,
        newReviews: history.newReviews(ids, from, today),
        ratingChange: startRating !== null && endRating !== null ? endRating - startRating : null,
      },
    };
  }

  /** 2GIS links are changed by support only: this files a ticket for them. */
  async requestTwogisChange(ctx: OrgContext, locationId: string, message: string) {
    assertOrgPermission(ctx, "org.support");
    const repos = forOrganization(this.repositories, ctx.organizationId);
    const location = await repos.locations.findById(locationId);
    if (!location) throw serviceError("NOT_FOUND", "locationNotFound");

    const ticket = await repos.tickets.create({
      authorId: ctx.userId,
      subject: serverText("twogisChangeSubject", { location: location.name }).slice(0, 200),
      body: message,
      status: "NEW",
      assigneeId: null,
    });
    await this.audit.record({
      actorUserId: ctx.userId,
      action: "ticket.create",
      entityType: "ticket",
      entityId: ticket.id,
      organizationId: ctx.organizationId,
      after: { subject: ticket.subject },
    });
    return ticket;
  }
}
