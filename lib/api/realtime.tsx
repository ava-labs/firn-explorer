"use client";

import { useEffect } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { streamUrl } from "./client";
import type {
  Block,
  Page,
  Transaction,
  WsClientMsg,
  WsServerMsg,
} from "./types";

const BLOCKS_LIST_CAP = 50;

/**
 * Mount once near the app root inside the QueryClientProvider. Opens a
 * WebSocket to firn's /v1/stream, subscribes to blocks + transactions,
 * and merges incoming events into the TanStack Query cache so the UI
 * stays live without polling.
 *
 * Reconnects with capped exponential backoff on disconnect.
 */
export function RealtimeBridge() {
  const queryClient = useQueryClient();

  useEffect(() => {
    let stopped = false;
    let socket: WebSocket | null = null;
    let attempt = 0;
    let reconnectTimer: ReturnType<typeof setTimeout> | undefined;

    const connect = () => {
      if (stopped) return;
      socket = new WebSocket(streamUrl());

      socket.onopen = () => {
        attempt = 0;
        const subBlocks: WsClientMsg = { op: "subscribe", topic: "blocks" };
        const subTxs: WsClientMsg = { op: "subscribe", topic: "transactions" };
        socket?.send(JSON.stringify(subBlocks));
        socket?.send(JSON.stringify(subTxs));
      };

      socket.onmessage = (e) => {
        let msg: WsServerMsg;
        try {
          msg = JSON.parse(e.data) as WsServerMsg;
        } catch {
          return;
        }

        if ("type" in msg) {
          // Ignore ping/pong/error frames; reconnection handles disconnects.
          return;
        }

        if (msg.topic === "blocks" && msg.event === "new") {
          mergeNewBlock(queryClient, msg.data);
          queryClient.invalidateQueries({ queryKey: ["stats"] });
          queryClient.invalidateQueries({ queryKey: ["chain"] });
        } else if (msg.topic === "transactions") {
          // Tx feed: just invalidate; cheap and keeps the table coherent.
          queryClient.invalidateQueries({ queryKey: ["transactions"] });
          queryClient.invalidateQueries({ queryKey: ["stats"] });
        }
      };

      socket.onclose = () => {
        if (stopped) return;
        attempt += 1;
        const delay = Math.min(10_000, 500 * 2 ** attempt);
        reconnectTimer = setTimeout(connect, delay);
      };

      socket.onerror = () => {
        // onclose fires after onerror; backoff handled there.
        socket?.close();
      };
    };

    connect();

    return () => {
      stopped = true;
      if (reconnectTimer) clearTimeout(reconnectTimer);
      socket?.close();
    };
  }, [queryClient]);

  return null;
}

/** Prepend the new block to every cached blocks page (deduped, capped). */
function mergeNewBlock(
  queryClient: ReturnType<typeof useQueryClient>,
  block: Block,
) {
  // Walk every ["blocks", ...] cache entry. We don't know which limit/cursor
  // params the page was queried with, so update them all.
  const cache = queryClient.getQueryCache();
  cache.findAll({ queryKey: ["blocks"] }).forEach((q) => {
    queryClient.setQueryData<Page<Block>>(q.queryKey, (prev) => {
      if (!prev) return prev;
      if (prev.data.some((b) => b.hash === block.hash)) return prev;
      return {
        ...prev,
        data: [block, ...prev.data].slice(0, BLOCKS_LIST_CAP),
      };
    });
  });
}

// Keep import to silence linter when only used in the type predicate.
const _txTypeGuard = (_: Transaction) => undefined;
void _txTypeGuard;
