import { TZDate } from "@date-fns/tz";
import { format } from "date-fns";

export const DEFAULT_TIME_ZONE = "Asia/Almaty";

/**
 * Calendar dates are plain "YYYY-MM-DD" strings in an organization's time
 * zone. Arithmetic on them is done in UTC so it never depends on the server's
 * own time zone.
 */
export type IsoDate = string;

/** The calendar date of `instant` as seen in `timeZone`. */
export function toLocalDate(instant: Date | string, timeZone: string): IsoDate {
  return format(new TZDate(new Date(instant).getTime(), timeZone), "yyyy-MM-dd");
}

/** Hour (0–23) and ISO weekday (1 = Monday … 7 = Sunday) of `instant` in `timeZone`. */
export function localHourAndWeekday(instant: Date | string, timeZone: string) {
  const local = new TZDate(new Date(instant).getTime(), timeZone);
  const day = local.getDay();
  return { hour: local.getHours(), weekday: day === 0 ? 7 : day };
}

/** UTC instant of a local wall-clock time in `timeZone`. */
export function zonedTimeToUtc(
  date: IsoDate,
  time: { hour: number; minute?: number; second?: number },
  timeZone: string,
): Date {
  const [year, month, day] = parseIsoDate(date);
  return new Date(
    new TZDate(year, month - 1, day, time.hour, time.minute ?? 0, time.second ?? 0, timeZone).getTime(),
  );
}

function parseIsoDate(date: IsoDate): [number, number, number] {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(date);
  if (!match) throw new Error(`Invalid ISO date: ${date}`);
  return [Number(match[1]), Number(match[2]), Number(match[3])];
}

export function addDays(date: IsoDate, days: number): IsoDate {
  const [year, month, day] = parseIsoDate(date);
  return new Date(Date.UTC(year, month - 1, day + days)).toISOString().slice(0, 10);
}

/** Whole days from `from` to `to` (positive when `to` is later). */
export function diffInDays(to: IsoDate, from: IsoDate): number {
  const [y1, m1, d1] = parseIsoDate(to);
  const [y2, m2, d2] = parseIsoDate(from);
  return Math.round((Date.UTC(y1, m1 - 1, d1) - Date.UTC(y2, m2 - 1, d2)) / 86_400_000);
}

/** Inclusive list of dates between `from` and `to`. */
export function eachDate(from: IsoDate, to: IsoDate): IsoDate[] {
  const result: IsoDate[] = [];
  for (let date = from; date <= to; date = addDays(date, 1)) result.push(date);
  return result;
}

/** ISO weekday of a calendar date: 1 = Monday … 7 = Sunday. */
export function isoWeekday(date: IsoDate): number {
  const [year, month, day] = parseIsoDate(date);
  const weekday = new Date(Date.UTC(year, month - 1, day)).getUTCDay();
  return weekday === 0 ? 7 : weekday;
}

/** Adds calendar months, clamping to the month's last day (31 Jan + 1 month → 28/29 Feb). */
export function addMonths(date: IsoDate, months: number): IsoDate {
  const [year, month, day] = parseIsoDate(date);
  const targetMonth = month - 1 + months;
  const lastDay = new Date(Date.UTC(year, targetMonth + 1, 0)).getUTCDate();
  return new Date(Date.UTC(year, targetMonth, Math.min(day, lastDay))).toISOString().slice(0, 10);
}
