import { addDays, type IsoDate } from "@/lib/dates";

/**
 * Static numbers for the dashboard mock-up on the landing page. Deterministic
 * (no randomness), so server and client render the same chart; only the dates
 * follow `today`. Only figures the product really measures are shown: taps.
 */
export function landingPreviewData(today: IsoDate) {
  const daily = Array.from({ length: 30 }, (_, index) => {
    const date = addDays(today, index - 29);
    const weekday = new Date(`${date}T00:00:00Z`).getUTCDay();
    const weekend = weekday === 0 || weekday === 6 ? 14 : 0;
    // Gentle growth plus a repeating wobble, so the bars look like real traffic.
    const taps = 26 + Math.round(index * 0.6) + ((index * 7) % 9) + weekend;
    return { date, taps };
  });
  const taps = daily.reduce((sum, d) => sum + d.taps, 0);
  return {
    daily,
    taps: { current: taps, previous: Math.round(taps / 1.32) },
    perDay: Math.round(taps / daily.length),
    /** Taps of the top employees; names and roles come from the dictionary in the same order. */
    topEmployees: [212, 176, 149, 121, 96],
  };
}
