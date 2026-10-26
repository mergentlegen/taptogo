"use client";

import dynamic from "next/dynamic";
import type { ComponentProps } from "react";

import { Skeleton } from "@/components/ui/skeleton";

import type { TimeSeriesChart as TimeSeriesChartImpl } from "./time-series-chart-impl";

export type { ValueFormat } from "./time-series-chart-impl";

type Props = ComponentProps<typeof TimeSeriesChartImpl>;

/**
 * The chart is drawn in the browser only: the plotting library measures its container,
 * so the server could render nothing useful anyway, and keeping it out of the server
 * bundle matters on hosts that limit the size of the server code (Cloudflare Workers).
 */
const LazyChart = dynamic(() => import("./time-series-chart-impl").then((m) => m.TimeSeriesChart), {
  ssr: false,
  loading: () => <ChartPlaceholder />,
});

function ChartPlaceholder() {
  return <Skeleton aria-hidden className="h-[220px] w-full" />;
}

export function TimeSeriesChart(props: Props) {
  return <LazyChart {...props} />;
}
