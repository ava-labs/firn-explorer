function GitHubMark({ size = 14 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 16 16" fill="currentColor" aria-hidden>
      <path
        fillRule="evenodd"
        clipRule="evenodd"
        d="M8 0C3.58 0 0 3.58 0 8a8 8 0 0 0 5.47 7.59c.4.07.55-.17.55-.38 0-.19-.01-.82-.01-1.49-2.01.37-2.53-.49-2.69-.94-.09-.23-.48-.94-.82-1.13-.28-.15-.68-.52-.01-.53.63-.01 1.08.58 1.23.82.72 1.21 1.87.87 2.33.66.07-.52.28-.87.51-1.07-1.78-.2-3.64-.89-3.64-3.95 0-.87.31-1.59.82-2.15-.08-.2-.36-1.02.08-2.12 0 0 .67-.21 2.2.82.64-.18 1.32-.27 2-.27.68 0 1.36.09 2 .27 1.53-1.04 2.2-.82 2.2-.82.44 1.1.16 1.92.08 2.12.51.56.82 1.27.82 2.15 0 3.07-1.87 3.75-3.65 3.95.29.25.54.73.54 1.48 0 1.07-.01 1.93-.01 2.2 0 .21.15.46.55.38A8.01 8.01 0 0 0 16 8c0-4.42-3.58-8-8-8Z"
      />
    </svg>
  );
}

export function Footer() {
  return (
    <footer
      className="border-t border-line mt-12 px-4 sm:px-7 py-5 text-ink-3"
      style={{
        fontSize: 12.5,
      }}
    >
      {/* Mobile: 2 stacked rows (credit on top, links inline below).
          sm+: the inner wrapper becomes `display: contents` so the
          anchors participate directly in the 3-column grid layout
          alongside the credit span. */}
      <div className="flex flex-col items-center gap-2 text-center sm:grid sm:grid-cols-[1fr_auto_1fr] sm:gap-4 sm:items-center sm:text-left">
        <span className="sm:justify-self-start">
          Crafted with{" "}
          <span aria-label="love" role="img" style={{ color: "var(--accent)" }}>
            ❤️
          </span>{" "}
          by the Ava Labs DevRel team.
        </span>
        <div
          className="flex flex-wrap items-center justify-center gap-x-4 gap-y-1.5 sm:contents"
          style={{ fontFamily: "var(--font-mono)", fontSize: 12 }}
        >
          <a
            href="https://github.com/ava-labs/firn"
            target="_blank"
            rel="noreferrer"
            className="inline-flex items-center gap-1.5 sm:justify-self-center"
            style={{
              color: "var(--ink-2)",
              textDecoration: "none",
            }}
          >
            <span style={{ color: "var(--ink-4)" }}>Powered by</span>
            <GitHubMark size={14} />
            firn ↗
          </a>
          <a
            href="https://build.avax.network"
            target="_blank"
            rel="noreferrer"
            className="sm:justify-self-end"
            style={{
              color: "var(--ink-2)",
              textDecoration: "none",
            }}
          >
            build.avax.network ↗
          </a>
        </div>
      </div>
    </footer>
  );
}
