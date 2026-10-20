import { isCardCode } from "@/features/cards/code";
import { toLocalDate } from "@/lib/dates";

/**
 * Lives on the guest's phone, sent only to /t/*. It holds no identifier of
 * the person — just "card code → minute of the last tap from this browser",
 * which is enough to tell a repeat tap within 30 minutes (duplicate) and the
 * first tap of the day (unique visitor).
 *
 * TODO(consent): show a cookie notice before production launch.
 */
export const VISITOR_COOKIE = "ttg_seen";
export const DUPLICATE_WINDOW_MINUTES = 30;
/** Long enough to cover "today" in any time zone plus the duplicate window. */
export const VISITOR_COOKIE_MAX_AGE_SECONDS = 2 * 24 * 60 * 60;
const MAX_ENTRIES = 20;
const MAX_COOKIE_LENGTH = 1024;

/** card code → epoch minute of the last tap */
export type SeenCards = Map<string, number>;

export function parseSeenCookie(value: string | undefined): SeenCards {
  const seen: SeenCards = new Map();
  if (!value || value.length > MAX_COOKIE_LENGTH) return seen;
  for (const entry of value.split("|").slice(0, MAX_ENTRIES)) {
    const [code, minute] = entry.split(".");
    if (!code || !minute || !isCardCode(code) || !/^[0-9a-z]{1,10}$/.test(minute)) continue;
    seen.set(code, parseInt(minute, 36));
  }
  return seen;
}

export function serializeSeenCookie(seen: SeenCards): string {
  return [...seen.entries()]
    .sort((a, b) => b[1] - a[1])
    .slice(0, MAX_ENTRIES)
    .map(([code, minute]) => `${code}.${minute.toString(36)}`)
    .join("|");
}

export type VisitAnalysis = {
  isDuplicate: boolean;
  /** First valid tap of this card today (organization time zone) from this browser. */
  isNewVisitorToday: boolean;
  cookieValue: string;
};

export function analyzeVisit(input: {
  cookie: string | undefined;
  code: string;
  now: Date;
  timeZone: string;
}): VisitAnalysis {
  const seen = parseSeenCookie(input.cookie);
  const nowMinute = Math.floor(input.now.getTime() / 60_000);
  const last = seen.get(input.code);

  const isDuplicate = last !== undefined && nowMinute - last < DUPLICATE_WINDOW_MINUTES;
  const isNewVisitorToday =
    last === undefined ||
    toLocalDate(new Date(last * 60_000), input.timeZone) !== toLocalDate(input.now, input.timeZone);

  // Duplicates don't extend the window, so someone tapping every 20 minutes still counts each half hour.
  if (!isDuplicate) seen.set(input.code, nowMinute);
  return {
    isDuplicate,
    isNewVisitorToday: !isDuplicate && isNewVisitorToday,
    cookieValue: serializeSeenCookie(seen),
  };
}
