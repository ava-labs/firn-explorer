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
 */
export type NetworkID = "local" | "testnet" | "mainnet";

export interface NetworkConfig {
  id: NetworkID;
  label: string;
  url?: string;
}

const LOCAL_URL =
  process.env.NEXT_PUBLIC_FIRN_LOCAL ??
  process.env.NEXT_PUBLIC_FIRN_URL ?? // legacy alias
  "http://localhost:4000";
const TESTNET_URL = process.env.NEXT_PUBLIC_FIRN_TESTNET;
const MAINNET_URL = process.env.NEXT_PUBLIC_FIRN_MAINNET;

export const NETWORKS: ReadonlyArray<NetworkConfig> = [
  { id: "local", label: "Local", url: LOCAL_URL },
  { id: "testnet", label: "Testnet", url: TESTNET_URL },
  { id: "mainnet", label: "Mainnet", url: MAINNET_URL },
];

const STORAGE_KEY = "firn:network";
const DEFAULT_NETWORK: NetworkID = "local";

interface NetworkCtx {
  network: NetworkID;
  config: NetworkConfig;
  setNetwork: (id: NetworkID) => void;
  networks: ReadonlyArray<NetworkConfig>;
}

const Ctx = createContext<NetworkCtx | null>(null);

export function NetworkProvider({ children }: { children: ReactNode }) {
  const [network, setNetworkState] = useState<NetworkID>(DEFAULT_NETWORK);
  const queryClient = useQueryClient();

  // Hydrate the saved choice on mount. SSR keeps the default to avoid
  // hydration mismatch; the browser flips to the persisted value on first
  // commit and updates the apiBase synchronously so the very first
  // network-scoped fetch hits the correct firn.
  useEffect(() => {
    try {
      const saved = localStorage.getItem(STORAGE_KEY) as NetworkID | null;
      const conf = saved && NETWORKS.find((n) => n.id === saved);
      if (conf?.url && conf.id !== DEFAULT_NETWORK) {
        setApiBase(conf.url);
        setNetworkState(conf.id);
      }
    } catch {
      /* localStorage may be blocked — silently keep default */
    }
  }, []);

  const config = useMemo(() => NETWORKS.find((n) => n.id === network) ?? NETWORKS[0], [network]);

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
      const conf = NETWORKS.find((n) => n.id === id);
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
    [queryClient],
  );

  const value = useMemo<NetworkCtx>(
    () => ({ network, config, setNetwork, networks: NETWORKS }),
    [network, config, setNetwork],
  );

  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

export function useNetwork(): NetworkCtx {
  const v = useContext(Ctx);
  if (!v) throw new Error("useNetwork must be used inside NetworkProvider");
  return v;
}
