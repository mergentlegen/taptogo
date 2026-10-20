import {
  deviceTypes,
  operatingSystems,
  tapSources,
  type DailyCardStat,
  type TapEvent,
} from "@/features/analytics/schemas";
import { localHourAndWeekday } from "@/lib/dates";

import type {
  DailyCardStatRepository,
  HeatmapCell,
  InstantRange,
  StatGroup,
  StatTotals,
  TapBreakdown,
  TapEventRepository,
  TapFilter,
} from "../analytics";
import { clone, type MockContext } from "./context";

/** Shared by raw events and daily rollups, which carry the same dimensions. */
function matches(
  row: Pick<TapEvent, "organizationId" | "cardId" | "locationId" | "employeeId">,
  filter: TapFilter,
) {
  return (
    (!filter.organizationId || row.organizationId === filter.organizationId) &&
    (!filter.cardIds || filter.cardIds.includes(row.cardId)) &&
    (!filter.locationId || row.locationId === filter.locationId) &&
    (!filter.employeeId || row.employeeId === filter.employeeId)
  );
}

const isValid = (event: TapEvent) => !event.isBot && !event.isDuplicate;
const inRange = (event: TapEvent, range: InstantRange) =>
  event.occurredAt >= range.from && event.occurredAt < range.to;

const zeroTotals = (): StatTotals => ({ taps: 0, uniqueVisitors: 0, nfcTaps: 0, qrTaps: 0 });
function addTotals(target: StatTotals, row: StatTotals) {
  target.taps += row.taps;
  target.uniqueVisitors += row.uniqueVisitors;
  target.nfcTaps += row.nfcTaps;
  target.qrTaps += row.qrTaps;
}

const zeroCounts = <K extends string>(keys: readonly K[]) =>
  Object.fromEntries(keys.map((key) => [key, 0])) as Record<K, number>;

export function mockTapEventRepository({ db }: MockContext): TapEventRepository {
  const ids = new Set(db.tapEvents.map((e) => e.id));

  return {
    async insert(event) {
      if (ids.has(event.id)) {
        const existing = db.tapEvents.find((e) => e.id === event.id);
        if (existing) return { event: clone(existing), created: false };
      }
      const stored = clone(event);
      db.tapEvents.push(stored);
      ids.add(stored.id);
      return { event: clone(stored), created: true };
    },
    async count({ range, kind = "valid", ...filter }) {
      const ofKind = (e: TapEvent) =>
        kind === "all" || (kind === "valid" ? isValid(e) : kind === "bots" ? e.isBot : e.isDuplicate);
      return db.tapEvents.filter((e) => inRange(e, range) && matches(e, filter) && ofKind(e)).length;
    },
    async heatmap({ range, ...filter }, timeZone) {
      const cells = new Map<string, HeatmapCell>();
      for (const event of db.tapEvents) {
        if (!isValid(event) || !inRange(event, range) || !matches(event, filter)) continue;
        const { weekday, hour } = localHourAndWeekday(event.occurredAt, timeZone);
        const key = `${weekday}:${hour}`;
        const cell = cells.get(key) ?? { weekday, hour, taps: 0 };
        cell.taps++;
        cells.set(key, cell);
      }
      return [...cells.values()].sort((a, b) => a.weekday - b.weekday || a.hour - b.hour);
    },
    async breakdown({ range, ...filter }) {
      const result: TapBreakdown = {
        sources: zeroCounts(tapSources),
        operatingSystems: zeroCounts(operatingSystems),
        deviceTypes: zeroCounts(deviceTypes),
      };
      for (const event of db.tapEvents) {
        if (!isValid(event) || !inRange(event, range) || !matches(event, filter)) continue;
        result.sources[event.source]++;
        result.operatingSystems[event.os]++;
        result.deviceTypes[event.deviceType]++;
      }
      return result;
    },
    async lastTapByCard(filter) {
      const last: Record<string, string> = {};
      for (const event of db.tapEvents) {
        if (!isValid(event) || !matches(event, filter)) continue;
        const current = last[event.cardId];
        if (!current || event.occurredAt > current) last[event.cardId] = event.occurredAt;
      }
      return last;
    },
  };
}

export function mockDailyCardStatRepository({ db }: MockContext): DailyCardStatRepository {
  const keyOf = (cardId: string, date: string) => `${cardId}|${date}`;
  const index = new Map<string, DailyCardStat>(db.dailyStats.map((s) => [keyOf(s.cardId, s.date), s]));

  return {
    async total({ from, to, ...filter }) {
      const sum = zeroTotals();
      for (const row of db.dailyStats) {
        if (row.date >= from && row.date <= to && matches(row, filter)) addTotals(sum, row);
      }
      return sum;
    },
    async totalsBy({ from, to, ...filter }, dimension) {
      const groups = new Map<string, StatGroup>();
      for (const row of db.dailyStats) {
        const key = row[dimension];
        if (key === null || row.date < from || row.date > to || !matches(row, filter)) continue;
        const group = groups.get(key) ?? { key, ...zeroTotals() };
        addTotals(group, row);
        groups.set(key, group);
      }
      return [...groups.values()].sort((a, b) => a.key.localeCompare(b.key));
    },
    async increment(key, delta) {
      const existing = index.get(keyOf(key.cardId, key.date));
      if (existing) {
        existing.taps += delta.taps;
        existing.uniqueVisitors += delta.uniqueVisitors;
        existing.nfcTaps += delta.nfcTaps;
        existing.qrTaps += delta.qrTaps;
        return;
      }
      const row: DailyCardStat = { ...key, ...delta };
      db.dailyStats.push(row);
      index.set(keyOf(key.cardId, key.date), row);
    },
  };
}
