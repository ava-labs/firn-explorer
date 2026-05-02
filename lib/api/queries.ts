import { useQuery, type UseQueryOptions } from "@tanstack/react-query";
import { apiGet, FirnApiError, pchainCall, withQuery } from "./client";
import { useNetwork } from "./network";
import { fetchSourcifyContract, type SourcifyContract } from "@/lib/sourcify";
import { decodeFromAbi, fetchExternalSelector, type SelectorMatch } from "@/lib/selectors";
import type {
  Address,
  AddressLog,
  Block,
  Chain,
  ICMKind,
  ICMMessage,
  InternalTransaction,
  L1UptimeResponse,
  L1ValidatorDetails,
  Page,
  Stats,
  Token,
  TokenHolder,
  TokenTransfer,
  Transaction,
  ValidatorsResponse,
} from "./types";

// Initial fetch only — live updates flow through lib/api/explorer.ts's
// ExplorerFeedBridge, which invalidates these query caches on each
// block-cause SSE tick (throttled per topic, gated by useLivePause).
type QueryOpts<T> = Omit<UseQueryOptions<T, Error, T, readonly unknown[]>, "queryKey" | "queryFn">;

const DEFAULT_LIMIT = 50;

/**
 * Network-bucketed cache key. Mixed into every queryKey below so each
 * firn deployment (Local / Testnet / Mainnet) has its own React Query
 * cache slot. Without this, switching networks would briefly render
 * stale data from the previous deployment under the new firn's
 * identity, even with `queryClient.clear()` — the in-flight fetch from
 * the old network can resolve back into the cache after the clear.
 *
 * Using the API base URL itself (rather than a numeric "version") keeps
 * the keys human-readable in React Query DevTools and makes cache
 * sharing across same-URL networks Just Work.
 */
function useNetKey(): string {
  return useNetwork().config.url ?? "";
}

export function useChain(opts?: QueryOpts<Chain>) {
  const net = useNetKey();
  return useQuery({
    queryKey: ["chain", net] as const,
    queryFn: () => apiGet<Chain>("/chain"),
    staleTime: 5 * 60 * 1000,
    ...opts,
  });
}

export function useStats(opts?: QueryOpts<Stats>) {
  const net = useNetKey();
  return useQuery({
    queryKey: ["stats", net] as const,
    queryFn: () => apiGet<Stats>("/stats"),
    ...opts,
  });
}

export function useBlocks(
  params: {
    limit?: number;
    cursor?: string;
    /** Filter to blocks produced by a specific validator (lowercase 0x-prefixed). */
    miner?: string;
    /** Inclusive lower bound on block.number. */
    from?: number;
    /** Inclusive upper bound on block.number. */
    to?: number;
  } = {},
  opts?: QueryOpts<Page<Block>>,
) {
  const net = useNetKey();
  const limit = params.limit ?? DEFAULT_LIMIT;
  return useQuery({
    queryKey: ["blocks", net, limit, params] as const,
    queryFn: () =>
      apiGet<Page<Block>>(
        withQuery("/blocks", {
          limit,
          cursor: params.cursor,
          miner: params.miner,
          from: params.from,
          to: params.to,
        }),
      ),
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
  const net = useNetKey();
  const limit = params.limit ?? DEFAULT_LIMIT;
  return useQuery({
    queryKey: ["transactions", net, limit, params] as const,
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
  const net = useNetKey();
  return useQuery({
    queryKey: ["block", net, id] as const,
    queryFn: () => apiGet<Block>(`/blocks/${id}`),
    enabled: id != null,
    ...opts,
  });
}

/**
 * `GET /v1/blocks/:id/transactions` — paginated tx list for a single block.
 * Distinct from `useBlock` (which omits `transactions` unless expanded). Use
 * this on the block detail page so the tx list paginates independently of
 * the block-summary fetch.
 */
export function useBlockTransactions(
  id: string | number | undefined,
  params: { limit?: number; cursor?: string } = {},
  opts?: QueryOpts<Page<Transaction>>,
) {
  const net = useNetKey();
  const limit = params.limit ?? DEFAULT_LIMIT;
  return useQuery({
    queryKey: ["block-transactions", net, id, limit, params.cursor ?? null] as const,
    queryFn: () =>
      apiGet<Page<Transaction>>(
        withQuery(`/blocks/${id}/transactions`, {
          limit,
          cursor: params.cursor,
        }),
      ),
    enabled: id != null,
    ...opts,
  });
}

export function useTransaction(hash: string | undefined, opts?: QueryOpts<Transaction>) {
  const net = useNetKey();
  return useQuery({
    queryKey: ["transaction", net, hash] as const,
    queryFn: () => apiGet<Transaction>(`/transactions/${hash}?expand=logs,traces`),
    enabled: hash != null && hash.length > 0,
    ...opts,
  });
}

/**
 * Wraps `useTransactions` for an address-scoped tx feed.
 * Today this routes through `GET /v1/transactions?address=<hash>` because
 * `GET /v1/addresses/:hash/transactions` is spec'd but not yet implemented in firn.
 */
/**
 * P-Chain validator set, scoped to firn's configured subnet by default.
 * Pass `subnetID` to override (e.g. "11111111111111111111111111111111LpoYY"
 * for the primary network).
 */
export function useValidators(
  params: { subnetID?: string } = {},
  opts?: QueryOpts<ValidatorsResponse>,
) {
  const net = useNetKey();
  return useQuery({
    queryKey: ["validators", net, params.subnetID ?? null] as const,
    queryFn: () =>
      apiGet<ValidatorsResponse>(withQuery("/validators", { subnetID: params.subnetID })),
    staleTime: 30 * 1000,
    // While the upstream P-Chain is still bootstrapping, firn returns
    // 503 with code "bootstrapping". Poll every 15s in that state so
    // the page recovers automatically once sync completes; otherwise
    // let staleTime gate refetches.
    refetchInterval: (q) => (isBootstrappingError(q.state.error) ? 15_000 : false),
    retry: (n, err) => (isBootstrappingError(err) ? false : n < 2),
    ...opts,
  });
}

/**
 * True when the error came from firn with code "bootstrapping" — used by
 * pages that want to poll while the upstream node syncs instead of
 * surfacing a hard failure.
 */
export function isBootstrappingError(err: unknown): boolean {
  return err instanceof FirnApiError && err.code === "bootstrapping";
}

/**
 * `proposervm.getProposedHeight` via firn's cached proxy at
 * `GET /v1/chain/proposer`. Returns the chain-level Snowman++ proposer
 * state — the P-Chain height the ProposerVM is currently pinning for
 * validator-set lookup on this L1.
 *
 * Per-block proposer header data (NodeID, P-Chain height for that specific
 * block, proposer-time stamp) is NOT exposed here; that lives in
 * AvalancheGo's internal proposervm storage and needs an in-process plugin
 * hook to surface (tracked separately).
 *
 * Returns 503 with no data when firn is started without `-rpc` (and thus
 * couldn't auto-derive `-proposer-rpc`). Caller should treat as optional.
 */
export interface ProposerState {
  /** P-Chain height the ProposerVM has pinned for validator-set lookup. */
  proposedHeight?: string;
}

export function useProposerState(opts?: QueryOpts<ProposerState>) {
  const net = useNetKey();
  return useQuery({
    queryKey: ["proposer-state", net] as const,
    queryFn: () => apiGet<ProposerState>("/chain/proposer"),
    staleTime: 5 * 1000,
    retry: 1,
    ...opts,
  });
}

/**
 * Subnet-evm `validators.getCurrentValidators` via firn's cached proxy at
 * `GET /v1/validators/uptime`. Returns L1-scoped uptime data — fills the gap
 * left by P-Chain's `getCurrentValidators`, which doesn't report uptime for
 * L1 validators (only Primary Network).
 *
 * Returns 503 with no data when firn is started without `-rpc` (and thus
 * couldn't auto-derive `-validators-rpc`). Caller should treat as optional.
 */
export function useL1Uptime(opts?: QueryOpts<L1UptimeResponse>) {
  const net = useNetKey();
  return useQuery({
    queryKey: ["l1-uptime", net] as const,
    queryFn: () => apiGet<L1UptimeResponse>("/validators/uptime"),
    staleTime: 30 * 1000,
    // The subnet-evm validators endpoint may not be wired up; one failure
    // shouldn't be retried aggressively.
    retry: 1,
    ...opts,
  });
}

/**
 * `platform.getL1Validator(validationID)` — ACP-77 L1 validator details
 * (BLS pubkey, AVAX balance, balance/deactivation owners). Disabled when
 * `validationID` is missing (classic subnet validators don't have one).
 */
export function useL1Validator(
  validationID: string | undefined,
  opts?: QueryOpts<L1ValidatorDetails>,
) {
  const net = useNetKey();
  return useQuery({
    queryKey: ["l1-validator", net, validationID ?? null] as const,
    queryFn: () => pchainCall<L1ValidatorDetails>("platform.getL1Validator", { validationID }),
    enabled: !!validationID,
    staleTime: 30 * 1000,
    ...opts,
  });
}

/**
 * Fetch contract verification + sources from Sourcify
 * (https://sourcify.dev/server/v2). Disabled until both `chainId` and
 * `address` are known. Returns `null` (not undefined) when the contract is
 * unverified — caller can distinguish "loading" (data === undefined) from
 * "checked, not on Sourcify" (data === null).
 *
 * Sourcify is a third-party service; one failure shouldn't be retried hard.
 */
export function useContractSource(
  chainId: number | string | undefined,
  address: string | undefined,
  opts?: QueryOpts<SourcifyContract | null>,
) {
  return useQuery({
    queryKey: [
      /* network-agnostic: Sourcify is keyed globally by EVM chainId, not
       * by firn's active deployment. Same verified contract = same
       * artifact regardless of which firn instance discovered it. */
      "sourcify",
      chainId ?? null,
      address ?? null,
    ] as const,
    queryFn: () => fetchSourcifyContract(chainId!, address!),
    enabled: chainId != null && !!address,
    staleTime: 5 * 60 * 1000,
    retry: 1,
    ...opts,
  });
}

/**
 * Decode a 4-byte selector into a function signature, layered:
 *   1. firn's pre-decoded `method.name` (caller passes via `firnName`)
 *   2. Sourcify ABI for `contractAddress` (already in cache via
 *      `useContractSource`)
 *   3. openchain.xyz signature DB
 *   4. 4byte.directory
 *
 * Returns `undefined` while loading external sources, `null` once everything
 * has been tried and nothing matched, or a `SelectorMatch` on hit. The
 * `firnName` and Sourcify steps resolve synchronously inside React Query's
 * `queryFn`, so a verified contract gives an immediate hit with no network
 * round-trip beyond the already-warm Sourcify cache.
 */
export function useMethodSignature({
  selector,
  contractAddress,
  chainId,
  firnName,
}: {
  selector: string | undefined;
  contractAddress: string | null | undefined;
  chainId: number | string | undefined;
  /** Pre-decoded name from firn's index, when available. */
  firnName?: string | null;
}) {
  // Fast path: firn already resolved this selector. Backend has the
  // openchain.xyz cache + static registry baked in (see
  // internal/methodresolver/) so we trust it and skip Sourcify + any
  // external fetch entirely. Returning the result synchronously means
  // the chip never sits in a loading state — critical for table rows
  // that render hundreds of method chips at once.
  const hasFirnName = !!firnName;

  // Sourcify lookup is gated on missing firnName so we don't burn a
  // network round-trip when the backend resolver already answered. The
  // cache is shared with useContractSource so a verified-contract page
  // visit still warms it for the (rare) Sourcify-only consumers.
  const sourcify = useContractSource(
    chainId,
    hasFirnName ? undefined : (contractAddress ?? undefined),
  );

  return useQuery({
    queryKey: [
      /* network-agnostic: 4-byte selectors are a global signature space.
       * The same selector resolves to the same signature on every chain;
       * Sourcify and openchain.xyz shard by chainId (already in the key),
       * not by firn deployment. */
      "selector",
      selector ?? null,
      contractAddress ?? null,
      // Sourcify match is keyed only when firnName is missing — when
      // firn has the name we don't depend on Sourcify at all.
      hasFirnName ? "firn" : (sourcify.data?.match ?? null),
      firnName ?? null,
    ] as const,
    queryFn: async (): Promise<SelectorMatch | null> => {
      if (!selector) return null;
      // Step 1: firn already labelled it. Trust the backend resolver —
      // it consults the static registry (~50 well-known selectors) and
      // a chdb-cached openchain.xyz lookup (~everything else). No
      // external fetch from the browser needed.
      if (firnName) {
        return { signature: firnName, name: firnName, source: "firn" };
      }
      // Step 2: Sourcify ABI match for verified contracts.
      const fromAbi = decodeFromAbi(selector, sourcify.data?.abi);
      if (fromAbi) return fromAbi;
      // Step 3: external signature databases. Only reached when firn
      // genuinely didn't know AND the contract isn't on Sourcify —
      // i.e. the backend resolver was unable to look it up (offline,
      // rate-limited, or the selector is genuinely unknown). Browser
      // fetch here is best-effort UX, not the primary path.
      return fetchExternalSelector(selector);
    },
    enabled: !!selector && (hasFirnName || !sourcify.isPending),
    // 24h — selectors are immutable globally; signatures rarely change.
    staleTime: 24 * 60 * 60 * 1000,
    retry: 1,
  });
}

/** ERC-20 / ERC-721 contracts surfaced via firn's Transfer-log scan. */
export function useTokens(
  params: { limit?: number; cursor?: string } = {},
  opts?: QueryOpts<Page<Token>>,
) {
  const net = useNetKey();
  const limit = params.limit ?? DEFAULT_LIMIT;
  return useQuery({
    queryKey: ["tokens", net, limit, params.cursor ?? null] as const,
    queryFn: () => apiGet<Page<Token>>(withQuery("/tokens", { limit, cursor: params.cursor })),
    staleTime: 30_000,
    ...opts,
  });
}

/** Single token + on-chain metadata, enriched server-side via eth_call. */
export function useToken(address: string | undefined, opts?: QueryOpts<Token>) {
  const net = useNetKey();
  return useQuery({
    queryKey: ["token", net, address?.toLowerCase()] as const,
    queryFn: () => apiGet<Token>(`/tokens/${address}`),
    enabled: address != null && address.length === 42,
    staleTime: 60_000,
    ...opts,
  });
}

/** Paginated Transfer events for one contract, newest first. */
export function useTokenTransfers(
  address: string | undefined,
  params: { limit?: number; cursor?: string } = {},
  opts?: QueryOpts<Page<TokenTransfer>>,
) {
  const net = useNetKey();
  const limit = params.limit ?? DEFAULT_LIMIT;
  return useQuery({
    queryKey: [
      "token-transfers",
      net,
      address?.toLowerCase(),
      limit,
      params.cursor ?? null,
    ] as const,
    queryFn: () =>
      apiGet<Page<TokenTransfer>>(
        withQuery(`/tokens/${address}/transfers`, {
          limit,
          cursor: params.cursor,
        }),
      ),
    enabled: address != null && address.length === 42,
    staleTime: 5_000,
    ...opts,
  });
}

/** Ranked holders of one ERC-20, balance from on-chain `balanceOf`. */
export function useTokenHolders(
  address: string | undefined,
  params: { limit?: number } = {},
  opts?: QueryOpts<Page<TokenHolder>>,
) {
  const net = useNetKey();
  const limit = params.limit ?? 100;
  return useQuery({
    queryKey: ["token-holders", net, address?.toLowerCase(), limit] as const,
    queryFn: () => apiGet<Page<TokenHolder>>(withQuery(`/tokens/${address}/holders`, { limit })),
    enabled: address != null && address.length === 42,
    // Holders rankings change slowly + each request costs many eth_calls.
    // Cache liberally; the page can manually refetch via onMount.
    staleTime: 30_000,
    ...opts,
  });
}

/** Address overview — balance, isContract, tx count, first/last seen. */
export function useAddress(hash: string | undefined, opts?: QueryOpts<Address>) {
  const net = useNetKey();
  return useQuery({
    queryKey: ["address", net, hash?.toLowerCase()] as const,
    queryFn: () => apiGet<Address>(`/addresses/${hash}`),
    enabled: hash != null && hash.length === 42,
    staleTime: 10_000,
    ...opts,
  });
}

/** Trace rows where the address is from/to. */
export function useAddressInternalTransactions(
  hash: string | undefined,
  params: { limit?: number; cursor?: string } = {},
  opts?: QueryOpts<Page<InternalTransaction>>,
) {
  const net = useNetKey();
  const limit = params.limit ?? DEFAULT_LIMIT;
  return useQuery({
    queryKey: [
      "address-internal-transactions",
      net,
      hash?.toLowerCase(),
      limit,
      params.cursor ?? null,
    ] as const,
    queryFn: () =>
      apiGet<Page<InternalTransaction>>(
        withQuery(`/addresses/${hash}/internal-transactions`, {
          limit,
          cursor: params.cursor,
        }),
      ),
    enabled: hash != null && hash.length === 42,
    staleTime: 5_000,
    ...opts,
  });
}

/** Transfer events involving the address (as from or to). */
export function useAddressTokenTransfers(
  hash: string | undefined,
  params: { limit?: number; cursor?: string } = {},
  opts?: QueryOpts<Page<TokenTransfer>>,
) {
  const net = useNetKey();
  const limit = params.limit ?? DEFAULT_LIMIT;
  return useQuery({
    queryKey: [
      "address-token-transfers",
      net,
      hash?.toLowerCase(),
      limit,
      params.cursor ?? null,
    ] as const,
    queryFn: () =>
      apiGet<Page<TokenTransfer>>(
        withQuery(`/addresses/${hash}/token-transfers`, {
          limit,
          cursor: params.cursor,
        }),
      ),
    enabled: hash != null && hash.length === 42,
    staleTime: 5_000,
    ...opts,
  });
}

/** Raw log entries emitted from the address (when it is a contract). */
export function useAddressLogs(
  hash: string | undefined,
  params: { limit?: number; cursor?: string } = {},
  opts?: QueryOpts<Page<AddressLog>>,
) {
  const net = useNetKey();
  const limit = params.limit ?? DEFAULT_LIMIT;
  return useQuery({
    queryKey: ["address-logs", net, hash?.toLowerCase(), limit, params.cursor ?? null] as const,
    queryFn: () =>
      apiGet<Page<AddressLog>>(
        withQuery(`/addresses/${hash}/logs`, { limit, cursor: params.cursor }),
      ),
    enabled: hash != null && hash.length === 42,
    staleTime: 5_000,
    ...opts,
  });
}

export function useAddressTransactions(
  hash: string | undefined,
  params: { limit?: number; cursor?: string } = {},
  opts?: QueryOpts<Page<Transaction>>,
) {
  const net = useNetKey();
  const limit = params.limit ?? DEFAULT_LIMIT;
  return useQuery({
    queryKey: ["address-transactions", net, hash, limit, params.cursor ?? null] as const,
    queryFn: () =>
      apiGet<Page<Transaction>>(
        withQuery("/transactions", {
          limit,
          cursor: params.cursor,
          address: hash,
        }),
      ),
    enabled: hash != null && hash.length > 0,
    ...opts,
  });
}

/**
 * `GET /v1/icm/messages` — unified Avalanche Interchain Messaging stream
 * (Warp + Teleporter), newest-first. Pass `kind: "teleporter"` to scope to
 * the high-level cross-chain message UI; pass `messageId` to look up a
 * single bytes32 message; pass `address` to scope to one emitter contract;
 * pass `block` to scope to ICM events emitted in a single block.
 */
export function useICMMessages(
  params: {
    limit?: number;
    cursor?: string;
    kind?: ICMKind;
    messageId?: string;
    address?: string;
    block?: number;
  } = {},
  opts?: QueryOpts<Page<ICMMessage>>,
) {
  const net = useNetKey();
  const limit = params.limit ?? DEFAULT_LIMIT;
  return useQuery({
    queryKey: ["icm-messages", net, limit, params] as const,
    queryFn: () =>
      apiGet<Page<ICMMessage>>(
        withQuery("/icm/messages", {
          limit,
          cursor: params.cursor,
          kind: params.kind,
          messageId: params.messageId,
          address: params.address,
          block: params.block,
        }),
      ),
    ...opts,
  });
}

/**
 * `GET /v1/teleporter/messages` — sugar wrapper around `/icm/messages` that
 * pre-applies `kind=teleporter`. Use when you want only the high-level
 * cross-chain payload events (no raw Warp `SendWarpMessage` rows).
 */
export function useTeleporterMessages(
  params: {
    limit?: number;
    cursor?: string;
    messageId?: string;
    address?: string;
    block?: number;
  } = {},
  opts?: QueryOpts<Page<ICMMessage>>,
) {
  const net = useNetKey();
  const limit = params.limit ?? DEFAULT_LIMIT;
  return useQuery({
    queryKey: ["teleporter-messages", net, limit, params] as const,
    queryFn: () =>
      apiGet<Page<ICMMessage>>(
        withQuery("/teleporter/messages", {
          limit,
          cursor: params.cursor,
          messageId: params.messageId,
          address: params.address,
          block: params.block,
        }),
      ),
    ...opts,
  });
}
