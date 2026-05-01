"use client";

import { useEffect } from "react";
import { useQueryClient } from "@tanstack/react-query";
import type { Channel } from "phoenix";
import { getSocket } from "./socket";
import type { BlocksResponse } from "./queries";

type Block = BlocksResponse["items"][number];

type NewBlockPayload = {
  average_block_time: string;
  block: Block;
};

const BLOCKS_LIST_CAP = 50;

/**
 * Mount once near the app root. Subscribes to Blockscout's Phoenix v2 channels:
 *   - blocks:new_block        → prepends the block into the ["blocks"] cache
 *   - transactions:new_transaction → invalidates ["transactions"]
 * Both also nudge ["stats"] to refresh counters.
 *
 * Designed to coexist with useQuery: initial data still comes from REST,
 * realtime just keeps it fresh without polling.
 */
export function RealtimeBridge() {
  const queryClient = useQueryClient();

  useEffect(() => {
    const socket = getSocket();
    const channels: Channel[] = [];

    const blocksChannel = socket.channel("blocks:new_block", {});
    blocksChannel.on("new_block", (payload: NewBlockPayload) => {
      const incoming = payload.block;
      if (!incoming?.hash) return;

      queryClient.setQueryData<BlocksResponse>(["blocks"], (prev) => {
        if (!prev) return prev;
        if (prev.items.some((b) => b.hash === incoming.hash)) return prev;
        return {
          ...prev,
          items: [incoming, ...prev.items].slice(0, BLOCKS_LIST_CAP),
        };
      });
      queryClient.invalidateQueries({ queryKey: ["stats"] });
    });
    blocksChannel.join();
    channels.push(blocksChannel);

    const txChannel = socket.channel("transactions:new_transaction", {});
    txChannel.on("transaction", () => {
      queryClient.invalidateQueries({ queryKey: ["transactions"] });
      queryClient.invalidateQueries({ queryKey: ["stats"] });
    });
    txChannel.join();
    channels.push(txChannel);

    return () => {
      for (const ch of channels) ch.leave();
    };
  }, [queryClient]);

  return null;
}
