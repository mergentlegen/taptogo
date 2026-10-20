import type { Card, CardStatus, CardType } from "@/features/cards/schemas";
import type { RedirectTargetType } from "@/features/targets/schemas";
import { addDays, toLocalDate, type IsoDate } from "@/lib/dates";
import { serviceError } from "@/server/i18n";
import type { HeatmapCell, Repositories, TapBreakdown } from "@/server/repositories";
import { forOrganization } from "@/server/repositories/tenant";
import type { AuditService } from "@/server/services/audit-service";

import { dayRange } from "./analytics-service";
import { assertOrgPermission, auditDiff, byKey, type OrgContext } from "./context";

export type CardListItem = {
  id: string;
  code: string;
  label: string;
  type: CardType;
  status: CardStatus;
  locationId: string | null;
  locationName: string | null;
  employeeName: string | null;
  taps30: number;
  lastTapAt: string | null;
};

export type CardDetail = {
  card: Card;
  locationName: string | null;
  employeeName: string | null;
  target: { id: string; type: RedirectTargetType; url: string } | null;
  stats: {
    from: IsoDate;
    to: IsoDate;
    taps: number;
    uniqueVisitors: number;
    daily: { date: IsoDate; taps: number }[];
    heatmap: HeatmapCell[];
    breakdown: TapBreakdown;
    lastTapAt: string | null;
  };
  options: {
    locations: { id: string; name: string }[];
    employees: { id: string; name: string; locationId: string | null }[];
    targets: { id: string; type: RedirectTargetType; url: string; locationId: string | null }[];
  };
};

const STATS_DAYS = 30;
/** Statuses a client may move a card between; LOST is final for them, REVOKED is admin-only. */
const CLIENT_EDITABLE: readonly CardStatus[] = ["ACTIVE", "PAUSED"];

export class CardService {
  constructor(
    private readonly repositories: Repositories,
    private readonly audit: AuditService,
    private readonly clock: () => Date,
  ) {}

  private tenant(ctx: OrgContext) {
    return forOrganization(this.repositories, ctx.organizationId);
  }

  private today(ctx: OrgContext): IsoDate {
    return toLocalDate(this.clock(), ctx.timeZone);
  }

  async list(ctx: OrgContext): Promise<CardListItem[]> {
    const repos = this.tenant(ctx);
    const today = this.today(ctx);
    const [cards, locations, employees, stats, lastTaps] = await Promise.all([
      repos.cards.list(),
      repos.locations.list(),
      repos.employees.list(),
      repos.dailyStats.totalsBy({ from: addDays(today, -(STATS_DAYS - 1)), to: today }, "cardId"),
      repos.tapEvents.lastTapByCard(),
    ]);
    const locationName = new Map(locations.map((l) => [l.id, l.name]));
    const employeeName = new Map(employees.map((e) => [e.id, e.name]));
    const taps = byKey(stats);

    return cards
      .map((card) => ({
        id: card.id,
        code: card.code,
        label: card.label,
        type: card.type,
        status: card.status,
        locationId: card.locationId,
        locationName: card.locationId ? (locationName.get(card.locationId) ?? null) : null,
        employeeName: card.employeeId ? (employeeName.get(card.employeeId) ?? null) : null,
        taps30: taps.get(card.id)?.taps ?? 0,
        lastTapAt: lastTaps[card.id] ?? null,
      }))
      .sort((a, b) => b.taps30 - a.taps30);
  }

  /** The bare card (e.g. for its QR code); null outside the organization. */
  find(ctx: OrgContext, cardId: string): Promise<Card | null> {
    return this.tenant(ctx).cards.findById(cardId);
  }

  /** null when the card doesn't exist or belongs to another organization. */
  async detail(ctx: OrgContext, cardId: string): Promise<CardDetail | null> {
    const repos = this.tenant(ctx);
    const card = await repos.cards.findById(cardId);
    if (!card) return null;

    const to = this.today(ctx);
    const from = addDays(to, -(STATS_DAYS - 1));
    const range = dayRange(from, to, ctx.timeZone);
    const filter = { cardIds: [card.id] };
    const [locations, employees, targets, totals, daily, heatmap, breakdown, lastTaps] = await Promise.all([
      repos.locations.list(),
      repos.employees.list(),
      repos.targets.list({ isVerified: true }),
      repos.dailyStats.total({ ...filter, from, to }),
      repos.dailyStats.totalsBy({ ...filter, from, to }, "date"),
      repos.tapEvents.heatmap({ ...filter, range }, ctx.timeZone),
      repos.tapEvents.breakdown({ ...filter, range }),
      repos.tapEvents.lastTapByCard(filter),
    ]);
    const byDate = byKey(daily);
    const target = card.targetId ? targets.find((t) => t.id === card.targetId) : undefined;
    const days: IsoDate[] = [];
    for (let d = from; d <= to; d = addDays(d, 1)) days.push(d);

    return {
      card,
      locationName: locations.find((l) => l.id === card.locationId)?.name ?? null,
      employeeName: employees.find((e) => e.id === card.employeeId)?.name ?? null,
      target: target ? { id: target.id, type: target.type, url: target.url } : null,
      stats: {
        from,
        to,
        taps: totals.taps,
        uniqueVisitors: totals.uniqueVisitors,
        daily: days.map((date) => ({ date, taps: byDate.get(date)?.taps ?? 0 })),
        heatmap,
        breakdown,
        lastTapAt: lastTaps[card.id] ?? null,
      },
      options: {
        locations: locations.map(({ id, name }) => ({ id, name })),
        employees: employees
          .filter((e) => e.isActive || e.id === card.employeeId)
          .map(({ id, name, locationId }) => ({ id, name, locationId })),
        targets: targets.map(({ id, type, url, locationId }) => ({ id, type, url, locationId })),
      },
    };
  }

  async update(
    ctx: OrgContext,
    input: {
      cardId: string;
      label: string;
      locationId: string | null;
      employeeId: string | null;
      targetId: string | null;
    },
  ): Promise<Card> {
    assertOrgPermission(ctx, "org.cards.manage");
    const repos = this.tenant(ctx);
    const card = await this.requireCard(ctx, input.cardId);

    // Every reference must belong to the same organization; a target must also be verified.
    const [location, employee, target] = await Promise.all([
      input.locationId ? repos.locations.findById(input.locationId) : null,
      input.employeeId ? repos.employees.findById(input.employeeId) : null,
      input.targetId ? repos.targets.findById(input.targetId) : null,
    ]);
    if (input.locationId && !location) throw serviceError("VALIDATION", "locationNotFound");
    if (input.employeeId && !employee) throw serviceError("VALIDATION", "employeeNotFound");
    if (input.targetId && !target?.isVerified) throw serviceError("VALIDATION", "targetMustBeVerified");

    const updated = await repos.cards.update(card.id, {
      label: input.label,
      locationId: input.locationId,
      employeeId: input.employeeId,
      targetId: input.targetId,
    });
    const diff = auditDiff(card, updated, ["label", "locationId", "employeeId", "targetId"]);
    if (diff) await this.record(ctx, "card.update", card.id, diff);
    return updated;
  }

  async setPaused(ctx: OrgContext, cardId: string, paused: boolean): Promise<Card> {
    assertOrgPermission(ctx, "org.cards.manage");
    const card = await this.requireCard(ctx, cardId);
    if (!CLIENT_EDITABLE.includes(card.status)) {
      throw serviceError("CONFLICT", "cardStatusLocked");
    }
    const status: CardStatus = paused ? "PAUSED" : "ACTIVE";
    if (!paused && !card.targetId) throw serviceError("VALIDATION", "cardNeedsTarget");
    if (card.status === status) return card;

    const updated = await this.tenant(ctx).cards.update(card.id, { status });
    await this.record(ctx, paused ? "card.pause" : "card.resume", card.id, {
      before: { status: card.status },
      after: { status },
    });
    return updated;
  }

  /** Takes effect immediately: the next tap shows "card not active". */
  async reportLost(ctx: OrgContext, cardId: string): Promise<Card> {
    assertOrgPermission(ctx, "org.cards.manage");
    const card = await this.requireCard(ctx, cardId);
    if (!CLIENT_EDITABLE.includes(card.status)) {
      throw serviceError("CONFLICT", "cardStatusLocked");
    }
    const updated = await this.tenant(ctx).cards.update(card.id, { status: "LOST" });
    await this.record(ctx, "card.report_lost", card.id, {
      before: { status: card.status },
      after: { status: "LOST" },
    });
    return updated;
  }

  private async requireCard(ctx: OrgContext, cardId: string): Promise<Card> {
    const card = await this.tenant(ctx).cards.findById(cardId);
    if (!card) throw serviceError("NOT_FOUND", "cardNotFound");
    return card;
  }

  private record(
    ctx: OrgContext,
    action: string,
    cardId: string,
    diff: {
      before: Parameters<AuditService["record"]>[0]["before"];
      after: Parameters<AuditService["record"]>[0]["after"];
    },
  ) {
    return this.audit.record({
      actorUserId: ctx.userId,
      action,
      entityType: "card",
      entityId: cardId,
      organizationId: ctx.organizationId,
      ...diff,
    });
  }
}
