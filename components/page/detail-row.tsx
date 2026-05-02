"use client";

import type { ReactNode } from "react";

/**
 * Two-column key/value row used on every detail page (block, transaction,
 * address, ICM message…). Eyebrow-styled label on the left, body on the
 * right, separated by a fixed 180px column. Renders as a fragment so
 * callers compose it inside a parent `display: grid` with the matching
 * `gridTemplateColumns: "180px 1fr"`.
 *
 * Why a fragment instead of its own grid: detail pages already wrap many
 * rows in one outer grid for consistent column gutters and row gaps —
 * making each row its own grid would break that alignment.
 *
 * NOTE: address/[hash] is owned by Phase 1; if/when that file is opened
 * for refactor, switch its inline `DetailRow` to this shared one.
 */
export function DetailRow({ label, children }: { label: ReactNode; children: ReactNode }) {
  return (
    <>
      <div
        style={{
          fontSize: 12,
          color: "var(--ink-4)",
          textTransform: "uppercase",
          letterSpacing: "0.05em",
          fontFamily: "var(--font-mono), ui-monospace, monospace",
        }}
      >
        {label}
      </div>
      <div style={{ fontSize: 13.5 }}>{children}</div>
    </>
  );
}
