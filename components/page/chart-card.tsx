"use client";

import { Sparkline } from "@/components/lattice/sparkline";
import { Skeleton } from "@/components/ui/skeleton";

/**
 * Card wrapper around `<Sparkline>` that matches the visual language of
 * the home page chart strip: a dim eyebrow above (range marker), the
 * sparkline body, and a `now` value pinned to the right. Sized to drop
 * into a 2-column grid on lg+ and stack on mobile.
 *
 * The data series is the firn-side smoothed window (50 points, rolling
 * average per block) — caller fetches via `useExplorerBootstrap` and
 * passes the array straight through. `yMax` is for series with an
 * absolute ceiling (e.g. gas utilization 0–100); throughput-style series
 * pass nothing and let the EMA-tracked max scale the chart.
 */
export function ChartCard({
  title,
  unit,
  series,
  color = "var(--accent)",
  yMax,
}: {
  title: string;
  unit: string;
  series: number[] | undefined;
  color?: string;
  yMax?: number;
}) {
  const ready = series && series.length >= 2;
  const last = ready ? series[series.length - 1] : null;
  const lastDisplay =
    last == null
      ? "—"
      : unit === "%"
        ? `${Math.round(last)}%`
        : `${last >= 100 ? Math.round(last) : last.toFixed(1)} ${unit}`;

  return (
    <div className="card border border-line rounded-[10px] bg-bg-elev" style={{ padding: 18 }}>
      {ready ? (
        <Sparkline fluid height={68} data={series} yMax={yMax} color={color} />
      ) : (
        <Skeleton className="h-[68px] w-full" />
      )}
      <div className="grid items-baseline mt-1.5" style={{ gridTemplateColumns: "1fr auto 1fr" }}>
        <span className="eyebrow" style={{ textAlign: "left" }}>
          {ready ? `Last ${series.length} blocks` : "—"}
        </span>
        <span className="eyebrow" style={{ textAlign: "center" }}>
          {title}
        </span>
        <span className="eyebrow" style={{ textAlign: "right", color: "var(--ink-3)" }}>
          Now · {lastDisplay}
        </span>
      </div>
    </div>
  );
}
