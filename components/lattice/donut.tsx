"use client";

/**
 * Donut chart with side legend. Groups slices by `key`, renders the top
 * N as colored arcs and rolls the rest into a single "Other" slice so
 * the legend doesn't explode on long-tail data.
 *
 * Sized to drop into the same chart card grid as Sparkline, so dimensions
 * are compact and the legend lives to the right of the donut on lg+.
 */
const PALETTE = [
  "var(--accent)",
  "var(--good)",
  "var(--warn)",
  "oklch(0.62 0.13 250)", // blue
  "oklch(0.65 0.16 295)", // purple
  "oklch(0.7 0.13 60)", // amber
];
const OTHER_COLOR = "var(--ink-4)";

export interface DonutSlice {
  label: string;
  value: number;
}

export function Donut({
  slices,
  topN = 5,
  size = 140,
  thickness = 14,
}: {
  slices: DonutSlice[];
  topN?: number;
  size?: number;
  thickness?: number;
}) {
  const total = slices.reduce((acc, s) => acc + s.value, 0);
  if (total <= 0) {
    return (
      <div
        style={{
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          width: size,
          height: size,
          color: "var(--ink-4)",
          fontSize: 11,
        }}
      >
        No data
      </div>
    );
  }

  // Sort desc, keep topN, fold rest into "Other".
  const sorted = [...slices].sort((a, b) => b.value - a.value);
  const head = sorted.slice(0, topN);
  const tail = sorted.slice(topN);
  const tailTotal = tail.reduce((acc, s) => acc + s.value, 0);
  const display: Array<DonutSlice & { color: string }> = head.map((s, i) => ({
    ...s,
    color: PALETTE[i % PALETTE.length],
  }));
  if (tailTotal > 0) display.push({ label: "Other", value: tailTotal, color: OTHER_COLOR });

  // SVG arc geometry. Outer radius is half the size; inner radius leaves
  // a `thickness` band. Start angle at -90° so the first slice begins at
  // 12 o'clock (matches reader expectations from pie charts).
  const r = size / 2;
  const ri = r - thickness;
  const cx = r;
  const cy = r;

  // Pre-compute the running total at each slice boundary so the JSX map
  // below stays purely functional — no in-render mutation, eslint-clean
  // under react-hooks/immutability.
  const cumulative: number[] = [];
  {
    let running = 0;
    for (const s of display) {
      cumulative.push(running);
      running += s.value;
    }
  }

  return (
    <div className="flex items-center gap-5">
      <svg
        width={size}
        height={size}
        viewBox={`0 0 ${size} ${size}`}
        aria-hidden
        style={{ flex: "none" }}
      >
        {display.map((s, idx) => {
          const start = (cumulative[idx] / total) * Math.PI * 2 - Math.PI / 2;
          const end = ((cumulative[idx] + s.value) / total) * Math.PI * 2 - Math.PI / 2;
          const large = end - start > Math.PI ? 1 : 0;

          // Single-slice (100%) edge case: SVG arc paths refuse to draw
          // a full circle in one command (start point == end point), so
          // fall back to two stacked half-circles via two arcs.
          if (display.length === 1) {
            return (
              <g key={idx}>
                <circle cx={cx} cy={cy} r={r} fill={s.color} />
                <circle cx={cx} cy={cy} r={ri} fill="var(--bg-elev)" />
              </g>
            );
          }

          const x1 = cx + r * Math.cos(start);
          const y1 = cy + r * Math.sin(start);
          const x2 = cx + r * Math.cos(end);
          const y2 = cy + r * Math.sin(end);
          const x3 = cx + ri * Math.cos(end);
          const y3 = cy + ri * Math.sin(end);
          const x4 = cx + ri * Math.cos(start);
          const y4 = cy + ri * Math.sin(start);

          const d = [
            `M ${x1},${y1}`,
            `A ${r},${r} 0 ${large} 1 ${x2},${y2}`,
            `L ${x3},${y3}`,
            `A ${ri},${ri} 0 ${large} 0 ${x4},${y4}`,
            "Z",
          ].join(" ");

          return <path key={idx} d={d} fill={s.color} />;
        })}
      </svg>
      <ul
        className="mono"
        style={{
          listStyle: "none",
          margin: 0,
          padding: 0,
          fontSize: 12,
          minWidth: 140,
        }}
      >
        {display.map((s) => {
          const pct = (s.value / total) * 100;
          return (
            <li
              key={s.label}
              className="flex items-center justify-between"
              style={{ padding: "3px 0", color: "var(--ink-2)" }}
            >
              <span className="flex items-center gap-2">
                <span
                  style={{
                    width: 9,
                    height: 9,
                    borderRadius: 2,
                    background: s.color,
                    flex: "none",
                  }}
                />
                <span style={{ color: "var(--ink-2)" }}>{s.label}</span>
              </span>
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
