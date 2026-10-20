import { DEFAULT_TIME_ZONE } from "./dates";

/**
 * Display formatting for Russian UI. Every date formatter takes the
 * organization's time zone explicitly, so server and browser always agree.
 */
const LOCALE = "ru-RU";

const integer = new Intl.NumberFormat(LOCALE, { maximumFractionDigits: 0 });
const compact = new Intl.NumberFormat(LOCALE, { notation: "compact", maximumFractionDigits: 1 });
const rating = new Intl.NumberFormat(LOCALE, { minimumFractionDigits: 1, maximumFractionDigits: 1 });
const ratingDelta = new Intl.NumberFormat(LOCALE, {
  minimumFractionDigits: 2,
  maximumFractionDigits: 2,
  signDisplay: "exceptZero",
});
const percent = new Intl.NumberFormat(LOCALE, { style: "percent", maximumFractionDigits: 1 });
const signedPercent = new Intl.NumberFormat(LOCALE, {
  style: "percent",
  maximumFractionDigits: 0,
  signDisplay: "exceptZero",
});
const kzt = new Intl.NumberFormat(LOCALE, {
  style: "currency",
  currency: "KZT",
  currencyDisplay: "narrowSymbol",
  maximumFractionDigits: 0,
});

export const formatNumber = (value: number) => integer.format(value);
export const formatCompact = (value: number) =>
  Math.abs(value) < 10_000 ? integer.format(value) : compact.format(value);
export const formatRating = (value: number) => rating.format(value);
export const formatRatingDelta = (value: number) => ratingDelta.format(value);
export const formatPercent = (fraction: number) => percent.format(fraction);
export const formatKzt = (amount: number) => kzt.format(amount);

/** Relative change, e.g. "+12 %"; null when there is no baseline to compare with. */
export function formatChange(current: number, previous: number): string | null {
  if (previous === 0) return null;
  return signedPercent.format((current - previous) / previous);
}

const dateFormatters = new Map<string, Intl.DateTimeFormat>();
function dateFormatter(timeZone: string, options: Intl.DateTimeFormatOptions): Intl.DateTimeFormat {
  const key = `${timeZone}|${JSON.stringify(options)}`;
  let formatter = dateFormatters.get(key);
  if (!formatter) {
    formatter = new Intl.DateTimeFormat(LOCALE, { timeZone, ...options });
    dateFormatters.set(key, formatter);
  }
  return formatter;
}

/** Calendar date "YYYY-MM-DD" → "17 окт." (no time zone shift: it already is a local date). */
export function formatIsoDate(date: string, style: "short" | "long" = "short"): string {
  return dateFormatter(
    "UTC",
    style === "short" ? { day: "numeric", month: "short" } : { dateStyle: "long" },
  ).format(new Date(`${date}T00:00:00Z`));
}

export function formatDateTime(instant: string | Date, timeZone: string = DEFAULT_TIME_ZONE): string {
  return dateFormatter(timeZone, { dateStyle: "short", timeStyle: "short" }).format(new Date(instant));
}

export function formatDate(instant: string | Date, timeZone: string = DEFAULT_TIME_ZONE): string {
  return dateFormatter(timeZone, { dateStyle: "medium" }).format(new Date(instant));
}
