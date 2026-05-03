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
  // Mobile-only: drives the hamburger drawer below the header.
  const [menuOpen, setMenuOpen] = useState(false);
  const { data: chain, isPending: chainPending } = useChain();
  const { config, tenant } = useNetwork();
  const resolvedChainName = chain?.name?.trim();
  // In tenant mode the tenant directory's label IS the user's
  // chainName (passed through quick-l1 → managed-nodes); firn's
  // /v1/chain.name is auto-generated ("L1 <id-prefix>") because firn
  // doesn't know the human name. Prefer tenant.label so the header
  // always shows what the user typed at deploy time, no flicker on
  // hydration. Apex mode keeps firn-name-first (it's the right
  // source there since there's no tenant context).
  const chainLabel = tenant ? tenant.label : (resolvedChainName ?? config.label);
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

  // Drawer auto-closes when a NAV link is tapped via the per-Link
  // onClick handler below; we deliberately avoid a pathname-effect that
  // would trip the react-hooks/set-state-in-effect rule.

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
      className="border-b border-line shrink-0"
      style={{
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
      {/* ────────────────────────────────────────────────────────────────
          DESKTOP (≥md): the original single-row layout. Logo+chain on the
          left, search centered, nav + network + theme on the right. Kept
          structurally identical to the pre-mobile version so desktop
          regressions are minimal.
       ──────────────────────────────────────────────────────────────── */}
      <div
        className="hidden md:flex items-center gap-6"
        style={{
          paddingTop: 14,
          paddingBottom: 14,
          paddingLeft: 28,
          paddingRight: 28,
        }}
      >
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

        <SearchForm
          q={q}
          setQ={setQ}
          focused={focused}
          setFocused={setFocused}
          inputRef={inputRef}
          router={router}
          showShortcut
        />

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
      </div>

      {/* ────────────────────────────────────────────────────────────────
          MOBILE (<md): two stacked rows.
            Row 1 — logo + chain label on the left, hamburger on the right.
            Row 2 — full-width search (16px font to defeat iOS auto-zoom).
          A drawer drops down below the header when the hamburger is
          tapped, containing the nav links, network switcher and theme
          toggle. Drawer + search both use horizontal padding that matches
          the page-shell breakpoints (px-4 sm:px-6).
       ──────────────────────────────────────────────────────────────── */}
      <div className="md:hidden">
        <div className="flex items-center justify-between gap-3 px-4 sm:px-6 py-3">
          <Link href="/" className="flex items-center gap-2.5 min-w-0">
            <AvalancheLogo size={22} color="var(--accent)" />
            <span
              className="font-display truncate"
              style={{
                fontWeight: 600,
                fontSize: 16,
                letterSpacing: "-0.01em",
                color: resolvedChainName ? "var(--ink)" : "var(--ink-3)",
                opacity: !resolvedChainName && chainPending ? 0.85 : 1,
                transition: "color 180ms ease, opacity 180ms ease",
              }}
              title={chainLabel}
            >
              {chainLabel}
            </span>
          </Link>
          <button
            type="button"
            onClick={() => setMenuOpen((v) => !v)}
            aria-label={menuOpen ? "Close menu" : "Open menu"}
            aria-expanded={menuOpen}
            aria-controls="mobile-nav-drawer"
            className="grid place-items-center border border-line rounded-md bg-bg-elev"
            style={{
              width: 36,
              height: 36,
              color: "var(--ink-2)",
              cursor: "pointer",
              flexShrink: 0,
            }}
          >
            {menuOpen ? <CloseIcon /> : <HamburgerIcon />}
          </button>
        </div>

        <div className="px-4 sm:px-6 pb-3">
          <SearchForm
            q={q}
            setQ={setQ}
            focused={focused}
            setFocused={setFocused}
            inputRef={inputRef}
            router={router}
            // Hide the ⌘K hint on phones — there's no keyboard.
            showShortcut={false}
            mobile
          />
        </div>

        {menuOpen ? (
          <div
            id="mobile-nav-drawer"
            className="border-t border-line px-4 sm:px-6 py-4 flex flex-col gap-4"
            style={{ background: "var(--bg-elev)" }}
          >
            <nav className="flex flex-col">
              {NAV.map((item) => (
                <Link
                  key={item.slug}
                  href={item.href}
                  onClick={() => setMenuOpen(false)}
                  className="rounded-md transition-colors"
                  style={{
                    fontSize: 15,
                    padding: "10px 12px",
                    color: activeSlug === item.slug ? "var(--ink)" : "var(--ink-2)",
                    background: activeSlug === item.slug ? "var(--bg-sunken)" : "transparent",
                    textDecoration: "none",
                  }}
                >
                  {item.label}
                </Link>
              ))}
            </nav>
            <div
              className="flex items-center justify-between gap-3 pt-3 border-t"
              style={{ borderColor: "var(--line-soft)" }}
            >
              <NetworkSwitcher />
              <ThemeToggle />
            </div>
          </div>
        ) : null}
      </div>
    </header>
  );
}

/**
 * Shared between the desktop centered layout and the mobile stacked-row
 * layout. `mobile=true` ups the input font-size to 16px so iOS Safari
 * does not zoom the viewport when the field receives focus.
 */
function SearchForm({
  q,
  setQ,
  focused,
  setFocused,
  inputRef,
  router,
  showShortcut,
  mobile = false,
}: {
  q: string;
  setQ: (v: string) => void;
  focused: boolean;
  setFocused: (v: boolean) => void;
  inputRef: React.RefObject<HTMLInputElement | null>;
  router: ReturnType<typeof useRouter>;
  showShortcut: boolean;
  mobile?: boolean;
}) {
  return (
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
        // Mobile: 16px to stop iOS auto-zoom on focus. Desktop: original 12.5px.
        // The container font-size also drives the input via `font: inherit`.
        fontSize: mobile ? 16 : 12.5,
        color: "var(--ink-3)",
        width: "100%",
        maxWidth: mobile ? undefined : 560,
        flexShrink: 1,
      }}
    >
      <svg
        width="14"
        height="14"
        viewBox="0 0 16 16"
        fill="none"
        style={{ color: "var(--ink-4)", flexShrink: 0 }}
        aria-hidden
      >
        <circle cx="7" cy="7" r="4.5" stroke="currentColor" strokeWidth="1.4" />
        <path d="M11 11l3 3" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" />
      </svg>
      <input
        ref={inputRef}
        placeholder={
          mobile ? "Search address / hash / block" : "Search by address / txn hash / block / token"
        }
        value={q}
        onChange={(e) => setQ(e.target.value)}
        onFocus={() => setFocused(true)}
        onBlur={() => setFocused(false)}
        onKeyDown={(e) => {
          if (e.key === "Escape") {
            e.currentTarget.blur();
          }
        }}
        className="flex-1 bg-transparent border-0 outline-none text-ink min-w-0"
        style={{ font: "inherit", caretColor: "var(--accent)" }}
      />
      {showShortcut ? (
        <span
          // Hide the keyboard-shortcut hint at <sm — no keyboard on phones.
          className="hidden sm:inline-block"
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
      ) : null}
    </form>
  );
}

function HamburgerIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 16 16" fill="none" aria-hidden>
      <path
        d="M2 4h12M2 8h12M2 12h12"
        stroke="currentColor"
        strokeWidth="1.5"
        strokeLinecap="round"
      />
    </svg>
  );
}

function CloseIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 16 16" fill="none" aria-hidden>
      <path
        d="M3.5 3.5l9 9M12.5 3.5l-9 9"
        stroke="currentColor"
        strokeWidth="1.5"
        strokeLinecap="round"
      />
    </svg>
  );
}
