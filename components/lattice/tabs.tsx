"use client";

import type { ReactNode } from "react";

export interface TabItem {
  id: string;
  label: ReactNode;
  /** Optional pill count rendered after the label. */
  count?: number | string | null;
  /** When true, the tab is rendered but not interactive. */
  disabled?: boolean;
}

export function Tabs({
  tabs,
  active,
  onChange,
  className = "",
}: {
  tabs: ReadonlyArray<TabItem>;
  active: string;
  onChange: (id: string) => void;
  className?: string;
}) {
  return (
    <div className={`lat-tabs ${className}`.trim()} role="tablist">
      {tabs.map((t) => {
        const isActive = active === t.id;
        return (
          <button
            key={t.id}
            type="button"
            role="tab"
            aria-selected={isActive}
            disabled={t.disabled}
            className={`lat-tab ${isActive ? "active" : ""}`.trim()}
            onClick={() => {
              if (!t.disabled) onChange(t.id);
            }}
            style={t.disabled ? { opacity: 0.45, cursor: "not-allowed" } : undefined}
          >
            <span>{t.label}</span>
            {t.count != null && t.count !== "" ? <span className="count">{t.count}</span> : null}
          </button>
        );
      })}
    </div>
  );
}
