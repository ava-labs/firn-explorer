"use client";

/**
 * Inline error band used above a list/table when the underlying query
 * fails. Same accent-soft tinted card as the rest of the explorer — see
 * the duplicated inline copies that previously lived in
 * /transactions, /icm, /blocks/:id, and the /address tabs.
 *
 * Single line of detail (`message`) is monospace because the error
 * usually comes straight off firn (`API_ERROR: not_found`) and reading
 * it as code is the point.
 */
export function ErrorBanner({
  title,
  message,
  className = "",
}: {
  title: string;
  message?: string | null;
  className?: string;
}) {
  return (
    <div
      className={`border rounded-md p-4 mb-6 ${className}`.trim()}
      style={{
        borderColor: "var(--accent-soft)",
        background: "var(--accent-soft)",
        color: "var(--accent-ink)",
        fontSize: 13,
      }}
    >
      <div style={{ fontWeight: 500, marginBottom: 4 }}>{title}</div>
      {message ? (
        <div className="mono" style={{ fontSize: 11.5, color: "var(--ink-3)" }}>
          {message}
        </div>
      ) : null}
    </div>
  );
}
