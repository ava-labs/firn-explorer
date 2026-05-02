"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import { AvalancheLogo } from "./avalanche-logo";
import { ThemeToggle } from "./theme-toggle";
import { NetworkSwitcher } from "./network-switcher";
import { useChain } from "@/lib/api/queries";
import { useNetwork } from "@/lib/api/network";

const NAV: ReadonlyArray<{ slug: string; label: string; href: string }> = [
  { slug: "blocks", label: "Blocks", href: "/blocks" },
  { slug: "txs", label: "Transactions", href: "/transactions" },
  { slug: "tokens", label: "Tokens", href: "/tokens" },
  { slug: "icm", label: "ICM", href: "/icm" },
  { slug: "validators", label: "Validators", href: "/validators" },
  { slug: "api", label: "API", href: "/api" },
];

export function Topbar() {
  const pathname = usePathname();
  const router = useRouter();
  const [q, setQ] = useState("");
  const [focused, setFocused] = useState(false);
  const { data: chain, isPending: chainPending } = useChain();
  const { config } = useNetwork();
  const resolvedChainName = chain?.name?.trim();
  // Always render SOMETHING in the topbar — the moment a user clicks
  // "Testnet" the cache for that network is empty and useChain refetches,
  // so resolvedChainName is briefly undefined. Fall back to the network's
  // human label ("Local"/"Testnet"/"Mainnet") so the header never goes
  // blank. Once firn responds, we swap in the real chain name.
  const chainLabel = resolvedChainName ?? config.label;
  const inputRef = useRef<HTMLInputElement | null>(null);

  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "k") {
        e.preventDefault();
        const el = inputRef.current;
        if (!el) return;
        el.focus();
        el.select();
      }
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  const activeSlug = pathname.startsWith("/blocks")
    ? "blocks"
    : pathname.startsWith("/transactions")
      ? "txs"
      : pathname.startsWith("/tokens")
        ? "tokens"
        : pathname.startsWith("/icm")
          ? "icm"
          : pathname.startsWith("/validators")
            ? "validators"
            : pathname.startsWith("/api")
              ? "api"
              : "home";

  return (
    <header
      className="flex items-center gap-6 border-b border-line shrink-0"
      style={{
        paddingTop: 14,
        paddingBottom: 14,
        paddingLeft: 28,
        paddingRight: 28,
        // Sticky pinning + a faintly translucent surface that lets the
        // content barely show through as it scrolls underneath. The
        // backdrop-filter falls back gracefully on browsers without
        // support — opaque var(--bg) keeps it readable either way.
        position: "sticky",
        top: 0,
        zIndex: 30,
        background: "color-mix(in srgb, var(--bg) 88%, transparent)",
        backdropFilter: "saturate(140%) blur(8px)",
        WebkitBackdropFilter: "saturate(140%) blur(8px)",
      }}
    >
      {/* Left cluster — equal-weight with the right cluster so the centered
          search sits at the visual midpoint of the header. */}
      <div
        className="flex items-center gap-6 min-w-0"
        style={{ flex: 1, justifyContent: "flex-start" }}
      >
        <Link href="/" className="flex items-center gap-2.5 min-w-0">
          <AvalancheLogo size={22} color="var(--accent)" />
          <span
            className="font-display truncate"
            style={{
              fontWeight: 600,
              fontSize: 16,
              letterSpacing: "-0.01em",
              // Slightly dim the fallback label so the chain name reads
              // as "real" once firn responds — feels like the name is
              // resolving rather than swapping.
              color: resolvedChainName ? "var(--ink)" : "var(--ink-3)",
              opacity: !resolvedChainName && chainPending ? 0.85 : 1,
              transition: "color 180ms ease, opacity 180ms ease",
            }}
            title={chainLabel}
          >
            {chainLabel}
          </span>
        </Link>
      </div>

      <form
        role="search"
        onSubmit={(e) => {
          e.preventDefault();
          const trimmed = q.trim();
          if (!trimmed) return;
          router.push(`/search?q=${encodeURIComponent(trimmed)}`);
        }}
        className="flex items-center gap-2.5 border rounded-full bg-bg-elev"
        style={{
          borderColor: focused ? "var(--ink-3)" : "var(--line)",
          padding: "9px 14px",
          fontFamily: "var(--font-mono)",
          fontSize: 12.5,
          color: "var(--ink-3)",
          width: "100%",
          maxWidth: 560,
          flexShrink: 1,
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
          ref={inputRef}
          placeholder="Search by address / txn hash / block / token"
          value={q}
          onChange={(e) => setQ(e.target.value)}
          onFocus={() => setFocused(true)}
          onBlur={() => setFocused(false)}
          onKeyDown={(e) => {
            if (e.key === "Escape") {
              e.currentTarget.blur();
            }
          }}
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
      </form>

      {/* Right cluster — mirror of the left cluster's flex weight. */}
      <div className="flex items-center gap-4" style={{ flex: 1, justifyContent: "flex-end" }}>
        <nav className="flex gap-0.5">
          {NAV.map((item) => (
            <Link
              key={item.slug}
              href={item.href}
              className="px-2.5 py-1.5 rounded-md transition-colors"
              style={{
                fontSize: 13,
                color: activeSlug === item.slug ? "var(--ink)" : "var(--ink-3)",
                background: activeSlug === item.slug ? "var(--bg-sunken)" : "transparent",
                textDecoration: "none",
              }}
            >
              {item.label}
            </Link>
          ))}
        </nav>
        <NetworkSwitcher />
        <ThemeToggle />
      </div>
    </header>
  );
}
