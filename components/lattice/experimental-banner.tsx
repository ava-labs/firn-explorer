// Sitewide warning banner. Mounted above <Topbar/> in app/layout.tsx
// so every route renders it on first paint. Plain block (not sticky):
// it scrolls past on the user's first scroll and the sticky topbar
// takes over — that's the right amount of insistent without nagging.
// Server component on purpose; no dismiss state, no client JS.

export function ExperimentalBanner() {
  return (
    <div
      role="status"
      aria-label="Experimental build notice"
      className="border-b border-line text-[12px] sm:text-[13px] text-ink-2"
      style={{
        background: "color-mix(in oklch, var(--warn) 14%, var(--bg))",
      }}
    >
      <div className="mx-auto max-w-[1400px] px-4 sm:px-6 py-2 flex items-center gap-2.5 flex-wrap justify-center">
        <span
          className="inline-flex items-center rounded px-1.5 py-0.5 font-mono text-[10px] sm:text-[11px] font-semibold tracking-wider uppercase text-ink"
          style={{
            background: "color-mix(in oklch, var(--warn) 32%, transparent)",
            border: "1px solid color-mix(in oklch, var(--warn) 55%, transparent)",
          }}
        >
          Experimental
        </span>
        <span>Testing build — expect outages, data resets, and breaking changes.</span>
      </div>
    </div>
  );
}
