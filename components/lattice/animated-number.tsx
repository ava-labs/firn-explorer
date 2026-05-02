"use client";

import { useEffect, useRef } from "react";
import { animate, motion, useMotionValue, useTransform } from "motion/react";

/**
 * Smoothly animates from the previous render's value to the next value.
 * Uses motion.dev's `animate()` driver — no easing config needed for short
 * spans; it auto-tunes a quick ease-out. Renders inside `motion.span`.
 *
 *   <AnimatedNumber value={stats.totalBlocks} />
 *
 * String values that look like big-int counters (`"3527"`) are accepted and
 * coerced to `Number`. For values >= 2^53 we fall back to a non-animated
 * display rather than lose precision.
 */
export function AnimatedNumber({
  value,
  duration = 0.6,
  format,
  className,
  style,
}: {
  value: number | string | null | undefined;
  /** Animation duration in seconds. Default 0.6s — fast enough for live feeds. */
  duration?: number;
  /** Optional formatter for the rendered string (defaults to toLocaleString). */
  format?: (n: number) => string;
  className?: string;
  style?: React.CSSProperties;
}) {
  const numeric = toFiniteNumber(value);
  const initial = useRef<number | null>(numeric);
  const motionValue = useMotionValue(numeric ?? 0);
  const display = useTransform(motionValue, (v) =>
    format ? format(v) : Math.round(v).toLocaleString(),
  );

  useEffect(() => {
    if (numeric == null) return;
    if (initial.current == null) {
      // First non-null value — snap, don't animate.
      motionValue.set(numeric);
      initial.current = numeric;
      return;
    }
    const controls = animate(motionValue, numeric, {
      duration,
      ease: [0.22, 1, 0.36, 1],
    });
    return controls.stop;
  }, [numeric, duration, motionValue]);

  if (numeric == null) {
    // Pre-data state — render the raw string (caller usually shows a
    // skeleton instead but defending against undefined is cheap).
    return (
      <span className={className} style={style}>
        —
      </span>
    );
  }

  return (
    <motion.span className={className} style={style}>
      {display}
    </motion.span>
  );
}

function toFiniteNumber(v: number | string | null | undefined): number | null {
  if (v == null || v === "") return null;
  const n = typeof v === "number" ? v : Number(v);
  if (!Number.isFinite(n)) return null;
  // Above 2^53, JS Number loses integer precision. Fail gracefully.
  if (Math.abs(n) >= 2 ** 53) return null;
  return n;
}
