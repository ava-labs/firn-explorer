import { useQuery, type UseQueryOptions } from "@tanstack/react-query";
import { apiGet } from "./client";
import type { paths } from "./types.gen";

type BlocksResponse = Awaited<ReturnType<typeof apiGet<"/blocks">>>;
type TransactionsResponse = Awaited<ReturnType<typeof apiGet<"/transactions">>>;
type StatsResponse = Awaited<ReturnType<typeof apiGet<"/stats">>>;

const POLL_MS = 5_000;

type QueryOpts<T> = Omit<UseQueryOptions<T, Error, T, readonly unknown[]>, "queryKey" | "queryFn">;

export function useBlocks(opts?: QueryOpts<BlocksResponse>) {
  return useQuery({
    queryKey: ["blocks"] as const,
    queryFn: () => apiGet("/blocks"),
    refetchInterval: POLL_MS,
    ...opts,
  });
}

export function useTransactions(opts?: QueryOpts<TransactionsResponse>) {
  return useQuery({
    queryKey: ["transactions"] as const,
    queryFn: () => apiGet("/transactions"),
    refetchInterval: POLL_MS,
    ...opts,
  });
}

export function useStats(opts?: QueryOpts<StatsResponse>) {
  return useQuery({
    queryKey: ["stats"] as const,
    queryFn: () => apiGet("/stats"),
    refetchInterval: POLL_MS,
    ...opts,
  });
}

export type { BlocksResponse, TransactionsResponse, StatsResponse, paths };
