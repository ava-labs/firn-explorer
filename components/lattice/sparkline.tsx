"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { animate, motion, useMotionValue } from "motion/react";

/**
 * A live-updating sparkline that scrolls horizontally instead of morphing.
 *
 * The "treadmill" pattern: we render N+1 points where the leftmost is a
 * phantom (the value that's about to scroll off the left edge) and the
 * rightmost is the new sample (initially just past the right edge of the
 * SVG). When a new block lands, we tween a single `translateX` from 0 to
 * `-step` over the inter-block interval. After the animation completes,
 * the phantom is dropped and translateX snaps back to 0.
 *
 * Why this beats path morphing:
 *
 *  - Morphing animates each point's y-value at a fixed x-position. With
 *    incoming data that's been shifted left by one slot, every point's
 *    y-value changes (each becomes its old neighbor's value). The eye
 *    sees this as **vertical wobble** at every column, not a horizontal
 *    scroll. At 100ms block rates the wobble overlaps and reads as jank.
 *
 *  - The treadmill keeps the path's geometry frozen during the animation
 *    and just slides the entire group. The eye sees a single, continuous
 *    horizontal motion at constant velocity. Looks the same at 100ms or
 *    2s block rates.
 *
 * y-scale stability: we track an exponentially smoothed max so individual
 * peaks don't snap the entire chart vertically. Min is pinned at 0 — TPS
 * is never negative and grounding the area at zero matches the visual
 * convention readers expect from a throughput chart.
 */
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
  // Buffer of values currently on screen. Length is `incoming.length`
  // when settled, or `incoming.length + 1` while the phantom-leftmost is
  // sliding off during a scroll animation.
  const [buffer, setBuffer] = useState<number[]>(() => incoming?.slice() ?? []);
  const tx = useMotionValue(0);

  // Inter-update interval, exponentially smoothed so the scroll velocity
  // doesn't lurch on a single anomalous block time.
  const intervalRef = useRef<number>(700);
  const lastTickRef = useRef<number>(0);
  const lastIncomingRef = useRef<number[] | undefined>(undefined);
  const animRef = useRef<{ stop(): void } | null>(null);

  // Keep the visible count stable across buffer-size flips so geometry
  // doesn't snap when the phantom is trimmed.
  const visibleCount = incoming?.length ?? 0;
  const step = visibleCount > 1 ? width / (visibleCount - 1) : 0;

  useEffect(() => {
    if (!incoming || incoming.length < 2) return;

    // First-ever frame: adopt without animation.
    if (!lastIncomingRef.current) {
      setBuffer(incoming.slice());
      lastIncomingRef.current = incoming;
      lastTickRef.current = performance.now();
      tx.set(0);
      return;
    }

    if (lastIncomingRef.current === incoming) return;

    // How many positions has the window shifted left since last render?
    // Returns 0 when the data is unchanged (refetch with identical
    // values), 1 for the typical single-block case, K>1 when the WS
    // merge-flush coalesced multiple blocks into one update.
    const prev = lastIncomingRef.current;
    const K = detectShift(prev, incoming);
    if (K === 0) {
      lastIncomingRef.current = incoming;
      return;
    }

    // Cancel + commit any in-flight animation so we always start a new
    // scroll from a settled state. At sub-100ms block rates the previous
    // animation may not have finished by the time the next batch lands.
    if (animRef.current) {
      animRef.current.stop();
      animRef.current = null;
    }
    setBuffer((b) => (b.length > visibleCount ? b.slice(b.length - visibleCount) : b));
    tx.set(0);

    // Smoothed inter-update interval. EMA with α=0.4 — responsive enough
    // to track block-time changes (e.g. chain warming up from 1s to 100ms),
    // smoothed enough to absorb single-block jitter.
    const now = performance.now();
    if (lastTickRef.current !== 0) {
      const dt = now - lastTickRef.current;
      intervalRef.current = intervalRef.current * 0.6 + dt * 0.4;
    }
    lastTickRef.current = now;
    const dtMs = Math.max(60, Math.min(2000, intervalRef.current));

    // Build the N+K buffer. The K phantoms on the left are the K oldest
    // samples that just rolled off (taken from the previous settled
    // buffer); they're already at the right screen positions to start
    // sliding off. The animation translates the whole group by -K*step
    // so the chart scrolls a constant pixel-velocity regardless of
    // whether one block or three landed in this batch.
    setBuffer((curr) => {
      const settled = curr.length === visibleCount ? curr : prev.slice(0, visibleCount);
      const phantoms = settled.slice(0, Math.min(K, settled.length));
      return [...phantoms, ...incoming];
    });

    tx.set(0);
    const controls = animate(tx, -K * step, {
      duration: dtMs / 1000,
      ease: "linear",
      onComplete: () => {
        // Settle: drop K phantoms, snap translateX. Idempotent against
        // out-of-order completion when another animation kicks in.
        setBuffer((b) => (b.length > visibleCount ? b.slice(b.length - visibleCount) : b));
        tx.set(0);
        animRef.current = null;
      },
    });
    animRef.current = controls;
    lastIncomingRef.current = incoming;
  }, [incoming, step, visibleCount, tx]);

  // Cancel any in-flight animation on unmount so we don't fire setState
  // on a torn-down component.
  useEffect(
    () => () => {
      animRef.current?.stop();
    },
    [],
  );

  // EMA-smoothed max for vertical stability. min is pinned at 0 — TPS
  // is non-negative, and grounding at 0 matches the area-fill convention.
  const yScaleRef = useRef<{ max: number }>({ max: 1 });
  const { d, dArea, ready } = useMemo(() => {
    if (!buffer || buffer.length < 2) return { d: "", dArea: "", ready: false };

    const observed = Math.max(1, Math.max(...buffer));
    // Allow max to track upward quickly (don't clip new peaks) but decay
    // slowly when the chart calms down. Prevents the whole line from
    // snapping vertically when one outlier rotates out.
    const prevMax = yScaleRef.current.max;
    const next = observed > prevMax ? observed : prevMax * 0.92 + observed * 0.08;
    yScaleRef.current.max = next;
    const min = 0;
    const max = next;
    const range = Math.max(1, max - min);

    const pts: Array<[number, number]> = buffer.map((v, i) => [
      i * step,
      height - ((v - min) / range) * (height - 6) - 3,
    ]);
    const d = catmullRomToBezier(pts);
    // Close the area down to the baseline at the same x-extent as the
    // line, not the SVG width — buffers of length N+1 extend one step
    // past the right edge of the viewBox, and we want the fill to follow.
    const lastX = pts[pts.length - 1][0];
    const firstX = pts[0][0];
    const dArea = `${d} L${lastX},${height} L${firstX},${height} Z`;
    return { d, dArea, ready: true };
  }, [buffer, step, height]);

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
      <motion.g style={{ x: tx }}>
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
      </motion.g>
    </svg>
  );
}

/**
 * Returns how many slots `curr` is shifted left compared to `prev`.
 * Specifically, finds the smallest K such that curr[i] === prev[i+K]
 * for all valid i. Returns 0 when the windows are identical (a refetch
 * with no new data) and prev.length when nothing aligns.
 *
 * Tolerance is exact equality on numbers — TPS samples are derived
 * from integer transaction counts and a stable averageBlockTimeMs, so
 * identical underlying blocks produce identical floats. If the source
 * data ever introduces drift (e.g. averageBlockTimeMs is recomputed
 * each tick) we'd want a small epsilon here, but for now exact match
 * keeps detection unambiguous.
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
