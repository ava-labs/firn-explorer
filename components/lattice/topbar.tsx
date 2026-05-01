"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useState } from "react";
import { TriangleMark } from "./triangle-mark";
import { ThemeToggle } from "./theme-toggle";

const NAV: ReadonlyArray<{ slug: string; label: string; href: string }> = [
  { slug: "blocks", label: "Blocks", href: "/blocks" },
  { slug: "txs", label: "Transactions", href: "/transactions" },
];

export function Topbar() {
  const pathname = usePathname();
  const [q, setQ] = useState("");
  const [focused, setFocused] = useState(false);

  const activeSlug = pathname.startsWith("/blocks")
    ? "blocks"
    : pathname.startsWith("/transactions")
      ? "txs"
      : "home";

  return (
    <header
      className="flex items-center gap-6 px-7 py-3.5 border-b border-line bg-bg shrink-0"
      style={{ paddingTop: 14, paddingBottom: 14, paddingLeft: 28, paddingRight: 28 }}
    >
      <Link href="/" className="flex items-center gap-2.5">
        <TriangleMark size={22} color="var(--ink)" />
        <span
          className="font-display"
          style={{
            fontWeight: 600,
            fontSize: 16,
            letterSpacing: "-0.01em",
            color: "var(--ink)",
          }}
        >
          Lattice
        </span>
        <span
          style={{ color: "var(--ink-4)", fontWeight: 400, marginLeft: 4, fontSize: 16 }}
        >
          Explorer
        </span>
      </Link>

      <ChainPill />

      <div
        className="flex items-center gap-2.5 border rounded-full bg-bg-elev"
        style={{
          borderColor: focused ? "var(--ink-3)" : "var(--line)",
          padding: "9px 14px",
          fontFamily: "var(--font-mono)",
          fontSize: 12.5,
          color: "var(--ink-3)",
          flex: 1,
          maxWidth: 560,
        }}
      >
        <svg
          width="14"
          height="14"
          viewBox="0 0 16 16"
          fill="none"
          style={{ color: "var(--ink-4)" }}
          aria-hidden
        >
          <circle cx="7" cy="7" r="4.5" stroke="currentColor" strokeWidth="1.4" />
          <path d="M11 11l3 3" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" />
        </svg>
        <input
          placeholder="Search by address / txn hash / block / token"
          value={q}
          onChange={(e) => setQ(e.target.value)}
          onFocus={() => setFocused(true)}
          onBlur={() => setFocused(false)}
          className="flex-1 bg-transparent border-0 outline-none text-ink"
          style={{ font: "inherit", caretColor: "var(--accent)" }}
        />
        <span
          style={{
            fontFamily: "var(--font-mono)",
            fontSize: 10.5,
            color: "var(--ink-4)",
            border: "1px solid var(--line)",
            borderRadius: 4,
            padding: "1px 5px",
          }}
        >
          ⌘K
        </span>
      </div>

      <nav className="flex gap-0.5 ml-auto">
        {NAV.map((item) => (
          <Link
            key={item.slug}
            href={item.href}
            className="px-2.5 py-1.5 rounded-md transition-colors"
            style={{
              fontSize: 13,
              color:
                activeSlug === item.slug ? "var(--ink)" : "var(--ink-3)",
              background:
                activeSlug === item.slug ? "var(--bg-sunken)" : "transparent",
              textDecoration: "none",
            }}
          >
            {item.label}
          </Link>
        ))}
      </nav>

      <ThemeToggle />
    </header>
  );
}

function ChainPill() {
  return (
    <div
      className="inline-flex items-center gap-2 border rounded-full bg-bg-elev cursor-pointer select-none"
      style={{
        padding: "5px 10px 5px 6px",
        borderColor: "var(--line)",
        fontSize: 12,
        color: "var(--ink-2)",
      }}
      title="Connected chain"
    >
      <span
        className="rounded-full grid place-items-center text-white"
        style={{
          width: 16,
          height: 16,
          background: "var(--accent)",
          fontFamily: "var(--font-mono)",
          fontSize: 9,
          fontWeight: 700,
        }}
      >
        A
      </span>
      <span style={{ fontWeight: 500, color: "var(--ink)" }}>Avalanche</span>
      <span style={{ color: "var(--ink-4)", fontFamily: "var(--font-mono)" }}>L1</span>
    </div>
  );
}
