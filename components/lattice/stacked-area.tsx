"use client";

/**
 * Stacked-area chart for category-bucketed time series. Inputs are the
 * shape firn's `/v1/stats/methods` returns: an array of points, each
 * with `ts` and a `by` map of category → count. Categories are
 * union'd across all points; missing values default to 0.
 *
 * Visual contract:
 *   - x: chronological, evenly spaced (no wall-clock — like Sparkline)
 *   - y: stacked totals, oldest series at the bottom
 *   - one filled path per category, ordered by overall share desc so
 *     the dominant bucket sits at the bottom and short-tail rides on
 *     top (matches reader expectation)
 *   - "Other" always at the very top in neutral grey
 *
 * Same `preserveAspectRatio="none"` trick as Sparkline so the chart
 * fills its container width without distorting the path's vertical
 * resolution.
 */

export interface StackedAreaPoint {
  ts: string;
  by: Record<string, number>;
}

export interface CategoryColor {
  label: string;
  color: string;
}

// Deterministic palette. Uses OKLCH so the colors look balanced in
// dark mode and stay distinguishable for color-vision-deficient users
// (different hue + similar chroma).
const PALETTE: Record<string, string> = {
  Swap: "oklch(0.62 0.2 25)", // coral red
  Transfer: "oklch(0.6 0.13 230)", // steel blue
  Mint: "oklch(0.7 0.13 60)", // amber
  Burn: "oklch(0.5 0.12 30)", // brick
  Approve: "oklch(0.6 0.12 180)", // teal
  ICM: "oklch(0.65 0.16 295)", // purple
  Stake: "oklch(0.62 0.13 145)", // green
  "Native transfer": "oklch(0.6 0.04 240)", // dim slate
};
const FALLBACK_PALETTE = [
  "oklch(0.65 0.14 50)",
  "oklch(0.6 0.14 200)",
  "oklch(0.62 0.13 320)",
  "oklch(0.7 0.1 100)",
  "oklch(0.55 0.12 270)",
];
const OTHER_COLOR = "var(--ink-4)";

export function categoryColor(label: string, fallbackIndex: number): string {
  if (PALETTE[label]) return PALETTE[label];
  if (label === "Other") return OTHER_COLOR;
  return FALLBACK_PALETTE[fallbackIndex % FALLBACK_PALETTE.length];
}

export function StackedArea({
  data,
  width = 1000,
  height = 280,
  topN = 5,
}: {
  data: StackedAreaPoint[];
  width?: number;
  height?: number;
  /** Keep top-N categories as colored stacks; fold the rest into "Other". */
  topN?: number;
}) {
  if (!data || data.length === 0) {
    return (
      <svg
        width="100%"
        height={height}
        viewBox={`0 0 ${width} ${height}`}
        preserveAspectRatio="none"
        aria-hidden
      />
    );
  }

  // Aggregate totals per category across the whole window — used for
  // share % (legend) and to decide which categories survive vs. fold
  // into Other.
  const totals = new Map<string, number>();
  for (const p of data) {
    for (const [k, v] of Object.entries(p.by)) {
      totals.set(k, (totals.get(k) ?? 0) + v);
    }
  }
  const ordered = [...totals.entries()].sort((a, b) => b[1] - a[1]);
  const top = ordered.slice(0, topN).map(([label, total]) => ({ label, total }));
  const tail = ordered.slice(topN);
  const tailTotal = tail.reduce((a, [, v]) => a + v, 0);
  const series: Array<{ label: string; total: number; color: string }> = top.map((t, i) => ({
    ...t,
    color: categoryColor(t.label, i),
  }));
  if (tailTotal > 0) {
    series.push({ label: "Other", total: tailTotal, color: OTHER_COLOR });
  }
  const grandTotal = series.reduce((a, s) => a + s.total, 0);

  // Per-point stacking. yTotal is the height (in series-units) at each
  // sample, scaled to fit `height - pad` at the maximum.
  const labels = series.map((s) => s.label);
  const yTotals = data.map((p) => {
    let sum = 0;
    for (const l of labels) sum += p.by[l] ?? 0;
    if ("Other" in p.by && labels.includes("Other")) {
      // already included
    } else if (labels.includes("Other")) {
      // synthesize Other from labels NOT in `top`
      const known = new Set(top.map((t) => t.label));
      let other = 0;
      for (const [k, v] of Object.entries(p.by)) {
        if (!known.has(k)) other += v;
      }
      sum += other;
    }
    return sum;
  });
  const yMax = Math.max(1, ...yTotals) * 1.05;

  const n = data.length;
  const pad = 4;
  const xAt = (i: number) => (n === 1 ? width / 2 : (i * (width - pad * 2)) / (n - 1) + pad);
  const yAt = (cum: number) => height - (cum / yMax) * (height - 4) - 2;

  // Per-category cumulative arrays. Index 0 is the bottom of stack 0
  // (which is the highest-share series, drawn at the bottom visually).
  // We render series in REVERSE order so the topmost path covers the
  // lower stacks correctly (last-drawn wins in SVG).
  const cumBelow: number[][] = Array(n)
    .fill(null)
    .map(() => []);
  for (let pi = 0; pi < n; pi++) {
    let acc = 0;
    for (const s of series) {
      cumBelow[pi].push(acc);
      const known = new Set(top.map((t) => t.label));
      const val =
        s.label === "Other"
          ? Object.entries(data[pi].by)
              .filter(([k]) => !known.has(k))
              .reduce((a, [, v]) => a + v, 0)
          : (data[pi].by[s.label] ?? 0);
      acc += val;
    }
  }

  // Build paths bottom-up for correct stacking.
  const paths = series.map((s, sIdx) => {
    const top: string[] = [];
    const bottom: string[] = [];
    for (let pi = 0; pi < n; pi++) {
      const x = xAt(pi);
      const known = new Set(series.slice(0, sIdx).map((q) => q.label));
      const knownTop = new Set(top.map((q) => q));
      void knownTop;
      const yBelow = cumBelow[pi][sIdx];
      const knownLabels = new Set(["Other", ...series.map((q) => q.label)]);
      void knownLabels;
      void known;
      const val =
        s.label === "Other"
          ? Object.entries(data[pi].by)
              .filter(([k]) => !labels.slice(0, sIdx).includes(k))
              .reduce((a, [, v]) => a + v, 0)
          : (data[pi].by[s.label] ?? 0);
      const yAbove = yBelow + val;
      top.push(`${pi === 0 ? "M" : "L"}${x.toFixed(2)},${yAt(yAbove).toFixed(2)}`);
      bottom.push(`L${x.toFixed(2)},${yAt(yBelow).toFixed(2)}`);
    }
    bottom.reverse();
    return { d: top.join(" ") + " " + bottom.join(" ") + " Z", color: s.color };
  });

  return (
    <div style={{ width: "100%" }}>
      <svg
        width="100%"
        height={height}
        viewBox={`0 0 ${width} ${height}`}
        preserveAspectRatio="none"
        className="block"
        aria-hidden
      >
        {paths.map((p, i) => (
          <path key={i} d={p.d} fill={p.color} stroke="none" opacity={0.92} />
        ))}
      </svg>
      {/* Legend */}
      <ul
        className="mono mt-2 flex flex-wrap"
        style={{ listStyle: "none", margin: 0, padding: 0, fontSize: 11.5, gap: "6px 18px" }}
      >
        {series.map((s) => {
          const pct = grandTotal > 0 ? (s.total / grandTotal) * 100 : 0;
          return (
            <li
              key={s.label}
              className="flex items-center gap-1.5"
              style={{ color: "var(--ink-3)" }}
            >
              <span
                style={{
                  width: 9,
                  height: 9,
                  borderRadius: 2,
                  background: s.color,
                  display: "inline-block",
                  flex: "none",
                }}
              />
              <span style={{ color: "var(--ink-2)" }}>{s.label}</span>
              <span style={{ color: "var(--ink-4)", fontVariantNumeric: "tabular-nums" }}>
                {pct >= 10 ? pct.toFixed(0) : pct.toFixed(1)}%
              </span>
            </li>
          );
        })}
      </ul>
    </div>
  );
}
