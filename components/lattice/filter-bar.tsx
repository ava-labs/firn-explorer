"use client";

import type { CSSProperties, ReactNode } from "react";

/**
 * Shared filter UI primitives for the listing pages. The pattern is
 * the same everywhere — a row of compact inputs / pills above the
 * table, with a "Reset" affordance when any filter is active. Pages
 * own their filter state and the API parameters; this file just
 * standardises the visual language.
 */

export function FilterBar({
  children,
  active,
  onReset,
  count,
}: {
  children: ReactNode;
  active: boolean;
  onReset?: () => void;
  /** Optional "X results" indicator on the right side. */
  count?: ReactNode;
}) {
  return (
    <div className="flex flex-wrap items-center gap-2 mb-4" style={{ rowGap: 8 }}>
      {children}
      {active && onReset ? (
        <button
          type="button"
          onClick={onReset}
          style={{
            fontSize: 11.5,
            color: "var(--ink-3)",
            background: "transparent",
            border: "none",
            padding: "4px 8px",
            cursor: "pointer",
            textDecoration: "underline",
            textUnderlineOffset: 3,
          }}
        >
          reset
        </button>
      ) : null}
      {count ? (
        <span className="mono ml-auto" style={{ fontSize: 11.5, color: "var(--ink-4)" }}>
          {count}
        </span>
      ) : null}
    </div>
  );
}

/**
 * A compact text input styled to match the topbar's search field —
 * pill-shaped, 12.5px mono, focus-aware border. Use for address /
 * hash / message-ID inputs.
 */
export function FilterInput({
  value,
  onChange,
  placeholder,
  width = 220,
  monospace = true,
  type = "text",
  ariaLabel,
}: {
  value: string;
  onChange: (next: string) => void;
  placeholder?: string;
  width?: number;
  monospace?: boolean;
  type?: "text" | "number";
  ariaLabel?: string;
}) {
  return (
    <input
      type={type}
      value={value}
      onChange={(e) => onChange(e.target.value)}
      placeholder={placeholder}
      aria-label={ariaLabel ?? placeholder}
      className="bg-bg-elev border outline-none"
      style={{
        // `width` is the desktop intent. Cap it to 100% of the wrapping
        // FilterBar so a 300px filter doesn't push the row past the
        // viewport edge on a phone — the FilterBar already uses
        // flex-wrap, this just keeps the individual cell from exceeding
        // its row.
        width,
        maxWidth: "100%",
        // Floor the input height so it never falls below the iOS
        // tap-target minimum on phones (the default `height: 30` is the
        // desktop dense form height).
        height: 30,
        minHeight: 30,
        padding: "0 12px",
        borderRadius: 999,
        borderColor: "var(--line)",
        fontFamily: monospace ? "var(--font-mono)" : undefined,
        fontSize: 12,
        color: "var(--ink)",
        caretColor: "var(--accent)",
        transition: "border-color 120ms ease",
      }}
      onFocus={(e) => {
        e.currentTarget.style.borderColor = "var(--ink-3)";
      }}
      onBlur={(e) => {
        e.currentTarget.style.borderColor = "var(--line)";
      }}
    />
  );
}

/**
 * A toggleable pill — used for enum filters like status (success /
 * failed) or kind (warp / teleporter). Visual matches the existing
 * `FilterChip` from app/icm/page.tsx so we don't end up with two
 * "active pill" looks across the explorer.
 */
export function FilterPill({
  active,
  onClick,
  children,
  title,
}: {
  active: boolean;
  onClick: () => void;
  children: ReactNode;
  title?: string;
}) {
  const baseStyle: CSSProperties = {
    fontSize: 12,
    padding: "5px 12px",
    borderRadius: 999,
    border: "1px solid var(--line)",
    background: active ? "var(--bg-sunken)" : "transparent",
    color: active ? "var(--ink)" : "var(--ink-3)",
    cursor: "pointer",
    height: 30,
    lineHeight: "20px",
    transition: "background 120ms ease, color 120ms ease, border-color 120ms ease",
  };
  return (
    <button type="button" onClick={onClick} style={baseStyle} title={title} aria-pressed={active}>
      {children}
    </button>
  );
}

/**
 * A grouped pill row — visual sugar around a single filter dimension
 * with N options. Renders the options as `FilterPill`s with a small
 * leading label.
 */
export function FilterPillGroup<T extends string>({
  label,
  value,
  options,
  onChange,
}: {
  label?: string;
  value: T;
  options: ReadonlyArray<{ value: T; label: ReactNode; title?: string }>;
  onChange: (next: T) => void;
}) {
  return (
    <div className="inline-flex items-center gap-2">
      {label ? <span style={{ fontSize: 11.5, color: "var(--ink-4)" }}>{label}</span> : null}
      <div className="inline-flex gap-1">
        {options.map((o) => (
          <FilterPill
            key={o.value}
            active={value === o.value}
            onClick={() => onChange(o.value)}
            title={o.title}
          >
            {o.label}
          </FilterPill>
        ))}
      </div>
    </div>
  );
}
