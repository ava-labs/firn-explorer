"use client";

import type { CSSProperties, ReactNode } from "react";

/**
 * A `<th>` that toggles sort direction on click and renders an arrow
 * indicating the current sort column. Designed for the listing pages
 * (blocks / transactions / ICM / tokens) where pagination is server-
 * driven (cursor, newest-first) and the local sort applies only to
 * the currently-loaded page.
 *
 * State management lives in the parent — pass the active sort key,
 * the active direction, and the column key for this header. Click
 * cycles desc → asc → desc on this column; clicking a different
 * column resets to desc.
 */
export type SortDir = "asc" | "desc";

export interface SortState<K extends string> {
  key: K;
  dir: SortDir;
}

export function SortableTh<K extends string>({
  k,
  active,
  onSort,
  align = "left",
  width,
  children,
}: {
  k: K;
  active: SortState<K> | null;
  onSort: (next: SortState<K>) => void;
  align?: "left" | "right";
  width?: number;
  children: ReactNode;
}) {
  const isActive = active?.key === k;
  const dir = isActive ? active!.dir : null;

  function handleClick() {
    if (!isActive) {
      onSort({ key: k, dir: "desc" });
      return;
    }
    onSort({ key: k, dir: dir === "desc" ? "asc" : "desc" });
  }

  const baseStyle: CSSProperties = {
    width,
    textAlign: align,
    cursor: "pointer",
    userSelect: "none",
    color: isActive ? "var(--ink)" : undefined,
    whiteSpace: "nowrap",
  };

  return (
    <th
      onClick={handleClick}
      style={baseStyle}
      aria-sort={dir === "asc" ? "ascending" : dir === "desc" ? "descending" : "none"}
    >
      <span
        style={{
          display: "inline-flex",
          alignItems: "center",
          gap: 4,
          flexDirection: align === "right" ? "row-reverse" : "row",
        }}
      >
        {children}
        <SortGlyph dir={dir} />
      </span>
    </th>
  );
}

function SortGlyph({ dir }: { dir: SortDir | null }) {
  const color = dir ? "var(--ink-2)" : "var(--ink-4)";
  return (
    <svg
      width="8"
      height="10"
      viewBox="0 0 8 10"
      aria-hidden
      style={{ display: "block", color, opacity: dir ? 1 : 0.5 }}
    >
      <path
        d="M4 1 L7 4 L1 4 Z"
        fill={dir === "asc" ? "currentColor" : "none"}
        stroke="currentColor"
        strokeWidth="0.9"
      />
      <path
        d="M4 9 L1 6 L7 6 Z"
        fill={dir === "desc" ? "currentColor" : "none"}
        stroke="currentColor"
        strokeWidth="0.9"
      />
    </svg>
  );
}

/**
 * Comparator helpers — the listing pages sort over heterogeneous
 * shapes (bigint-string, number, ISO date) so a single helper keeps
 * page code tidy.
 */
export function compareNumeric(
  a: number | string | undefined,
  b: number | string | undefined,
): number {
  const an = typeof a === "string" ? Number(a) : (a ?? 0);
  const bn = typeof b === "string" ? Number(b) : (b ?? 0);
  if (an === bn) return 0;
  return an < bn ? -1 : 1;
}

export function compareBig(a: string | undefined, b: string | undefined): number {
  try {
    const ai = BigInt(a ?? "0");
    const bi = BigInt(b ?? "0");
    if (ai === bi) return 0;
    return ai < bi ? -1 : 1;
  } catch {
    return 0;
  }
}

export function compareString(a: string | undefined | null, b: string | undefined | null): number {
  return (a ?? "").localeCompare(b ?? "");
}

export function compareDate(a: string | undefined, b: string | undefined): number {
  const ai = a ? Date.parse(a) : 0;
  const bi = b ? Date.parse(b) : 0;
  return ai - bi;
}

export function applyDir<T>(cmp: (a: T, b: T) => number, dir: SortDir): (a: T, b: T) => number {
  return dir === "asc" ? cmp : (a, b) => -cmp(a, b);
}
