"use client";

import { useEffect, useRef, useState } from "react";
import { useNetwork, type NetworkConfig, type NetworkID } from "@/lib/api/network";

/**
 * Topbar dropdown for switching between firn deployments. Renders the
 * configured networks; ones missing a `NEXT_PUBLIC_FIRN_*` URL are shown
 * dimmed with a "not configured" hint and are non-selectable.
 */
export function NetworkSwitcher() {
  const { network, config, networks, setNetwork, tenant } = useNetwork();
  const [open, setOpen] = useState(false);
  const containerRef = useRef<HTMLDivElement | null>(null);

  // Click-outside / Esc to close. Declared unconditionally so the rules
  // of hooks hold across both render branches (apex vs tenant).
  useEffect(() => {
    if (!open) return;
    const onDocClick = (e: MouseEvent) => {
      if (!containerRef.current?.contains(e.target as Node)) setOpen(false);
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setOpen(false);
    };
    document.addEventListener("mousedown", onDocClick);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onDocClick);
      document.removeEventListener("keydown", onKey);
    };
  }, [open]);

  // Tenant mode: locked to a single firn instance, no switching.
  // Render a static badge with the L1 label so the topbar still shows
  // *which* L1 you're looking at.
  if (tenant) {
    return (
      <div
        style={{
          display: "flex",
          alignItems: "center",
          gap: 8,
          padding: "5px 10px 5px 8px",
          border: "1px solid var(--line)",
          borderRadius: 999,
          background: "var(--bg-elev)",
          fontFamily: "var(--font-mono)",
          fontSize: 12,
          color: "var(--ink-2)",
        }}
        title={`firn @ ${config.url ?? ""}`}
      >
        <NetworkDot id="tenant" />
        <span style={{ color: "var(--ink)", fontWeight: 500 }}>{tenant.label}</span>
      </div>
    );
  }

  return (
    <div ref={containerRef} style={{ position: "relative", fontFamily: "var(--font-mono)" }}>
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="flex items-center gap-2 border rounded-full bg-bg-elev"
        style={{
          padding: "5px 10px 5px 8px",
          borderColor: "var(--line)",
          fontSize: 12,
          color: "var(--ink-2)",
          cursor: "pointer",
        }}
        aria-haspopup="listbox"
        aria-expanded={open}
        title={config.url ? `firn @ ${config.url}` : "firn not configured"}
      >
        <NetworkDot id={network} />
        <span style={{ color: "var(--ink)", fontWeight: 500 }}>{config.label}</span>
        <svg
          width="9"
          height="9"
          viewBox="0 0 12 12"
          aria-hidden
          style={{
            color: "var(--ink-4)",
            transform: open ? "rotate(180deg)" : "",
            transition: "transform 160ms ease",
          }}
        >
          <path
            d="M3 5l3 3 3-3"
            stroke="currentColor"
            strokeWidth="1.4"
            fill="none"
            strokeLinecap="round"
          />
        </svg>
      </button>

      {open ? (
        <div
          role="listbox"
          style={{
            position: "absolute",
            top: "calc(100% + 6px)",
            // Anchor to the trigger's right edge so the panel never sails
            // past the viewport on the desktop topbar; on phones the
            // switcher lives inside the drawer (which already has page
            // padding), so the same `right: 0` keeps it inside the column.
            right: 0,
            minWidth: 220,
            // Cap the panel to the viewport width minus a comfortable
            // gutter so a stray long firn URL can't push it off-screen on
            // a narrow phone.
            maxWidth: "calc(100vw - 32px)",
            background: "var(--bg-elev)",
            border: "1px solid var(--line)",
            borderRadius: 10,
            padding: 4,
            boxShadow: "0 1px 2px rgba(0,0,0,0.04), 0 8px 24px rgba(0,0,0,0.08)",
            zIndex: 30,
          }}
        >
          {networks.map((n) => (
            <NetworkOption
              key={n.id}
              network={n}
              active={n.id === network}
              onPick={() => {
                setNetwork(n.id);
                setOpen(false);
              }}
            />
          ))}
          <div
            style={{
              fontSize: 10.5,
              color: "var(--ink-4)",
              padding: "8px 10px 6px",
              borderTop: "1px solid var(--line-soft)",
              marginTop: 4,
              lineHeight: 1.5,
            }}
          >
            Configure with <code style={{ color: "var(--ink-3)" }}>NEXT_PUBLIC_FIRN_*</code> env
            vars.
          </div>
        </div>
      ) : null}
    </div>
  );
}

function NetworkOption({
  network,
  active,
  onPick,
}: {
  network: NetworkConfig;
  active: boolean;
  onPick: () => void;
}) {
  const configured = !!network.url;
  return (
    <button
      type="button"
      role="option"
      aria-selected={active}
      disabled={!configured}
      onClick={onPick}
      style={{
        display: "flex",
        alignItems: "center",
        gap: 10,
        width: "100%",
        padding: "8px 10px",
        background: active ? "var(--bg-sunken)" : "transparent",
        border: "none",
        borderRadius: 6,
        cursor: configured ? "pointer" : "not-allowed",
        opacity: configured ? 1 : 0.5,
        textAlign: "left",
        fontFamily: "inherit",
        fontSize: 12.5,
        color: active ? "var(--ink)" : "var(--ink-2)",
      }}
      title={network.url ?? "Set NEXT_PUBLIC_FIRN_* to enable"}
    >
      <NetworkDot id={network.id} />
      <span style={{ flex: 1, fontWeight: active ? 500 : 400 }}>{network.label}</span>
      {configured ? (
        <span
          style={{
            fontSize: 10,
            color: "var(--ink-4)",
            maxWidth: 120,
            overflow: "hidden",
            textOverflow: "ellipsis",
            whiteSpace: "nowrap",
          }}
        >
          {hostOf(network.url!)}
        </span>
      ) : (
        <span style={{ fontSize: 10, color: "var(--ink-4)" }}>not configured</span>
      )}
      {active ? (
        <svg width="11" height="11" viewBox="0 0 12 12" aria-hidden>
          <path
            d="M2.5 6.5l2.5 2.5 4.5-5"
            stroke="var(--ink)"
            strokeWidth="1.6"
            fill="none"
            strokeLinecap="round"
            strokeLinejoin="round"
          />
        </svg>
      ) : null}
    </button>
  );
}

function NetworkDot({ id }: { id: NetworkID }) {
  // Subtle palette signaling. Local = neutral, testnet = warm, mainnet =
  // accent, tenant = accent (this *is* the only network in that mode).
  // Keeps in line with the design system (no third-party brand reds).
  const color =
    id === "mainnet" || id === "tenant"
      ? "var(--accent)"
      : id === "testnet"
        ? "var(--warn, #c08a3e)"
        : "var(--ink-3)";
  return (
    <span
      aria-hidden
      style={{
        width: 8,
        height: 8,
        borderRadius: 999,
        background: color,
        flexShrink: 0,
      }}
    />
  );
}

function hostOf(url: string): string {
  try {
    return new URL(url).host;
  } catch {
    return url;
  }
}
