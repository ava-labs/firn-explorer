"use client";

import { CopyButton } from "./copy-button";

export function Hash({
  value,
  link = false,
  href,
  length = 10,
  className = "",
  showCopy = true,
}: {
  value: string;
  link?: boolean;
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
  return (
    <span className={`hash-link ${className}`}>
      {link ? (
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
