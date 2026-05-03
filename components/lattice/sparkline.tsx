"use client";

import { useEffect, useState } from "react";

/**
 * Index-based sparkline. Points are spread evenly across the width and
 * the newest sample is pinned to the right edge (x = width). No wall-
 * clock animation: when a new sample arrives, every point shifts one
 * slot left in a single render. The backend already smooths the series
 * (rolling average per block), so the visual step is small and reads
 * as a steady line rather than a treadmill scroll.
 *
 * History (so future-me doesn't re-make the same mistake):
 *
 *  v1 — translateX over EMA(dtMs).
 *       Cancel-and-snap on overlapping ticks → "skip back, slide again."
 *
 *  v2 — wall-clock x = width * (1 - age/windowMs), windowMs derived from
 *       an EMA of inter-tick wall-clock. EMA shifts (warm-up, jitter)
 *       recomputed every sample's x → mid-chart "step" / catch-up jumps.
 *
 *  v3 — fixed WINDOW_MS, RAF re-render, samples timestamped on arrival.
 *       Smooth in steady state but the continuous leftward slide read
 *       as a "treadmill" and made the line feel busier than the data.
 *
 *  v4 (this) — drop wall-clock entirely. Render `data` directly with
 *       x = i * width / (n-1); newest at x=width. React re-renders on
 *       data change; no RAF loop, no per-sample timestamps.
 *
 * y-scale: pinned at 0 below (TPS is non-negative; grounding the area at
 * zero matches the visual convention readers expect from a throughput
 * chart). Top is an EMA-tracked max with 1.1× headroom so the line sits
 * a bit below the top edge instead of pegging it.
 */

// Visual headroom above the EMA-tracked max — the y-range is `max * Y_HEADROOM`
// so the line sits ~10% below the top edge when values are pegged at the
// tracked maximum. Without this, a steady chain at 40 tx/s draws a line
// hugging the top with all the visual area below it empty.
const Y_HEADROOM = 1.1;

export function Sparkline({
  data,
  width = 240,
  height = 56,
  color = "var(--accent)",
  area = true,
  fluid = false,
  strokeWidth,
  areaOpacity = 0.08,
}: {
  data: number[];
  width?: number;
  height?: number;
  color?: string;
  area?: boolean;
  fluid?: boolean;
  strokeWidth?: number;
  areaOpacity?: number;
}) {
  // EMA-smoothed max so the y-axis doesn't jitter ~3px per sample on a
  // chain with natural ~5% variance. Fast adapt up, slow decay down.
  // Lives in state so the smoothed value survives across renders without
  // tripping react-hooks/refs (we used to mutate a ref during render).
  const [smoothedMax, setSmoothedMax] = useState(1);
  useEffect(() => {
    if (!data || data.length < 2) return;
    const observed = Math.max(1, ...data);
    // Derived-state-from-props with a decay term that needs the previous
    // render's value — there is no purely-functional formulation. The
    // setState-in-effect pattern here is intentional; the cascading
    // render is at most one extra commit per data tick, which already
    // re-rendered for the new sample.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setSmoothedMax((prev) => (observed > prev ? observed : prev * 0.95 + observed * 0.05));
  }, [data]);

  if (!data || data.length < 2) {
    return <svg width={fluid ? "100%" : width} height={height} aria-hidden />;
  }

  // Use the larger of the smoothed value and the current observed max so
  // the *current* render is never below-axis when a new max lands faster
  // than the effect can fire.
  const range = Math.max(1, Math.max(smoothedMax, ...data) * Y_HEADROOM);

  const n = data.length;
  const step = width / (n - 1);
  const pts: Array<[number, number]> = data.map((v, i) => {
    const x = i * step;
    const y = height - (v / range) * (height - 6) - 3;
    return [x, y];
  });

  const d = catmullRomToBezier(pts);
  const lastX = pts[pts.length - 1][0];
  const lastY = pts[pts.length - 1][1];
  const firstX = pts[0][0];
  const dArea = `${d} L${lastX},${height} L${firstX},${height} Z`;

  // Live cursor: a pulsing dot pinned to the newest sample so the eye
  // can read the current value and direction at a glance. Insetting the
  // x coordinate by the halo radius keeps the dot fully inside the
  // viewbox. With overflow:visible the halo can pulse past the right
  // edge without being clipped, so we keep dotX pinned to lastX (no
  // inset) — eye reads the cursor as the chart's "current value" tip.
  const dotX = Math.max(0, Math.min(width, lastX));
  const dotY = Math.max(0, Math.min(height, lastY));

  return (
    <svg
      width={fluid ? "100%" : width}
      height={height}
      viewBox={`0 0 ${width} ${height}`}
      preserveAspectRatio={fluid ? "none" : "xMidYMid meet"}
      className="block"
      aria-hidden
      style={{ overflow: "visible" }}
    >
      {area ? <path d={dArea} fill={color} opacity={areaOpacity} /> : null}
      <path
        d={d}
        stroke={color}
        strokeWidth={strokeWidth ?? 1.6}
        fill="none"
        strokeLinecap="round"
        strokeLinejoin="round"
        vectorEffect={fluid ? "non-scaling-stroke" : undefined}
      />
      <circle cx={dotX} cy={dotY} r={5} fill={color} opacity={0.3}>
        <animate
          attributeName="r"
          values="5;11;5"
          dur="1.6s"
          repeatCount="indefinite"
          calcMode="spline"
          keySplines="0.4 0 0.6 1; 0.4 0 0.6 1"
        />
        <animate
          attributeName="opacity"
          values="0.5;0;0.5"
          dur="1.6s"
          repeatCount="indefinite"
          calcMode="spline"
          keySplines="0.4 0 0.6 1; 0.4 0 0.6 1"
        />
      </circle>
      <circle cx={dotX} cy={dotY} r={3.5} fill={color} />
    </svg>
  );
}

/**
 * Convert a polyline through `pts` into a smooth cubic-Bezier path.
 *
 * Centripetal Catmull-Rom-to-Bezier: for each segment p1 → p2, derive
 * control points from neighbours p0 and p3. Endpoints duplicate so the
 * curve doesn't bow outward beyond the data range.
 */
function catmullRomToBezier(pts: ReadonlyArray<readonly [number, number]>): string {
  if (pts.length === 0) return "";
  if (pts.length === 1) return `M${pts[0][0]},${pts[0][1]}`;

  const out: string[] = [`M${pts[0][0]},${pts[0][1]}`];
  for (let i = 0; i < pts.length - 1; i++) {
    const p0 = pts[i - 1] ?? pts[i];
    const p1 = pts[i];
    const p2 = pts[i + 1];
    const p3 = pts[i + 2] ?? pts[i + 1];

    const c1x = p1[0] + (p2[0] - p0[0]) / 6;
    const c1y = p1[1] + (p2[1] - p0[1]) / 6;
    const c2x = p2[0] - (p3[0] - p1[0]) / 6;
    const c2y = p2[1] - (p3[1] - p1[1]) / 6;

    out.push(`C${c1x},${c1y} ${c2x},${c2y} ${p2[0]},${p2[1]}`);
  }
  return out.join(" ");
}
