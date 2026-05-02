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
      className="border-t border-line"
      style={{
        marginTop: 48,
        padding: "20px 28px",
        fontSize: 12.5,
        color: "var(--ink-3)",
        display: "grid",
        gridTemplateColumns: "1fr auto 1fr",
        alignItems: "center",
        gap: 16,
      }}
    >
      <span style={{ justifySelf: "start" }}>
        Crafted with{" "}
        <span aria-label="love" role="img" style={{ color: "var(--accent)" }}>
          ❤️
        </span>{" "}
        by the Ava Labs DevRel team.
      </span>
      <a
        href="https://github.com/ava-labs/firn"
        target="_blank"
        rel="noreferrer"
        style={{
          justifySelf: "center",
          color: "var(--ink-2)",
          textDecoration: "none",
          fontFamily: "var(--font-mono)",
          fontSize: 12,
          display: "inline-flex",
          alignItems: "center",
          gap: 6,
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
        style={{
          justifySelf: "end",
          color: "var(--ink-2)",
          textDecoration: "none",
          fontFamily: "var(--font-mono)",
          fontSize: 12,
        }}
      >
        build.avax.network ↗
      </a>
    </footer>
  );
}
