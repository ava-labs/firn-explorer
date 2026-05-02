"use client";

import type { CSSProperties, ReactNode } from "react";
import { Skeleton } from "@/components/ui/skeleton";

/**
 * KPI cell used in the 4–5 column header strips on detail/index pages
 * (home stats, token detail, block detail, address detail).
 *
 * `value` accepts either a string or a ReactNode (so callers can pass
 * `<AnimatedNumber/>` or rich children); pass `null` to render the
 * loading skeleton instead.
 *
 * NOTE: address/[hash] is owned by Phase 1 and still has its own
 * `HeaderCell`. When that file is reopened, switch to this with
 * `valueSize=48` for the leftmost (balance) cell and `divider` on the
 * inner cells.
 */
export function KpiCell({
  label,
  value,
  sub,
  /** Display number font size. Defaults to 26 (block detail / tokens detail / home all live within 22-28). */
  valueSize = 26,
  /** Whether the embedded skeleton renders compact (default) or wide. */
  skeleton = "compact",
  divider = false,
  /** Drop left padding when this is the leftmost cell of a `border-top` strip. Used by home. */
  first = false,
  padding,
}: {
  label: string;
  value: ReactNode | null;
  sub?: ReactNode;
  valueSize?: number;
  skeleton?: "compact" | "wide";
  divider?: boolean;
  first?: boolean;
  padding?: string;
}) {
  const computedPadding = padding ?? (first ? "20px 16px 0 0" : "20px 18px");
  const skeletonClass = skeleton === "wide" ? "h-7 w-32" : "h-7 w-24";

  const style: CSSProperties = {
    padding: computedPadding,
    borderRight: divider ? "1px solid var(--line)" : undefined,
  };

  return (
    <div style={style}>
      <div className="eyebrow mb-2.5">{label}</div>
      <div className="h-display" style={{ fontSize: valueSize }}>
        {value ?? <Skeleton className={skeletonClass} />}
      </div>
      {sub != null ? (
        <div className="mono mt-1.5" style={{ fontSize: 11.5, color: "var(--ink-4)" }}>
          {sub}
        </div>
      ) : null}
    </div>
  );
}
