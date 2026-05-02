"use client";

import { CopyButton } from "./copy-button";

type HashTone = "link" | "plain" | "dim" | "from" | "to";

export function Hash({
  value,
  tone = "link",
  href,
  length = 10,
  className = "",
  showCopy = false,
}: {
  value: string;
  /**
   * Color treatment. All tones become clickable when `href` is provided —
   * `tone` only controls color, never whether the anchor renders.
   *
   *   link  — accent-red, the default for "this is the primary clickable id"
   *   plain — ink-2, neutral foreground
   *   dim   — ink-3, secondary foreground
   *   from  — ink-3, sender-colored (mirrors the "from" column convention)
   *   to    — ink, recipient-colored (slightly brighter than `from` so the
   *           sender → recipient direction reads at a glance)
   */
  tone?: HashTone;
  href?: string;
  length?: number;
  className?: string;
  showCopy?: boolean;
}) {
  if (!value) return null;
  const short =
    length > 0 && value.length > length + 4
      ? `${value.slice(0, length)}…${value.slice(-4)}`
      : value;

  const toneClass = tone === "link" ? "hash-link" : "mono";
  const toneStyle: React.CSSProperties | undefined = (() => {
    switch (tone) {
      case "plain":
        return { color: "var(--ink-2)" };
      case "dim":
      case "from":
        return { color: "var(--ink-3)" };
      case "to":
        return { color: "var(--ink)" };
      default:
        return undefined;
    }
  })();

  // Any tone is clickable when `href` is provided. The `.hash-anchor` rule
  // makes inner anchors inherit color from the surrounding span (so the
  // tone wins) and brightens to --ink on hover. tone="link" still uses the
  // legacy `.hash-link a` styling so the accent-red default doesn't change.
  const inner =
    href != null && tone !== "link" ? (
      <a href={href} className="hash-anchor">
        {short}
      </a>
    ) : tone === "link" && href ? (
      <a href={href}>{short}</a>
    ) : (
      short
    );

  return (
    <span className={`${toneClass} ${className}`.trim()} style={toneStyle}>
      {inner}
      {showCopy ? <CopyButton text={value} /> : null}
    </span>
  );
}
