import { getTranslations } from "next-intl/server";

import type { HeatmapCell } from "@/server/repositories";

const HOURS = Array.from({ length: 24 }, (_, hour) => hour);
const WEEKDAYS = [1, 2, 3, 4, 5, 6, 7] as const;

/**
 * Weekday × hour grid on a single-hue sequential ramp (teal, light → dark).
 * Each cell carries its value in a tooltip; the busiest slot is spelled out
 * for screen readers.
 */
export async function Heatmap({ cells }: { cells: HeatmapCell[] }) {
  const t = await getTranslations();
  const byKey = new Map(cells.map((c) => [`${c.weekday}:${c.hour}`, c.taps]));
  const max = Math.max(1, ...cells.map((c) => c.taps));
  const peak = cells.reduce<HeatmapCell | null>((best, c) => (!best || c.taps > best.taps ? c : best), null);
  const describe = (weekday: number, hour: number, count: number) =>
    t("dashboard.charts.heatmapCell", { day: t(`weekdaysLong.${weekday as 1}`), hour, count });

  return (
    <figure className="grid gap-3">
      <div
        role="img"
        aria-label={peak ? describe(peak.weekday, peak.hour, peak.taps) : t("dashboard.charts.topEmpty")}
        className="grid grid-cols-[2rem_repeat(24,minmax(0,1fr))] gap-[2px] text-[0.625rem] text-muted-foreground"
      >
        {WEEKDAYS.map((weekday) => (
          <div key={weekday} className="contents">
            <span className="flex items-center">{t(`weekdays.${weekday}`)}</span>
            {HOURS.map((hour) => {
              const count = byKey.get(`${weekday}:${hour}`) ?? 0;
              // Empty cells recede to the surface; filled ones step from 12% to full teal.
              const strength = count === 0 ? 0 : 12 + Math.round((count / max) * 88);
              return (
                <div
                  key={hour}
                  title={describe(weekday, hour, count)}
                  className="aspect-square min-h-2.5 rounded-[3px] transition-[outline] hover:outline-2 hover:outline-foreground/40"
                  style={{
                    backgroundColor:
                      strength === 0
                        ? "var(--muted)"
                        : `color-mix(in oklab, var(--chart-1) ${strength}%, var(--card))`,
                  }}
                />
              );
            })}
          </div>
        ))}
        <span />
        {HOURS.map((hour) => (
          <span key={hour} className="text-center tabular-nums">
            {hour % 3 === 0 ? hour : ""}
          </span>
        ))}
      </div>
      <figcaption className="flex items-center justify-end gap-2 text-xs text-muted-foreground">
        {t("dashboard.charts.less")}
        <span
          aria-hidden="true"
          className="h-2 w-24 rounded-full"
          style={{
            background:
              "linear-gradient(to right, color-mix(in oklab, var(--chart-1) 12%, var(--card)), var(--chart-1))",
          }}
        />
        {t("dashboard.charts.more")}
      </figcaption>
    </figure>
  );
}
