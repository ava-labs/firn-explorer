"use client";

/**
 * Compact vertical bar chart for time-bucketed totals (e.g., gas used
 * by hour, txns per hour). Y is auto-scaled to the max bar with 10%
 * headroom; bars share `tone` for whichever metric is being shown
 * (`var(--ink-3)` for neutral chart usage). Highlights the peak bar
 * by tone-shifting it to `var(--ink-2)` so the eye finds the busy
 * window without a tooltip.
 *
 * Index-based: bars are laid out evenly across the width. Caller bins
 * the data and passes `bars: { label, value }[]` plus optional left/
 * right axis labels for the leading and trailing bins.
 */
export interface Bar {
  label: string;
  value: number;
}

export function BarChart({
  bars,
  width = 360,
  height = 88,
  tone = "var(--ink-4)",
  peakTone = "var(--ink-2)",
  fluid = false,
  leftLabel,
  rightLabel,
  peakLabel,
}: {
  bars: Bar[];
  width?: number;
  height?: number;
  tone?: string;
  peakTone?: string;
  fluid?: boolean;
  leftLabel?: string;
  rightLabel?: string;
  /** When set, the bar with this label is rendered at peakTone regardless
   *  of value (caller already knows which bin is the peak — usually max). */
  peakLabel?: string;
}) {
  const max = Math.max(1, ...bars.map((b) => b.value));
  const range = max * 1.1;
  const n = Math.max(1, bars.length);
  const pad = 4;
  // Each bar gets `barW` of the row, with a small gap between.
  const slot = (width - pad * 2) / n;
  const barW = Math.max(2, slot * 0.65);
  const peakIdx = peakLabel
    ? bars.findIndex((b) => b.label === peakLabel)
    : bars.findIndex((b) => b.value === max);

  return (
    <div style={{ position: "relative", width: fluid ? "100%" : width }}>
      <svg
        width={fluid ? "100%" : width}
        height={height}
        viewBox={`0 0 ${width} ${height}`}
        preserveAspectRatio={fluid ? "none" : "xMidYMid meet"}
        className="block"
        aria-hidden
      >
        {bars.map((b, i) => {
          const h = (b.value / range) * (height - 4);
          const x = pad + i * slot + (slot - barW) / 2;
          const y = height - h;
          const fill = i === peakIdx ? peakTone : tone;
          return <rect key={i} x={x} y={y} width={barW} height={h} fill={fill} rx={1.5} />;
        })}
      </svg>
      {leftLabel || rightLabel ? (
        <div
          className="grid items-baseline mt-1.5 mono"
          style={{
            gridTemplateColumns: "1fr auto 1fr",
            fontSize: 10.5,
            color: "var(--ink-4)",
            letterSpacing: "0.04em",
          }}
        >
          <span style={{ textAlign: "left" }}>{leftLabel ?? ""}</span>
          <span style={{ textAlign: "center", color: "var(--ink-3)" }}>
            {peakIdx >= 0 ? `peak ${bars[peakIdx]?.label}` : ""}
          </span>
          <span style={{ textAlign: "right" }}>{rightLabel ?? ""}</span>
        </div>
      ) : null}
    </div>
  );
}
