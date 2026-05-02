"use client";

import { useState } from "react";

export function CopyButton({ text, size = 12 }: { text: string; size?: number }) {
  const [copied, setCopied] = useState(false);

  return (
    <button
      type="button"
      onClick={(e) => {
        e.stopPropagation();
        e.preventDefault();
        navigator.clipboard?.writeText(text);
        setCopied(true);
        setTimeout(() => setCopied(false), 900);
      }}
      title={copied ? "Copied" : "Copy"}
      className="inline-flex items-center align-middle ml-1.5 cursor-pointer text-ink-4 hover:text-ink-2"
    >
      {copied ? (
        <svg width={size} height={size} viewBox="0 0 16 16" fill="none">
          <path
            d="M3 8.5l3 3 7-7"
            stroke="currentColor"
            strokeWidth="1.6"
            strokeLinecap="round"
            strokeLinejoin="round"
          />
        </svg>
      ) : (
        <svg width={size} height={size} viewBox="0 0 16 16" fill="none">
          <rect x="4" y="4" width="9" height="9" rx="1.5" stroke="currentColor" strokeWidth="1.3" />
          <rect
            x="2"
            y="2"
            width="9"
            height="9"
            rx="1.5"
            stroke="currentColor"
            strokeWidth="1.3"
            fill="var(--bg-elev)"
          />
        </svg>
      )}
    </button>
  );
}
