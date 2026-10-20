"use client";

import { Bar, BarChart, CartesianGrid, Line, LineChart, ReferenceLine, XAxis, YAxis } from "recharts";

import { ChartContainer, ChartTooltip, ChartTooltipContent, type ChartConfig } from "@/components/ui/chart";
import { formatCompact, formatIsoDate, formatNumber } from "@/lib/format";

/** Serializable formatter choice (functions can not cross the server → client boundary). */
export type ValueFormat = "number" | "compact" | "rating";
const formatters: Record<ValueFormat, (value: number) => string> = {
  number: formatNumber,
  compact: formatCompact,
  // Two decimals so adjacent axis ticks (4,35 / 4,40) never print the same label.
  rating: (value) => value.toFixed(2).replace(".", ","),
};

const ANIMATION_MS = 500;

type Point = { date: string; value: number | null };

type TimeSeriesChartProps = {
  data: Point[];
  kind: "bar" | "line";
  /** Series name (tooltip); the card title names the chart, so there is no legend box. */
  label: string;
  /** CSS color token, e.g. "var(--chart-1)". */
  color: string;
  valueFormat?: ValueFormat;
  /** Optional vertical marker, e.g. the day the cards were installed. */
  marker?: { date: string; label: string } | null;
  /** Fit the y-axis to the data instead of starting at zero (for slow-moving totals). */
  tightDomain?: boolean;
  height?: number;
  ariaLabel: string;
};

/**
 * One measure over time on a single y-axis. Two measures with different
 * scales are drawn as two aligned charts, never as a dual-axis chart.
 */
export function TimeSeriesChart({
  data,
  kind,
  label,
  color,
  valueFormat = "compact",
  marker,
  tightDomain = false,
  height = 220,
  ariaLabel,
}: TimeSeriesChartProps) {
  const formatValue = formatters[valueFormat];
  const config = { value: { label, color } } satisfies ChartConfig;
  const xAxis = (
    <XAxis
      dataKey="date"
      tickLine={false}
      axisLine={false}
      tickMargin={8}
      minTickGap={24}
      tickFormatter={(value: string) => formatIsoDate(value)}
    />
  );
  const yAxis = (
    <YAxis
      width={44}
      tickLine={false}
      axisLine={false}
      tickMargin={4}
      allowDecimals={valueFormat === "rating"}
      domain={tightDomain ? ["auto", "auto"] : [0, "auto"]}
      tickFormatter={(value: number) => formatValue(value)}
    />
  );
  const grid = <CartesianGrid vertical={false} strokeOpacity={0.6} />;
  const tooltip = (
    <ChartTooltip
      cursor={kind === "bar" ? { fillOpacity: 0.08 } : true}
      content={
        <ChartTooltipContent
          labelFormatter={(_, payload) => {
            const date = (payload?.[0]?.payload as Point | undefined)?.date;
            return date ? formatIsoDate(date, "long") : "";
          }}
          formatter={(value) => (
            <div className="flex w-full items-center justify-between gap-4">
              <span className="text-muted-foreground">{label}</span>
              <span className="font-semibold text-foreground tabular-nums">{formatValue(Number(value))}</span>
            </div>
          )}
        />
      }
    />
  );
  const markerLine = marker ? (
    <ReferenceLine
      x={marker.date}
      stroke="var(--muted-foreground)"
      strokeDasharray="4 4"
      label={{
        value: marker.label,
        position: "insideTopLeft",
        fill: "var(--muted-foreground)",
        fontSize: 11,
      }}
    />
  ) : null;

  return (
    <ChartContainer
      config={config}
      className="aspect-auto w-full"
      style={{ height }}
      role="img"
      aria-label={ariaLabel}
    >
      {kind === "bar" ? (
        <BarChart data={data} margin={{ top: 16, right: 4, left: 0, bottom: 0 }} barCategoryGap={2}>
          {grid}
          {xAxis}
          {yAxis}
          {tooltip}
          {markerLine}
          <Bar
            dataKey="value"
            fill="var(--color-value)"
            radius={[4, 4, 0, 0]}
            maxBarSize={24}
            animationDuration={ANIMATION_MS}
          />
        </BarChart>
      ) : (
        <LineChart data={data} margin={{ top: 16, right: 8, left: 0, bottom: 0 }}>
          {grid}
          {xAxis}
          {yAxis}
          {tooltip}
          {markerLine}
          <Line
            dataKey="value"
            type="monotone"
            stroke="var(--color-value)"
            strokeWidth={2}
            dot={false}
            activeDot={{ r: 4, strokeWidth: 2, stroke: "var(--card)" }}
            connectNulls
            animationDuration={ANIMATION_MS}
          />
        </LineChart>
      )}
    </ChartContainer>
  );
}
