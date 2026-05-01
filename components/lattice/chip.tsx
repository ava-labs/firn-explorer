import type { ReactNode } from "react";

type ChipTone = "default" | "good" | "bad" | "steel";

export function Chip({
  children,
  tone = "default",
  className = "",
}: {
  children: ReactNode;
  tone?: ChipTone;
  className?: string;
}) {
  const toneClass = tone === "default" ? "" : tone;
  return <span className={`chip ${toneClass} ${className}`.trim()}>{children}</span>;
}
