"use client";

import { useEffect, useRef } from "react";
import { useQuery, useQueryClient, type UseQueryOptions } from "@tanstack/react-query";
import { getApiBase } from "./client";
import { useNetwork } from "./network";
import { useLivePause, type LivePauseState } from "./live-pause";
import { getExplorerBootstrap, getGetExplorerBootstrapUrl } from "./generated/firn";
import { firnQueryKey } from "./generated-query-key";
import type {
  Block,
  Chain,
  ExplorerBootstrap as GeneratedExplorerBootstrap,
  Stats,
  Transaction,
} from "./generated/schemas";
import type { ICMMessage } from "./queries";

/**
 * Wire types for the firn explorer endpoints. The REST shape comes from
 * the generated `ExplorerBootstrap`, but the SSE feed
 * (`/v1/explorer/feed`) is server-sent-events — not in openapi.json —
 * so its tick payload stays hand-typed here. Keep in sync with
 * firn/internal/api/explorer.go.
 */
export interface ExplorerTPS {
  cadence: "block" | "wallclock-1s";
  windowSize: number;
  /** Chronological — oldest first. Render with x=i directly. */
  points: number[];
}

export interface ExplorerStats extends Stats {
  tps: ExplorerTPS;
  /** Gas-utilization series (0–100% of block gas limit). Same shape as
   *  TPS. Frontend toggles between the two on the home chart. */
  gasUtilization: ExplorerTPS;
}

export interface ExplorerBootstrap {
  /** Monotonic anchor for the SSE feed's Last-Event-ID resume. */
  tick: number;
  chain: Chain;
  stats: ExplorerStats;
  blocks: Block[];
  transactions: Transaction[];
  icmMessages: ICMMessage[];
}

export interface ExplorerStatsDelta {
  totalBlocks?: string;
  totalTransactions?: string;
  transactionsLast24h?: string;
  averageBlockTimeMs?: number;
}

export interface ExplorerFeedTick {
  tick: number;
  cause: "block" | "wallclock";
  from: number;
  to: number;
  /** How many block slots the sparkline should scroll. 0 for wallclock. */
  shift: number;
  blocks: Block[];
  txs: Transaction[];
  icm: ICMMessage[];
  /** Single new TPS sample. Server-smoothed; client doesn't EMA. */
  tpsPoint: number;
  /** Single new gas-utilization sample (0–100). Same cadence as tpsPoint. */
  gasPoint: number;
  statsDelta?: ExplorerStatsDelta;
  /** Hashes to drop on reorg. Empty today, forward-compatible. */
  removedTxs: string[];
}

type QueryOpts<T> = Omit<UseQueryOptions<T, Error, T, readonly unknown[]>, "queryKey" | "queryFn">;

/**
 * `GET /v1/explorer/bootstrap` — single round-trip first-paint payload
 * for the home page. Cache key is `[apiBase, "/v1/explorer/bootstrap"]`
 * per the orval `firnQueryKey` mutator — switching networks consults a
 * different slot, no cross-network pollution, instant paint when
 * switching back.
 */
export function useExplorerBootstrap(opts?: QueryOpts<ExplorerBootstrap>) {
  // Match the home page's HOME_LIVE_BLOCKS / HOME_LIVE_TXS — bigger
  // bootstrap means the right-hand live ticker fills the chart card's
  // height instead of running short. SSE merge preserves the panel's
  // length cap so this only affects first paint sizing.
  const params = { blocks: 6, txs: 5 };
  return useQuery({
    queryKey: firnQueryKey({ params }, { url: getGetExplorerBootstrapUrl(params) }),
    queryFn: ({ signal }) =>
      getExplorerBootstrap(params, { signal }).then((b) =>
        normalizeBootstrap(b as unknown as GeneratedExplorerBootstrap),
      ),
    refetchOnWindowFocus: false,
    staleTime: 30 * 1000,
    ...opts,
  });
}

/**
 * Hoist the spec's nullable arrays (`blocks: Block[] | null`) into the
 * non-null shapes the components were written against.
 */
function normalizeBootstrap(b: GeneratedExplorerBootstrap): ExplorerBootstrap {
  // Gas series rides parallel to TPS in the spec; tolerate three states
  // for older / freshly-bootstrapped backends: field missing entirely
  // (older firn), field present with null points (chdb empty-array
  // marshaling), or normal populated points.
  const tpsWindow = b.stats.tps?.windowSize ?? 50;
  const tpsLen = b.stats.tps?.points?.length ?? tpsWindow;
  const rawGas = (b.stats as { gasUtilization?: ExplorerTPS | null }).gasUtilization;
  const gas: ExplorerTPS = rawGas
    ? { ...rawGas, points: rawGas.points ?? new Array(tpsLen).fill(0) }
    : { cadence: "block", windowSize: tpsWindow, points: new Array(tpsLen).fill(0) };
  return {
    tick: b.tick,
    chain: b.chain,
    stats: { ...b.stats, tps: b.stats.tps as ExplorerTPS, gasUtilization: gas },
    blocks: b.blocks ?? [],
    transactions: b.transactions ?? [],
    icmMessages: (b.icmMessages ?? []) as ICMMessage[],
  };
}

/**
 * Topics the bridge invalidates on a block-cause tick. Each topic is a
 * URL prefix matched against the second element of orval-generated
 * query keys (the first is the active apiBase).
 */
const FEED_TOPIC_PREFIXES = [
  "/v1/blocks",
  "/v1/transactions",
  "/v1/icm/messages",
  "/v1/teleporter/messages",
  "/v1/stats",
  "/v1/chain",
  "/v1/tokens",
] as const;
type FeedTopic = (typeof FEED_TOPIC_PREFIXES)[number];

const TOPIC_THROTTLE_MS = 1500;

function shouldSkipForPause(topic: FeedTopic, paused: LivePauseState): boolean {
  if (paused.blocks && topic === "/v1/blocks") return true;
  if (paused.transactions && topic === "/v1/transactions") return true;
  if (paused.icm && (topic === "/v1/icm/messages" || topic === "/v1/teleporter/messages")) {
    return true;
  }
  return false;
}

/**
 * Long-lived SSE connection to firn's `/v1/explorer/feed`. SSE / WS
 * aren't in openapi.json, so this stays a hand-rolled `EventSource`
 * client.
 */
export function ExplorerFeedBridge() {
  const queryClient = useQueryClient();
  const { config } = useNetwork();
  const apiBase = config.url ?? "";
  const { pausedRef } = useLivePause();
  const lastInvalidatedRef = useRef<Map<FeedTopic, number>>(new Map());

  useEffect(() => {
    if (!apiBase) return;
    lastInvalidatedRef.current = new Map();

    const url = `${apiBase}/v1/explorer/feed`;
    const es = new EventSource(url);

    es.addEventListener("tick", (raw) => {
      let tick: ExplorerFeedTick;
      try {
        tick = JSON.parse((raw as MessageEvent).data) as ExplorerFeedTick;
      } catch {
        return;
      }
      mergeTickIntoBootstrap(queryClient, apiBase, tick, pausedRef.current);

      if (tick.cause !== "block") return;

      const now = Date.now();
      const paused = pausedRef.current;
      for (const topic of FEED_TOPIC_PREFIXES) {
        if (shouldSkipForPause(topic, paused)) continue;
        const last = lastInvalidatedRef.current.get(topic) ?? 0;
        if (now - last < TOPIC_THROTTLE_MS) continue;
        lastInvalidatedRef.current.set(topic, now);
        // queryKey shape is `[apiBase, url, ...]` per the orval
        // `firnQueryKey` mutator. apiBase scopes to the active network;
        // URL prefix matches list pages regardless of cursor / filter
        // args appended after.
        queryClient.invalidateQueries({
          predicate: (q) => {
            const k = q.queryKey;
            if (!Array.isArray(k) || k[0] !== apiBase) return false;
            const u = k[1];
            return typeof u === "string" && u.startsWith(topic);
          },
        });
      }
    });

    es.onerror = () => {
      // EventSource auto-reconnects.
    };

    return () => {
      es.close();
    };
  }, [apiBase, queryClient, pausedRef]);

  return null;
}

function mergeTickIntoBootstrap(
  queryClient: ReturnType<typeof useQueryClient>,
  apiBase: string,
  tick: ExplorerFeedTick,
  paused: LivePauseState,
) {
  void apiBase; // key carries apiBase via firnQueryKey
  const key = firnQueryKey({}, { url: getGetExplorerBootstrapUrl() });
  queryClient.setQueryData<ExplorerBootstrap>(key, (prev) => {
    if (!prev) return prev;

    const blockCap = prev.blocks.length || 5;
    const txCap = prev.transactions.length || 5;
    const icmCap = prev.icmMessages.length || 6;

    const seenBlocks = new Set(prev.blocks.map((b) => b.hash));
    const newBlocks = paused.blocks ? [] : tick.blocks.filter((b) => !seenBlocks.has(b.hash));
    const seenTxs = new Set(prev.transactions.map((t) => t.hash));
    const newTxs = paused.transactions ? [] : tick.txs.filter((t) => !seenTxs.has(t.hash));
    const seenIcm = new Set(prev.icmMessages.map((m) => `${m.transactionHash}-${m.logIndex}`));
    const newIcm = paused.icm
      ? []
      : tick.icm.filter((m) => !seenIcm.has(`${m.transactionHash}-${m.logIndex}`));

    const advance = Math.max(1, tick.shift);
    const tpsPoints = [
      ...prev.stats.tps.points.slice(advance),
      ...new Array(advance).fill(tick.tpsPoint),
    ].slice(-prev.stats.tps.windowSize);
    // Gas series rolls in lockstep with TPS — same advance, same window.
    // Tolerate older firn that doesn't ship gasUtilization at all (field
    // missing) and the spec's `points: number[] | null` shape (chdb
    // returns null for empty arrays). Fall back to a zero-padded series
    // sized to match the TPS window so the chart geometry is stable.
    const gasPrev = prev.stats.gasUtilization ?? {
      cadence: "block" as const,
      windowSize: prev.stats.tps.windowSize,
      points: new Array(prev.stats.tps.windowSize).fill(0),
    };
    const gasPrevPoints = gasPrev.points ?? [];
    const gasNew = tick.gasPoint ?? gasPrevPoints[gasPrevPoints.length - 1] ?? 0;
    const gasPoints = [...gasPrevPoints.slice(advance), ...new Array(advance).fill(gasNew)].slice(
      -gasPrev.windowSize,
    );

    const next: ExplorerBootstrap = {
      ...prev,
      tick: tick.tick,
      blocks: paused.blocks ? prev.blocks : [...newBlocks, ...prev.blocks].slice(0, blockCap),
      transactions: paused.transactions
        ? prev.transactions
        : [...newTxs, ...prev.transactions].slice(0, txCap),
      icmMessages: paused.icm
        ? prev.icmMessages
        : [...newIcm, ...prev.icmMessages].slice(0, icmCap),
      stats: {
        ...prev.stats,
        ...(tick.statsDelta
          ? {
              totalBlocks: tick.statsDelta.totalBlocks ?? prev.stats.totalBlocks,
              totalTransactions: tick.statsDelta.totalTransactions ?? prev.stats.totalTransactions,
              transactionsLast24h:
                tick.statsDelta.transactionsLast24h ?? prev.stats.transactionsLast24h,
              averageBlockTimeMs:
                tick.statsDelta.averageBlockTimeMs ?? prev.stats.averageBlockTimeMs,
            }
          : {}),
        tps: {
          ...prev.stats.tps,
          points: tpsPoints,
        },
        gasUtilization: {
          ...gasPrev,
          points: gasPoints,
        },
      },
    };

    if (tick.removedTxs.length > 0) {
      const removed = new Set(tick.removedTxs);
      next.transactions = next.transactions.filter((t) => !removed.has(t.hash));
    }

    return next;
  });
}

export function useExplorerTps(): number[] | undefined {
  const { data } = useExplorerBootstrap();
  return data?.stats.tps.points;
}

// silence unused-import warning when tree-shaking removes the inner
// reference in production builds
export { getApiBase };
