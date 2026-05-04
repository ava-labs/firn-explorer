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
 *
 * Single-point degenerate case: when the window only has one bucket
 * with data (chain is younger than the window, or only the most
 * recent hour saw activity) we render full-width horizontal stacked
 * bars instead of a path. A path through one point collapses to a
 * single x-coord and renders as nothing.
 */

export interface StackedAreaPoint {
  ts: string;
  by: Record<string, number>;
}

// Deterministic palette. OKLCH hues are chosen to read balanced in
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

  // Aggregate totals per category across the whole window — used both
  // for the share % legend and to decide which categories survive vs.
  // fold into Other.
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
  const knownTopSet = new Set(top.map((t) => t.label));

  // Resolve per-point per-category value. "Other" is the sum of any
  // category in the point that isn't in the topN set.
  function valueAt(pi: number, label: string): number {
    if (label === "Other") {
      let s = 0;
      for (const [k, v] of Object.entries(data[pi].by)) {
        if (!knownTopSet.has(k)) s += v;
      }
      return s;
    }
    return data[pi].by[label] ?? 0;
  }

  // Per-point stacked totals — needed for the y-axis ceiling.
  const yTotals = data.map((_, pi) => series.reduce((a, s) => a + valueAt(pi, s.label), 0));
  const yMax = Math.max(1, ...yTotals) * 1.05;
  const yAt = (cum: number) => height - (cum / yMax) * (height - 4) - 2;

  const n = data.length;
  const pad = 4;

  // Single-bucket degenerate case: render as horizontal stacked bars
  // spanning the full width. Reads as "this window total split by
  // category" without the visual ambiguity of a 1-px-wide path.
  if (n === 1) {
    const left = pad;
    const right = width - pad;
    // Pre-compute the cumulative stack so the JSX map below stays
    // purely functional (no in-render mutation, eslint-clean under
    // react-hooks/immutability).
    const cumulative: number[] = [];
    {
      let running = 0;
      for (const s of series) {
        cumulative.push(running);
        running += valueAt(0, s.label);
      }
    }
    const bars = series.map((s, i) => {
      const yBelow = cumulative[i];
      const yAbove = yBelow + valueAt(0, s.label);
      return {
        s,
        y: yAt(yAbove),
        h: yAt(yBelow) - yAt(yAbove),
      };
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
          {bars.map((b, i) => (
            <rect
              key={i}
              x={left}
              y={b.y}
              width={right - left}
              height={Math.max(0, b.h)}
              fill={b.s.color}
              opacity={0.92}
            />
          ))}
        </svg>
        <Legend series={series} grandTotal={grandTotal} />
      </div>
    );
  }

  // Normal path: ≥2 points → cumulative-stack polygons.
  const xAt = (i: number) => (i * (width - pad * 2)) / (n - 1) + pad;

  // Per-point cumulative sum BELOW each series, computed once. cumBelow[pi][si]
  // is the stack height at point pi underneath series si.
  const cumBelow: number[][] = Array.from({ length: n }, () => []);
  for (let pi = 0; pi < n; pi++) {
    let acc = 0;
    for (const s of series) {
      cumBelow[pi].push(acc);
      acc += valueAt(pi, s.label);
    }
  }

  // Build paths bottom-up. SVG draws last-on-top, but we use independent
  // closed polygons so order only matters for visual layering when
  // alpha is < 1. Each polygon is `top edge L→R` + `bottom edge R→L`.
  const paths = series.map((s, sIdx) => {
    const topEdge: string[] = [];
    const bottomEdge: string[] = [];
    for (let pi = 0; pi < n; pi++) {
      const x = xAt(pi);
      const yBelow = cumBelow[pi][sIdx];
      const yAbove = yBelow + valueAt(pi, s.label);
      topEdge.push(`${pi === 0 ? "M" : "L"}${x.toFixed(2)},${yAt(yAbove).toFixed(2)}`);
      bottomEdge.push(`L${x.toFixed(2)},${yAt(yBelow).toFixed(2)}`);
    }
    bottomEdge.reverse();
    return { d: topEdge.join(" ") + " " + bottomEdge.join(" ") + " Z", color: s.color };
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
      <Legend series={series} grandTotal={grandTotal} />
    </div>
  );
}

function Legend({
  series,
  grandTotal,
}: {
  series: Array<{ label: string; total: number; color: string }>;
  grandTotal: number;
}) {
  return (
    <ul
      className="mono mt-2 flex flex-wrap"
      style={{ listStyle: "none", margin: 0, padding: 0, fontSize: 11.5, gap: "6px 18px" }}
    >
      {series.map((s) => {
        const pct = grandTotal > 0 ? (s.total / grandTotal) * 100 : 0;
        return (
          <li key={s.label} className="flex items-center gap-1.5" style={{ color: "var(--ink-3)" }}>
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
  );
}
