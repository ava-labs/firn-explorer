"use client";

import { CopyButton } from "./copy-button";

type HashTone = "link" | "plain" | "dim";

export function Hash({
  value,
  tone = "link",
  href,
  length = 10,
  className = "",
  showCopy = false,
}: {
  value: string;
  /** link = accent-red link styling, plain = ink-2, dim = ink-3 */
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

  const toneClass =
    tone === "link" ? "hash-link" : "mono";
  const toneStyle =
    tone === "plain"
      ? { color: "var(--ink-2)" }
      : tone === "dim"
        ? { color: "var(--ink-3)" }
        : undefined;

  return (
    <span className={`${toneClass} ${className}`.trim()} style={toneStyle}>
      {tone === "link" ? (
        <a
          href={href ?? "#"}
          onClick={(e) => {
            if (!href) e.preventDefault();
          }}
        >
          {short}
        </a>
      ) : (
        short
      )}
      {showCopy ? <CopyButton text={value} /> : null}
    </span>
  );
}
