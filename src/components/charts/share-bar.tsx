import { formatNumber, formatPercent } from "@/lib/format";

type Segment = { key: string; label: string; value: number; color: string };

/**
 * Part-to-whole as one 100% bar: segments separated by a 2px surface gap,
 * with a legend that carries every value, so color is never the only cue.
 */
export function ShareBar({ segments, ariaLabel }: { segments: Segment[]; ariaLabel: string }) {
  const total = segments.reduce((sum, s) => sum + s.value, 0);
  const visible = segments.filter((s) => s.value > 0);

  return (
    <div className="grid gap-3">
      <div
        role="img"
        aria-label={ariaLabel}
        className="flex h-3 w-full gap-[2px] overflow-hidden rounded-full bg-muted"
      >
        {total > 0 &&
          visible.map((segment) => (
            <div
              key={segment.key}
              className="h-full first:rounded-l-full last:rounded-r-full"
              style={{ width: `${(segment.value / total) * 100}%`, backgroundColor: segment.color }}
            />
          ))}
      </div>
      <ul className="grid gap-1.5 text-sm">
        {segments.map((segment) => (
          <li key={segment.key} className="flex items-center gap-2">
            <span
              aria-hidden="true"
              className="size-2.5 rounded-sm"
              style={{ backgroundColor: segment.color }}
            />
            <span className="flex-1 text-muted-foreground">{segment.label}</span>
            <span className="font-medium tabular-nums">{formatNumber(segment.value)}</span>
            <span className="w-14 text-right text-muted-foreground tabular-nums">
              {total > 0 ? formatPercent(segment.value / total) : "—"}
            </span>
          </li>
        ))}
      </ul>
    </div>
  );
}
