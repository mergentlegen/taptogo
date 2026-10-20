import { z } from "zod";

import { addDays, diffInDays, type IsoDate } from "./dates";

export const periodPresets = ["today", "7d", "30d", "90d", "custom"] as const;
export type PeriodPreset = (typeof periodPresets)[number];

export const DEFAULT_PERIOD: PeriodPreset = "30d";
/** Longest custom range; keeps queries and exports bounded. */
export const MAX_PERIOD_DAYS = 366;

export type Period = {
  preset: PeriodPreset;
  from: IsoDate;
  to: IsoDate;
  days: number;
  /** Same length, immediately before — for "vs previous period" deltas. */
  previous: { from: IsoDate; to: IsoDate };
};

const PRESET_DAYS: Record<Exclude<PeriodPreset, "custom">, number> = {
  today: 1,
  "7d": 7,
  "30d": 30,
  "90d": 90,
};

const isoDate = z.iso.date();

function build(preset: PeriodPreset, from: IsoDate, to: IsoDate): Period {
  const days = diffInDays(to, from) + 1;
  return { preset, from, to, days, previous: { from: addDays(from, -days), to: addDays(from, -1) } };
}

/**
 * Reads ?period=&from=&to= from the URL. Anything invalid (bad dates, future
 * end, reversed or too long range) falls back to the default preset instead
 * of failing the page.
 */
export function resolvePeriod(
  params: { period?: string | null; from?: string | null; to?: string | null },
  today: IsoDate,
): Period {
  const preset = periodPresets.find((p) => p === params.period) ?? DEFAULT_PERIOD;

  if (preset === "custom") {
    const from = isoDate.safeParse(params.from);
    const to = isoDate.safeParse(params.to);
    if (
      from.success &&
      to.success &&
      from.data <= to.data &&
      to.data <= today &&
      diffInDays(to.data, from.data) < MAX_PERIOD_DAYS
    ) {
      return build("custom", from.data, to.data);
    }
    return resolvePeriod({ period: DEFAULT_PERIOD }, today);
  }

  return build(preset, addDays(today, -(PRESET_DAYS[preset] - 1)), today);
}

/** First value of a search param, or undefined. */
export function searchParam(value: string | string[] | undefined): string | undefined {
  return Array.isArray(value) ? value[0] : value;
}
