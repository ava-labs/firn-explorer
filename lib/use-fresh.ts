"use client";

import { useEffect, useRef, useState } from "react";

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
  durationMs = 2000,
): Set<string> {
  const [fresh, setFresh] = useState<Set<string>>(new Set());
  const seen = useRef<Set<string>>(new Set());
  const initialized = useRef(false);

  useEffect(() => {
    if (!items) return;

    if (!initialized.current) {
      for (const item of items) seen.current.add(item.hash);
      initialized.current = true;
      return;
    }

    const arrivals: string[] = [];
    for (const item of items) {
      if (!seen.current.has(item.hash)) {
        seen.current.add(item.hash);
        arrivals.push(item.hash);
      }
    }
    if (arrivals.length === 0) return;

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
  }, [items, durationMs]);

  return fresh;
}
