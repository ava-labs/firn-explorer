"use client";

import { useQueryClient } from "@tanstack/react-query";
import { useLivePause, type LiveFeed } from "@/lib/api/live-pause";

/**
 * Pause / resume the live updates for a single feed (blocks,
 * transactions, or ICM). When paused the visible list is frozen — the
 * ExplorerFeedBridge keeps the SSE connection open and the stats /
 * topbar counters ticking, but skips invalidating the paused topic's
 * caches. Resume fires a targeted invalidate so the list catches up
 * to firn's current state in one shot rather than waiting for the
 * next throttled tick.
 *
 * Designed to slot in next to the existing "live" indicator on each
 * listing page — the dot's color reflects whether the feed is running.
 */
export function PauseButton({ feed, label }: { feed: LiveFeed; label?: string }) {
  const { paused, toggle } = useLivePause();
  const queryClient = useQueryClient();
  const isPaused = paused[feed];

  function handleClick() {
    const willResume = isPaused;
    toggle(feed);
    if (willResume) {
      // Catch up the now-running feed in a single fetch instead of
      // waiting for the next WS event to drift the list back to
      // current. Fire-and-forget — the targeted query will refetch.
      const keys: ReadonlyArray<readonly [string]> =
        feed === "blocks"
          ? [["blocks"]]
          : feed === "transactions"
            ? [["transactions"]]
            : [["icm-messages"], ["teleporter-messages"]];
      for (const key of keys) {
        queryClient.invalidateQueries({ queryKey: key });
      }
    }
  }

  const displayLabel = label ?? (isPaused ? "paused" : "live");

  return (
    <button
      type="button"
      onClick={handleClick}
      aria-pressed={isPaused}
      aria-label={isPaused ? "Resume live updates" : "Pause live updates"}
      title={isPaused ? "Resume live updates" : "Pause live updates"}
      style={{
        display: "inline-flex",
        alignItems: "center",
        gap: 7,
        padding: "4px 10px 4px 8px",
        borderRadius: 999,
        border: "1px solid var(--line)",
        background: isPaused ? "var(--bg-sunken)" : "transparent",
        color: isPaused ? "var(--ink-2)" : "var(--ink-3)",
        fontSize: 12,
        fontFamily: "var(--font-mono)",
        cursor: "pointer",
        transition: "background 120ms ease, color 120ms ease, border-color 120ms ease",
        lineHeight: 1,
      }}
      onMouseEnter={(e) => {
        e.currentTarget.style.borderColor = "var(--ink-3)";
      }}
      onMouseLeave={(e) => {
        e.currentTarget.style.borderColor = "var(--line)";
      }}
    >
      {isPaused ? <PauseGlyph /> : <span className="live-dot" aria-hidden />}
      <span>{displayLabel}</span>
    </button>
  );
}

function PauseGlyph() {
  return (
    <svg
      width="9"
      height="9"
      viewBox="0 0 9 9"
      aria-hidden
      style={{ display: "block", color: "var(--ink-3)" }}
    >
      <rect x="1.5" y="1" width="2" height="7" rx="0.5" fill="currentColor" />
      <rect x="5.5" y="1" width="2" height="7" rx="0.5" fill="currentColor" />
    </svg>
  );
}
