"use client";

import { useEffect, useRef, useState } from "react";

/**
 * Live-updating sparkline driven by wall-clock time over a fixed window.
 *
 * Each sample carries the wall-clock time it arrived. On every animation
 * frame the path is recomputed with `x = width * (1 - age/WINDOW_MS)`,
 * so the line slides leftward at exactly the wall-clock rate and never
 * lurches because of a misjudged tween duration.
 *
 * History (so future-me doesn't re-make the same mistake):
 *
 *  v1 — translateX over EMA(dtMs).
 *       Cancel-and-snap on overlapping ticks → "skip back, slide again."
 *
 *  v2 — wall-clock positioning, but `windowMs = visibleCount * msPerSample`
 *       where msPerSample was an EMA of inter-tick wall-clock.
 *       Whenever the EMA shifted (chain warming up, network jitter), every
 *       sample's x recomputed → visible mid-chart "step" / catch-up jump.
 *       New samples were also stagger-stamped at `t = now - i*msPerSample`
 *       which gapped or overlapped against the previous newest sample
 *       depending on EMA convergence — second source of jumps.
 *
 *  v3 (this) — fixed WINDOW_MS, no per-sample interval estimate at all.
 *       New samples (including a K-block batch) all stamp `t = now`. They
 *       share x and (because the backend already smooths to a rolling
 *       average) share y, collapsing visually to one point on the right
 *       edge. Previous samples scroll left at a constant pixel-velocity =
 *       width / WINDOW_MS px per ms. No EMA, no positioning drift, no
 *       discontinuities.
 *
 * y-scale: pinned at 0 below (TPS is non-negative; grounding the area at
 * zero matches the visual convention readers expect from a throughput
 * chart). Top is an EMA-tracked max with 1.1× headroom so the line sits
 * a bit below the top edge instead of pegging it.
 */

// Visible time window. 17s covers the bootstrap N=50 samples at the
// SSE feed's 333ms cadence (≈16.65s of history), so first paint looks
// full. Short enough that real load shifts are visible within a few
// seconds. NOT user-tunable — making the window depend on observed
// arrival rate is exactly what caused the v2 glitches.
const WINDOW_MS = 17_000;

// Visual headroom above the EMA-tracked max — the y-range is `max * Y_HEADROOM`
// so the line sits ~10% below the top edge when values are pegged at the
// tracked maximum. Without this, a steady chain at 40 tx/s draws a line
// hugging the top with all the visual area below it empty.
const Y_HEADROOM = 1.1;

export function Sparkline({
  data: incoming,
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
  // Samples currently inside (or recently outside) the visible window.
  const samplesRef = useRef<{ v: number; t: number }[]>([]);
  const lastIncomingRef = useRef<number[] | undefined>(undefined);

  // Force a re-render every animation frame so the path tracks wall
  // clock without depending on tick arrivals. RAF coalesces with the
  // browser's compositor — even on idle chains the chart slides smoothly.
  const [, force] = useState(0);
  useEffect(() => {
    let alive = true;
    let raf = 0;
    const loop = () => {
      if (!alive) return;
      force((n) => (n + 1) | 0);
      raf = requestAnimationFrame(loop);
    };
    raf = requestAnimationFrame(loop);
    return () => {
      alive = false;
      cancelAnimationFrame(raf);
    };
  }, []);

  // Ingest new data. Diffs against the last seen `incoming` array to
  // identify the K samples that just appeared at the right end and
  // stamps them with `t = now`. Multi-block batches all share `t`, so
  // they collapse to a single point on the right edge — visually fine
  // because the backend produces an identical rolling-average value
  // for every sample in a single shift.
  useEffect(() => {
    if (!incoming || incoming.length < 2) return;

    const prev = lastIncomingRef.current;
    const now = performance.now();

    if (!prev) {
      // First load — backfill with timestamps spread evenly across
      // WINDOW_MS so the chart looks "full" on initial paint instead
      // of starting with one fresh sample at the right edge.
      const dt = WINDOW_MS / Math.max(1, incoming.length - 1);
      samplesRef.current = incoming.map((v, i) => ({
        v,
        t: now - (incoming.length - 1 - i) * dt,
      }));
      // Seed the y-scale max so the first paint isn't compressed
      // against y=1 (the useRef initial value) while the EMA catches up.
      yScaleRef.current.max = Math.max(1, ...incoming);
      lastIncomingRef.current = incoming;
      return;
    }

    if (prev === incoming) return;

    const K = detectShift(prev, incoming);
    if (K === 0) {
      // Refetch landed identical values. Nothing to stamp.
      lastIncomingRef.current = incoming;
      return;
    }

    // Stamp all K newly-arrived samples at the same wall-clock time.
    // We don't know the precise arrival time of the in-between blocks
    // (the SSE merge-flush coalesced them) and synthesizing a stagger
    // creates positioning discontinuities — see header for details.
    const newOnes = incoming.slice(incoming.length - K).map((v) => ({ v, t: now }));

    // Append, then trim anything older than the window (with a small
    // grace margin so a sample that just fell off doesn't pop visibly
    // when wall-clock drifts inside a single frame).
    const cutoff = now - WINDOW_MS * 1.2;
    const merged = [...samplesRef.current, ...newOnes];
    while (merged.length > 1 && merged[0].t < cutoff) merged.shift();
    samplesRef.current = merged;

    // Update y-scale max ONLY here (per-tick) — not in render. With
    // ~5% natural variance in the rolling-average backend output, a
    // per-frame Math.max(samples) jitters max ~3px between frames and
    // produces visible vertical wobble even on a steady chain. Updating
    // at sample-ingest cadence (~3Hz) makes the y-scale stable between
    // ticks; the line slides left smoothly without retracing.
    const observedMax = Math.max(1, ...merged.map((s) => s.v));
    const prevMax = yScaleRef.current.max;
    yScaleRef.current.max =
      observedMax > prevMax ? observedMax : prevMax * 0.95 + observedMax * 0.05;

    lastIncomingRef.current = incoming;
  }, [incoming]);

  // EMA-smoothed max with 1.1× headroom. Per-frame decay rate (0.92) is
  // applied at RAF cadence (~60Hz), so τ ≈ 0.2s — the chart adapts
  // quickly when load drops but doesn't snap on a single noisy sample.
  const yScaleRef = useRef<{ max: number }>({ max: 1 });

  // Compute the path inline. RAF re-renders make this cheap to recompute.
  // (Don't memo here — refs aren't observable by React, so the obvious
  // useMemo with `[force]` deps would never invalidate. v2 shipped that
  // bug; the chart was stuck blank.)
  const samples = samplesRef.current;
  let d = "";
  let dArea = "";
  let ready = false;
  if (samples.length >= 2) {
    // y-scale max comes from the ingest path (per-tick), not per-frame.
    // Reading the ref is fine in render — refs are stable across renders.
    const range = Math.max(1, yScaleRef.current.max * Y_HEADROOM);

    const now = performance.now();
    const pts: Array<[number, number]> = samples.map((s) => {
      const age = now - s.t;
      const x = width - (age / WINDOW_MS) * width;
      const y = height - (s.v / range) * (height - 6) - 3;
      return [x, y];
    });

    d = catmullRomToBezier(pts);
    const lastX = pts[pts.length - 1][0];
    const firstX = pts[0][0];
    dArea = `${d} L${lastX},${height} L${firstX},${height} Z`;
    ready = true;
  }

  if (!ready) {
    return <svg width={fluid ? "100%" : width} height={height} aria-hidden />;
  }

  return (
    <svg
      width={fluid ? "100%" : width}
      height={height}
      viewBox={`0 0 ${width} ${height}`}
      preserveAspectRatio={fluid ? "none" : "xMidYMid meet"}
      className="block"
      aria-hidden
      style={{ overflow: "hidden" }}
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
    </svg>
  );
}

/**
 * Returns how many slots `curr` is shifted left compared to `prev`.
 * Specifically, finds the smallest K such that curr[i] === prev[i+K]
 * for all valid i. Returns 0 when the windows are identical (a refetch
 * with no new data) and prev.length when nothing aligns.
 */
function detectShift(prev: number[], curr: number[]): number {
  if (prev.length === 0) return curr.length;
  if (prev.length !== curr.length) return curr.length;
  for (let K = 0; K < prev.length; K++) {
    let match = true;
    for (let i = 0; i + K < prev.length; i++) {
      if (prev[i + K] !== curr[i]) {
        match = false;
        break;
      }
    }
    if (match) return K;
  }
  return prev.length;
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
