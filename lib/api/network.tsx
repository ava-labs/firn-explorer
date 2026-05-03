"use client";

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from "react";
import { useQueryClient } from "@tanstack/react-query";
import { setApiBase } from "./client";

/**
 * Networks the explorer can target. firn URLs are read from build-time env
 * vars; an undefined url means "this network isn't configured for this
 * deployment" — the UI greys it out.
 *
 * Supported env vars (all optional):
 *   NEXT_PUBLIC_FIRN_LOCAL    — defaults to http://localhost:4000
 *   NEXT_PUBLIC_FIRN_TESTNET
 *   NEXT_PUBLIC_FIRN_MAINNET
 *
 * Tenant mode: when the request lands on a `<slug>.firn.gg` host,
 * middleware injects an `x-firn-tenant-*` header pair, the layout
 * passes it as the `tenant` prop here, and the provider replaces the
 * network list with a single locked entry pointing at
 * `/api/firn/tenant`. Apex networks aren't selectable in that mode.
 */
export type NetworkID = "local" | "testnet" | "mainnet" | "tenant";

export interface NetworkConfig {
  id: NetworkID;
  label: string;
  url?: string;
}

export interface TenantInfo {
  slug: string;
  label: string;
}

const LOCAL_URL =
  process.env.NEXT_PUBLIC_FIRN_LOCAL ??
  process.env.NEXT_PUBLIC_FIRN_URL ?? // legacy alias
  "http://localhost:4000";
const TESTNET_URL = process.env.NEXT_PUBLIC_FIRN_TESTNET;
const MAINNET_URL = process.env.NEXT_PUBLIC_FIRN_MAINNET;

const APEX_NETWORKS: ReadonlyArray<NetworkConfig> = [
  { id: "local", label: "Local", url: LOCAL_URL },
  { id: "testnet", label: "Testnet", url: TESTNET_URL },
  { id: "mainnet", label: "Mainnet", url: MAINNET_URL },
];

// Path the middleware proxies to the per-tenant firn backend. Same-origin
// (`/api/firn/tenant`) so the browser only ever sees its own host's https.
const TENANT_API_BASE = "/api/firn/tenant";

/**
 * Networks visible to the current request.
 *
 * Apex (`firn.gg`) → the configured local/testnet/mainnet trio.
 * Tenant (`<slug>.firn.gg`) → a single locked "tenant" entry.
 *
 * Exported so legacy callers that still want the apex list can opt in
 * (e.g., a future "manage networks" admin page on the apex). Most code
 * should read `networks` off the context instead.
 */
export const NETWORKS = APEX_NETWORKS;

const STORAGE_KEY = "firn:network";
const DEFAULT_NETWORK: NetworkID = "local";

interface NetworkCtx {
  network: NetworkID;
  config: NetworkConfig;
  setNetwork: (id: NetworkID) => void;
  networks: ReadonlyArray<NetworkConfig>;
  tenant: TenantInfo | null;
}

const Ctx = createContext<NetworkCtx | null>(null);

export function NetworkProvider({
  children,
  tenant = null,
}: {
  children: ReactNode;
  tenant?: TenantInfo | null;
}) {
  // In tenant mode the network list is a single locked entry; apex
  // networks are intentionally not selectable here. We compute the
  // visible network list once from the (server-injected) tenant prop —
  // tenant identity doesn't change without a full navigation, so this
  // doesn't need to be reactive.
  const networks = useMemo<ReadonlyArray<NetworkConfig>>(
    () =>
      tenant
        ? [{ id: "tenant" as const, label: tenant.label, url: TENANT_API_BASE }]
        : APEX_NETWORKS,
    [tenant],
  );

  // Lazy initial state reads localStorage synchronously on the client so the
  // first render already reflects the saved choice — no setState-in-effect
  // cascade. On the server the function returns the default; React will
  // re-evaluate this hook on the client where window is defined. This means
  // the first client render may differ from the SSR'd HTML, which is fine
  // because the consumers (data fetchers) only run after hydration anyway.
  const [network, setNetworkState] = useState<NetworkID>(() => {
    if (tenant) return "tenant";
    if (typeof window === "undefined") return DEFAULT_NETWORK;
    try {
      const saved = window.localStorage.getItem(STORAGE_KEY) as NetworkID | null;
      const conf = saved && APEX_NETWORKS.find((n) => n.id === saved);
      return conf?.url ? conf.id : DEFAULT_NETWORK;
    } catch {
      /* localStorage may be blocked — silently keep default */
      return DEFAULT_NETWORK;
    }
  });
  const queryClient = useQueryClient();

  // Sync the apiBase module global with the (possibly localStorage-restored)
  // network choice on first commit. This is a side-effect on an external
  // system, not React state, so it's the right job for an effect.
  useEffect(() => {
    const conf = networks.find((n) => n.id === network);
    if (conf?.url) setApiBase(conf.url);
    // Run only on mount — subsequent setNetwork() calls update apiBase
    // synchronously (see below) before triggering a re-render.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const config = useMemo(
    () => networks.find((n) => n.id === network) ?? networks[0],
    [network, networks],
  );

  // setNetwork mutates the apiBase BEFORE triggering a re-render so
  // hooks in the same render cycle (useChain, useStats, the
  // ExplorerFeedBridge's SSE reconnect, etc.) all observe the new URL on
  // first read. Prior implementation pushed setApiBase into a
  // useEffect, which runs AFTER children's effects in React's order —
  // the bridge would then reconnect to the OLD base URL because the
  // feed URL reads getApiBase() and the parent effect hadn't fired
  // yet. Symptom: swapping testnet→local left the connection pointing
  // at testnet and animations froze.
  //
  // We DO NOT call queryClient.clear() — every query is keyed by the
  // network base URL (see useNetKey in queries.ts), so the per-network
  // caches are already partitioned. Skipping the clear means switching
  // back to a previously-visited network is instant from cache instead
  // of paying a full refetch.
  const setNetwork = useCallback(
    (id: NetworkID) => {
      // Tenant mode locks to its single network; apex network IDs are
      // not switchable here. Silently ignore — UI hides the trigger.
      if (tenant) return;
      const conf = networks.find((n) => n.id === id);
      if (!conf?.url) return; // silently ignore unconfigured networks
      setApiBase(conf.url);
      // Self-heal: drop any cache slots tagged with the destination
      // network's URL so we never render stale-or-polluted data on
      // first paint after a switch. The realtime bridge's per-network
      // predicate filter prevents new pollution; this clears anything
      // a previous build's prefix-match logic injected. Cheap — every
      // affected query refetches on next mount.
      queryClient.removeQueries({
        predicate: (q) => Array.isArray(q.queryKey) && q.queryKey[1] === conf.url,
      });
      setNetworkState(id);
      try {
        localStorage.setItem(STORAGE_KEY, id);
      } catch {
        /* persist failure is fine — choice still applies for this session */
      }
    },
    [queryClient, networks, tenant],
  );

  const value = useMemo<NetworkCtx>(
    () => ({ network, config, setNetwork, networks, tenant }),
    [network, config, setNetwork, networks, tenant],
  );

  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

export function useNetwork(): NetworkCtx {
  const v = useContext(Ctx);
  if (!v) throw new Error("useNetwork must be used inside NetworkProvider");
  return v;
}
