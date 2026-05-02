"use client";

import {
  createContext,
  useCallback,
  useContext,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from "react";

/**
 * Per-feed live-update toggles. Lets the user freeze the blocks /
 * transactions / ICM lists while still keeping the SSE feed open
 * underneath — when they unpause, the next tick or a targeted
 * invalidate brings the cache back up to date.
 *
 * The ExplorerFeedBridge consults `pausedRef` (not the React state) on
 * every SSE tick so toggling pause never re-mounts the bridge.
 */
export type LiveFeed = "blocks" | "transactions" | "icm";

export interface LivePauseState {
  blocks: boolean;
  transactions: boolean;
  icm: boolean;
}

interface LivePauseAPI {
  paused: LivePauseState;
  pausedRef: { current: LivePauseState };
  setPaused: (feed: LiveFeed, on: boolean) => void;
  toggle: (feed: LiveFeed) => void;
}

const LivePauseContext = createContext<LivePauseAPI | null>(null);

const INITIAL: LivePauseState = { blocks: false, transactions: false, icm: false };

export function LivePauseProvider({ children }: { children: ReactNode }) {
  const [paused, setPausedState] = useState<LivePauseState>(INITIAL);
  // Mirror state into a ref so the SSE tick handler in ExplorerFeedBridge
  // can read the latest value without React re-subscribing.
  const pausedRef = useRef<LivePauseState>(INITIAL);

  const setPaused = useCallback((feed: LiveFeed, on: boolean) => {
    setPausedState((prev) => {
      if (prev[feed] === on) return prev;
      const next = { ...prev, [feed]: on };
      pausedRef.current = next;
      return next;
    });
  }, []);

  const toggle = useCallback((feed: LiveFeed) => {
    setPausedState((prev) => {
      const next = { ...prev, [feed]: !prev[feed] };
      pausedRef.current = next;
      return next;
    });
  }, []);

  const value = useMemo<LivePauseAPI>(
    () => ({ paused, pausedRef, setPaused, toggle }),
    [paused, setPaused, toggle],
  );

  return <LivePauseContext.Provider value={value}>{children}</LivePauseContext.Provider>;
}

export function useLivePause(): LivePauseAPI {
  const ctx = useContext(LivePauseContext);
  if (!ctx) throw new Error("useLivePause must be used inside <LivePauseProvider>");
  return ctx;
}
