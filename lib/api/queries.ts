import { useQuery, type UseQueryOptions } from "@tanstack/react-query";
import { apiGet } from "./client";
import type { paths } from "./types.gen";

type BlocksResponse = Awaited<ReturnType<typeof apiGet<"/blocks">>>;
type TransactionsResponse = Awaited<ReturnType<typeof apiGet<"/transactions">>>;
type StatsResponse = Awaited<ReturnType<typeof apiGet<"/stats">>>;

type QueryOpts<T> = Omit<UseQueryOptions<T, Error, T, readonly unknown[]>, "queryKey" | "queryFn">;

// No polling: refreshes are driven by Phoenix WS events in lib/api/realtime.tsx.
// Initial fetch still happens via REST.

export function useBlocks(opts?: QueryOpts<BlocksResponse>) {
  return useQuery({
    queryKey: ["blocks"] as const,
    queryFn: () => apiGet("/blocks"),
    ...opts,
  });
}

export function useTransactions(opts?: QueryOpts<TransactionsResponse>) {
  return useQuery({
    queryKey: ["transactions"] as const,
    queryFn: () => apiGet("/transactions"),
    ...opts,
  });
}

export function useStats(opts?: QueryOpts<StatsResponse>) {
  return useQuery({
    queryKey: ["stats"] as const,
    queryFn: () => apiGet("/stats"),
    ...opts,
  });
}

export type { BlocksResponse, TransactionsResponse, StatsResponse, paths };
