"use client";

import { useEffect, useRef, useState } from "react";

/**
 * Re-render the calling component on a fixed interval so anything reading
 * `Date.now()` (e.g. relative-time labels) stays current even when no new
 * data has arrived. Returns the current epoch ms; callers can ignore it.
 */
export function useNowTick(intervalMs = 1000): number {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const id = setInterval(() => setNow(Date.now()), intervalMs);
    return () => clearInterval(id);
  }, [intervalMs]);
  return now;
}

/**
 * Track which items in a live-updating list are "fresh" (just arrived).
 * On the first observed batch, nothing is marked fresh — only items that
 * appear in subsequent updates get the fresh marker for `durationMs`.
 *
 * Intended for the live-block ticker: WS pushes a new block, the new
 * hash flashes for ~2s with .fresh-row, then fades.
 */
export function useFreshHashes<T extends { hash: string }>(
  items: T[] | undefined,
  durationMs = 2700,
): Set<string> {
  return useFreshKeys(items, (item) => item.hash, durationMs);
}

/**
 * Generalised version of `useFreshHashes` for lists whose stable identifier
 * isn't named `hash` (e.g. token transfers keyed by `${txHash}-${logIndex}`).
 */
export function useFreshKeys<T>(
  items: T[] | undefined,
  keyOf: (item: T) => string,
  durationMs = 2700,
): Set<string> {
  const [fresh, setFresh] = useState<Set<string>>(new Set());
  const seen = useRef<Set<string>>(new Set());
  const initialized = useRef(false);

  useEffect(() => {
    if (!items) return;

    if (!initialized.current) {
      for (const item of items) seen.current.add(keyOf(item));
      initialized.current = true;
      return;
    }

    const arrivals: string[] = [];
    for (const item of items) {
      const k = keyOf(item);
      if (!seen.current.has(k)) {
        seen.current.add(k);
        arrivals.push(k);
      }
    }
    if (arrivals.length === 0) return;

    // We're synchronizing with an external timeline (the items prop is
    // pushed from upstream queries / SSE), and this state is genuinely
    // time-derived: it expires via setTimeout below. Calling setState
    // here is the intended side-effect of an arrival, not a
    // render-cascade — there's no way to express "set, then unset after
    // N ms" without a setState pair.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setFresh((prev) => {
      const next = new Set(prev);
      for (const h of arrivals) next.add(h);
      return next;
    });

    const timer = setTimeout(() => {
      setFresh((prev) => {
        const next = new Set(prev);
        for (const h of arrivals) next.delete(h);
        return next;
      });
    }, durationMs);

    return () => clearTimeout(timer);
    // keyOf is intentionally not in deps — callers pass stable functions and
    // we only want to react to the items array changing.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [items, durationMs]);

  return fresh;
}
