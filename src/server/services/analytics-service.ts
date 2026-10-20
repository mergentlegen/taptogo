import type { OperatingSystem, TapSource } from "@/features/analytics/schemas";
import { addDays, eachDate, toLocalDate, zonedTimeToUtc, type IsoDate } from "@/lib/dates";
import type { Period } from "@/lib/period";
import type { HeatmapCell, Repositories, StatGroup } from "@/server/repositories";
import { forOrganization } from "@/server/repositories/tenant";

import { byKey, type OrgContext } from "./context";
import { RatingHistory } from "./rating-history";

export type DashboardFilter = { locationId?: string; employeeId?: string; cardId?: string };

export type Comparison<T> = { value: T; previous: T };

export type DashboardData = {
  /** Filters that survived validation (ids outside the organization are dropped). */
  filter: DashboardFilter;
  kpis: {
    taps: Comparison<number>;
    uniqueVisitors: Comparison<number>;
    rating: Comparison<number | null>;
    newReviews: Comparison<number | null>;
    /** ≈ new reviews / unique visitors; an estimate, always labelled as such. */
    conversion: Comparison<number | null>;
  };
  daily: { date: IsoDate; taps: number; reviewCount: number | null }[];
  /** First card activation in scope, shown as a "before / after" marker. */
  installDate: IsoDate | null;
  heatmap: HeatmapCell[];
  topCards: { id: string; label: string; location: string | null; taps: number }[];
  topEmployees: { id: string; name: string; taps: number }[];
  sources: Record<TapSource, number>;
  platforms: { IOS: number; ANDROID: number; OTHER: number };
  /** Anything to show at all in the period (drives empty states). */
  hasTaps: boolean;
  hasRatings: boolean;
};

export type DashboardOptions = {
  locations: { id: string; name: string }[];
  employees: { id: string; name: string }[];
  cards: { id: string; label: string }[];
};

/** Instant range covering whole local days [from, to] in the time zone. */
export function dayRange(from: IsoDate, to: IsoDate, timeZone: string) {
  return {
    from: zonedTimeToUtc(from, { hour: 0 }, timeZone).toISOString(),
    to: zonedTimeToUtc(addDays(to, 1), { hour: 0 }, timeZone).toISOString(),
  };
}

/** The five groups with the most taps. */
const busiest = (groups: readonly StatGroup[]) => [...groups].sort((a, b) => b.taps - a.taps).slice(0, 5);

export class AnalyticsService {
  constructor(private readonly repositories: Repositories) {}

  /** Filter choices for the dashboard (only this organization's entities). */
  async options(ctx: OrgContext): Promise<DashboardOptions> {
    const repos = forOrganization(this.repositories, ctx.organizationId);
    const [locations, employees, cards] = await Promise.all([
      repos.locations.list(),
      repos.employees.list(),
      repos.cards.list(),
    ]);
    return {
      locations: locations.map(({ id, name }) => ({ id, name })),
      employees: employees.map(({ id, name }) => ({ id, name })),
      cards: cards
        .filter((c) => c.status !== "UNASSIGNED")
        .map(({ id, label }) => ({ id, label }))
        .sort((a, b) => a.label.localeCompare(b.label, "ru")),
    };
  }

  async dashboard(ctx: OrgContext, period: Period, requested: DashboardFilter): Promise<DashboardData> {
    const repos = forOrganization(this.repositories, ctx.organizationId);

    // Validate every filter id against this organization; foreign ids are ignored.
    const [location, employee, card] = await Promise.all([
      requested.locationId ? repos.locations.findById(requested.locationId) : null,
      requested.employeeId ? repos.employees.findById(requested.employeeId) : null,
      requested.cardId ? repos.cards.findById(requested.cardId) : null,
    ]);
    const filter: DashboardFilter = {
      ...(location && { locationId: location.id }),
      ...(employee && { employeeId: employee.id }),
      ...(card && { cardId: card.id }),
    };
    const tapFilter = {
      locationId: filter.locationId,
      employeeId: filter.employeeId,
      cardIds: filter.cardId ? [filter.cardId] : undefined,
    };
    const current = { ...tapFilter, from: period.from, to: period.to };

    // Sums only: the payload depends on days/cards/employees, not on cards × days.
    const [now, before, byDate, byCard, byEmployee, allLocations, scopedCards, employees] = await Promise.all(
      [
        repos.dailyStats.total(current),
        repos.dailyStats.total({ ...tapFilter, from: period.previous.from, to: period.previous.to }),
        repos.dailyStats.totalsBy(current, "date"),
        repos.dailyStats.totalsBy(current, "cardId"),
        repos.dailyStats.totalsBy(current, "employeeId"),
        repos.locations.list(),
        repos.cards.list({ locationId: filter.locationId, employeeId: filter.employeeId }),
        repos.employees.list(),
      ],
    );
    const cardsInScope = filter.cardId ? scopedCards.filter((c) => c.id === filter.cardId) : scopedCards;

    // Ratings belong to locations: use the filtered location, or those of the filtered card/employee.
    const ratingLocationIds = filter.locationId
      ? [filter.locationId]
      : filter.cardId || filter.employeeId
        ? [...new Set(cardsInScope.map((c) => c.locationId).filter((id): id is string => id !== null))]
        : allLocations.map((l) => l.id);
    const snapshots = await repos.ratingSnapshots.list({ locationIds: ratingLocationIds });
    const history = new RatingHistory(snapshots, ctx.timeZone);

    const newReviews = history.newReviews(ratingLocationIds, period.from, period.to);
    const previousNewReviews = history.newReviews(
      ratingLocationIds,
      period.previous.from,
      period.previous.to,
    );
    const conversion = (reviews: number | null, visitors: number) =>
      reviews === null || visitors === 0 ? null : reviews / visitors;

    const tapsByDate = byKey(byDate);
    const daily = eachDate(period.from, period.to).map((date) => ({
      date,
      taps: tapsByDate.get(date)?.taps ?? 0,
      reviewCount: history.reviewCountAt(ratingLocationIds, addDays(date, 1)),
    }));

    const range = dayRange(period.from, period.to, ctx.timeZone);
    const [heatmap, breakdown] = await Promise.all([
      repos.tapEvents.heatmap({ ...tapFilter, range }, ctx.timeZone),
      repos.tapEvents.breakdown({ ...tapFilter, range }),
    ]);

    const locationName = new Map(allLocations.map((l) => [l.id, l.name]));
    const cardById = new Map(scopedCards.map((c) => [c.id, c]));
    const topCards = busiest(byCard).flatMap(({ key: id, ...totals }) => {
      const c = cardById.get(id);
      return c
        ? [
            {
              id,
              label: c.label,
              location: c.locationId ? (locationName.get(c.locationId) ?? null) : null,
              taps: totals.taps,
            },
          ]
        : [];
    });
    const employeeName = new Map(employees.map((e) => [e.id, e.name]));
    const topEmployees = busiest(byEmployee).flatMap(({ key: id, ...totals }) => {
      const name = employeeName.get(id);
      return name ? [{ id, name, taps: totals.taps }] : [];
    });

    const activations = cardsInScope
      .map((c) => c.activatedAt)
      .filter((a): a is string => a !== null)
      .map((a) => toLocalDate(a, ctx.timeZone))
      .sort();
    const firstActivation = activations[0] ?? null;

    const os = breakdown.operatingSystems;
    const otherOs = (Object.keys(os) as OperatingSystem[])
      .filter((k) => k !== "IOS" && k !== "ANDROID")
      .reduce((sum, k) => sum + os[k], 0);

    return {
      filter,
      kpis: {
        taps: { value: now.taps, previous: before.taps },
        uniqueVisitors: { value: now.uniqueVisitors, previous: before.uniqueVisitors },
        rating: {
          value: history.ratingAt(ratingLocationIds, addDays(period.to, 1)),
          previous: history.ratingAt(ratingLocationIds, period.from),
        },
        newReviews: { value: newReviews, previous: previousNewReviews },
        conversion: {
          value: conversion(newReviews, now.uniqueVisitors),
          previous: conversion(previousNewReviews, before.uniqueVisitors),
        },
      },
      daily,
      installDate:
        firstActivation && firstActivation >= period.from && firstActivation <= period.to
          ? firstActivation
          : null,
      heatmap,
      topCards,
      topEmployees,
      sources: { NFC: now.nfcTaps, QR: now.qrTaps },
      platforms: { IOS: os.IOS, ANDROID: os.ANDROID, OTHER: otherOs },
      hasTaps: now.taps > 0,
      hasRatings: history.hasData,
    };
  }
}
