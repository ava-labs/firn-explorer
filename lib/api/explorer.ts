"use client";

import { useEffect, useRef } from "react";
import { useQuery, useQueryClient, type UseQueryOptions } from "@tanstack/react-query";
import { apiGet, getApiBase } from "./client";
import { useNetwork } from "./network";
import { useLivePause, type LivePauseState } from "./live-pause";
import type { Block, Chain, Stats, Transaction, ICMMessage } from "./types";

/**
 * Wire types for the firn explorer endpoints. Mirrors the Go-side
 * shapes in firn/internal/api/explorer.go. If you change one, change
 * the other — there's no shared schema today (intentional: the
 * bootstrap layer is opinionated toward this UI and gets to evolve
 * fast). Once the wire stabilises we'll lift it into a generated
 * types package.
 */
export interface ExplorerTPS {
  cadence: "block" | "wallclock-1s";
  windowSize: number;
  /** Chronological — oldest first. Render with x=i directly. */
  points: number[];
}

export interface ExplorerStats extends Stats {
  tps: ExplorerTPS;
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
  /**
   * How many block slots the sparkline should scroll. Always 0 for
   * `cause: "wallclock"` ticks. Replaces the old client-side
   * `detectShift()` walk.
   */
  shift: number;
  blocks: Block[];
  txs: Transaction[];
  icm: ICMMessage[];
  /** Single new TPS sample. Server-smoothed; client doesn't EMA. */
  tpsPoint: number;
  statsDelta?: ExplorerStatsDelta;
  /** Hashes to drop on reorg. Empty today, forward-compatible. */
  removedTxs: string[];
}

type QueryOpts<T> = Omit<UseQueryOptions<T, Error, T, readonly unknown[]>, "queryKey" | "queryFn">;

/**
 * `GET /v1/explorer/bootstrap` — single round-trip first-paint payload
 * for the home page. Replaces the parallel useChain + useStats +
 * useBlocks + useTransactions + useICMMessages fetch fan-out, which
 * caused a visible skeleton flicker on every network swap.
 *
 * Cache key includes the network's apiBase so switching networks
 * consults a different slot — no cross-network pollution, instant
 * paint when switching back to a previously-visited network.
 */
export function useExplorerBootstrap(opts?: QueryOpts<ExplorerBootstrap>) {
  const { config } = useNetwork();
  const net = config.url ?? "";
  return useQuery({
    queryKey: ["explorer-bootstrap", net] as const,
    queryFn: () => apiGet<ExplorerBootstrap>("/explorer/bootstrap"),
    // First paint matters; revalidate on focus would re-trigger a
    // perceptible refresh. The SSE feed keeps the cache fresh while
    // mounted — focus-revalidate is just noise.
    refetchOnWindowFocus: false,
    staleTime: 30 * 1000,
    ...opts,
  });
}

/**
 * Topics the bridge invalidates on a block-cause tick. Each per-page
 * list cache key in `lib/api/queries.ts` starts with one of these
 * strings and ends with the network's apiBase (see `useNetKey`), so a
 * predicate match on `[topic, apiBase]` invalidates exactly the active
 * network's slot — no cross-network cache pollution.
 *
 * `chain` + `stats` keep the topbar counters in sync with firn's
 * authoritative state (the topbar reads stats; chain rarely changes
 * but the throttle makes the cost negligible). The `tokens` /
 * `token` / `token-transfers` / `address-transactions` /
 * `block-transactions` topics are inactive on most pages — invalidates
 * are essentially free if no matching query is mounted.
 */
const FEED_TOPICS = [
  "blocks",
  "transactions",
  "icm-messages",
  "teleporter-messages",
  "stats",
  "chain",
  "tokens",
  "token",
  "token-transfers",
  "address-transactions",
  "block-transactions",
] as const;
type FeedTopic = (typeof FEED_TOPICS)[number];

/**
 * Per-topic throttle floor in ms. Without this, a 100ms-block chain
 * fires ten invalidates/second per topic — enough to make the React
 * Query cache thrash and (worse) make filtered/paginated lists visibly
 * empty + repopulate as the refetch lands. 1.5s is the floor used by
 * the previous WS-based bridge, retained here so the perceived live
 * cadence is unchanged across the migration.
 */
const TOPIC_THROTTLE_MS = 1500;

/**
 * Topics that should never run while their corresponding feed is
 * paused. Stats/chain/tokens/token/token-transfers stay live so the
 * topbar counters and any open token page keep ticking even when the
 * user has frozen a list.
 */
function shouldSkipForPause(topic: FeedTopic, paused: LivePauseState): boolean {
  if (paused.blocks && (topic === "blocks" || topic === "block-transactions")) return true;
  if (paused.transactions && (topic === "transactions" || topic === "address-transactions"))
    return true;
  if (paused.icm && (topic === "icm-messages" || topic === "teleporter-messages")) return true;
  return false;
}

/**
 * Long-lived SSE connection to firn's `/v1/explorer/feed`. Mount once
 * near the app root inside the QueryClientProvider; each tick event
 * is merged into the bootstrap cache slot so subscribed components
 * re-render without explicit subscription.
 *
 * Auto-reconnects via the browser's EventSource. The `Last-Event-ID`
 * header (which EventSource manages internally) carries the tick
 * counter so firn replays anything we missed during the gap.
 *
 * Beyond the home-page bootstrap merge, the bridge also drives live
 * updates for the per-page lists (/blocks, /transactions, /icm) by
 * invalidating their query caches on each block-cause tick. Wallclock
 * heartbeats carry no new data so they skip invalidation entirely —
 * invalidating on a wallclock would force every filtered/paginated
 * list to refetch and visibly empty + repopulate while the user is
 * scrolling.
 */
export function ExplorerFeedBridge() {
  const queryClient = useQueryClient();
  const { config } = useNetwork();
  const apiBase = config.url ?? "";
  // Read pause state via ref inside the SSE handler — toggling pause
  // must NOT re-mount the bridge (would drop the SSE connection and
  // force a Last-Event-ID replay on every flip).
  const { pausedRef } = useLivePause();

  // Per-topic last-invalidate timestamp. Refs (not state) so the
  // throttle doesn't trigger renders. Reset on apiBase change so
  // network swap fires invalidates immediately under the new URL.
  const lastInvalidatedRef = useRef<Map<FeedTopic, number>>(new Map());

  useEffect(() => {
    if (!apiBase) return;
    // Reset throttle bookkeeping per network — when the user swaps
    // networks we WANT the first tick on the new firn to invalidate
    // immediately, so the stale (now-wrong-network) cache slots
    // refetch under the new URL on the very next block.
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

      // Wallclock ticks scroll the sparkline (handled in the merge
      // above) but carry no new blocks/txs/icm — invalidating per-page
      // lists on wallclock would just force a refetch of the same
      // data, with the visible cost of an empty-then-repopulate flash
      // on filtered queries.
      if (tick.cause !== "block") return;

      const now = Date.now();
      const paused = pausedRef.current;
      for (const topic of FEED_TOPICS) {
        if (shouldSkipForPause(topic, paused)) continue;
        const last = lastInvalidatedRef.current.get(topic) ?? 0;
        if (now - last < TOPIC_THROTTLE_MS) continue;
        lastInvalidatedRef.current.set(topic, now);
        queryClient.invalidateQueries({
          predicate: (q) =>
            Array.isArray(q.queryKey) && q.queryKey[0] === topic && q.queryKey[1] === apiBase,
        });
      }
    });

    es.onerror = () => {
      // EventSource auto-reconnects; nothing to do beyond logging.
      // The Last-Event-ID header carries our tick counter so firn
      // replays cleanly on reconnect.
    };

    return () => {
      es.close();
    };
  }, [apiBase, queryClient, pausedRef]);

  return null;
}

/**
 * Apply a feed tick to the bootstrap cache. Three updates per tick:
 *   1. Prepend new blocks/txs/icm to their lists, capped to the
 *      bootstrap's original window size so high TPS doesn't bloat
 *      the cache indefinitely.
 *   2. Append the tps point to the rolling series, dropping the
 *      oldest to keep the window stable.
 *   3. Apply any stats delta to the headline counters.
 *
 * Caps come from the bootstrap response itself — whatever the server
 * decided is the right window size, we respect it.
 *
 * `paused` gates per-feed merges: a frozen feed keeps showing its
 * last-rendered rows on the home page while the user inspects them.
 * Stats/tps still flow through regardless — the topbar counter and
 * sparkline should keep ticking even when a list is paused, otherwise
 * the page looks broken when the user pauses then walks away.
 */
function mergeTickIntoBootstrap(
  queryClient: ReturnType<typeof useQueryClient>,
  apiBase: string,
  tick: ExplorerFeedTick,
  paused: LivePauseState,
) {
  queryClient.setQueryData<ExplorerBootstrap>(["explorer-bootstrap", apiBase], (prev) => {
    if (!prev) return prev;

    const blockCap = prev.blocks.length || 5;
    const txCap = prev.transactions.length || 5;
    const icmCap = prev.icmMessages.length || 6;

    // Dedupe by hash — server may re-emit on its own reconnect path.
    const seenBlocks = new Set(prev.blocks.map((b) => b.hash));
    const newBlocks = paused.blocks ? [] : tick.blocks.filter((b) => !seenBlocks.has(b.hash));
    const seenTxs = new Set(prev.transactions.map((t) => t.hash));
    const newTxs = paused.transactions ? [] : tick.txs.filter((t) => !seenTxs.has(t.hash));
    const seenIcm = new Set(prev.icmMessages.map((m) => `${m.transactionHash}-${m.logIndex}`));
    const newIcm = paused.icm
      ? []
      : tick.icm.filter((m) => !seenIcm.has(`${m.transactionHash}-${m.logIndex}`));

    // Drop oldest tps point per shift, append new. For wallclock
    // ticks (shift=0) we still scroll one slot so dead chains' charts
    // keep moving — the new point is just zero.
    const advance = Math.max(1, tick.shift);
    const tpsPoints = [
      ...prev.stats.tps.points.slice(advance),
      ...new Array(advance - 1).fill(0),
      tick.tpsPoint,
    ].slice(-prev.stats.tps.windowSize);

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
        // Apply stats delta when present (block-cause ticks); leave
        // the topbar counters alone on wallclock heartbeats so they
        // don't twitch when nothing's actually happening.
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
      },
    };

    // Apply removedTxs (reorg) by hash filter — even when transactions
    // are paused, dropping reorg'd hashes prevents stale data on the
    // home-page list. The user's pause is a "freeze the visible feed"
    // intent, not a "show me known-wrong rows" one.
    if (tick.removedTxs.length > 0) {
      const removed = new Set(tick.removedTxs);
      next.transactions = next.transactions.filter((t) => !removed.has(t.hash));
    }

    return next;
  });
}

/** Convenience: read the live tps series for the home-page sparkline. */
export function useExplorerTps(): number[] | undefined {
  const { data } = useExplorerBootstrap();
  return data?.stats.tps.points;
}

// silence unused-import warning when tree-shaking removes the inner
// reference in production builds
export { getApiBase };
