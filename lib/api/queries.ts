import { useQuery, type UseQueryOptions } from "@tanstack/react-query";
import { apiGet, withQuery } from "./client";
import type {
  Block,
  Chain,
  Page,
  Stats,
  Transaction,
} from "./types";

// Initial fetch only — live updates flow through lib/api/realtime.tsx.
type QueryOpts<T> = Omit<UseQueryOptions<T, Error, T, readonly unknown[]>, "queryKey" | "queryFn">;

const DEFAULT_LIMIT = 50;

export function useChain(opts?: QueryOpts<Chain>) {
  return useQuery({
    queryKey: ["chain"] as const,
    queryFn: () => apiGet<Chain>("/chain"),
    staleTime: 5 * 60 * 1000,
    ...opts,
  });
}

export function useStats(opts?: QueryOpts<Stats>) {
  return useQuery({
    queryKey: ["stats"] as const,
    queryFn: () => apiGet<Stats>("/stats"),
    ...opts,
  });
}

export function useBlocks(
  params: { limit?: number; cursor?: string } = {},
  opts?: QueryOpts<Page<Block>>,
) {
  const limit = params.limit ?? DEFAULT_LIMIT;
  return useQuery({
    queryKey: ["blocks", limit, params.cursor ?? null] as const,
    queryFn: () =>
      apiGet<Page<Block>>(withQuery("/blocks", { limit, cursor: params.cursor })),
    ...opts,
  });
}

export function useTransactions(
  params: {
    limit?: number;
    cursor?: string;
    address?: string;
    method?: string;
    status?: "success" | "failed";
  } = {},
  opts?: QueryOpts<Page<Transaction>>,
) {
  const limit = params.limit ?? DEFAULT_LIMIT;
  return useQuery({
    queryKey: ["transactions", limit, params] as const,
    queryFn: () =>
      apiGet<Page<Transaction>>(
        withQuery("/transactions", {
          limit,
          cursor: params.cursor,
          address: params.address,
          method: params.method,
          status: params.status,
        }),
      ),
    ...opts,
  });
}

export function useBlock(id: string | number | undefined, opts?: QueryOpts<Block>) {
  return useQuery({
    queryKey: ["block", id] as const,
    queryFn: () => apiGet<Block>(`/blocks/${id}`),
    enabled: id != null,
    ...opts,
  });
}

export function useTransaction(hash: string | undefined, opts?: QueryOpts<Transaction>) {
  return useQuery({
    queryKey: ["transaction", hash] as const,
    queryFn: () => apiGet<Transaction>(`/transactions/${hash}?expand=logs,traces`),
    enabled: hash != null && hash.length > 0,
    ...opts,
  });
}
