/**
 * Thin wrappers around the orval-generated hooks. Their job is twofold:
 *
 *   1. Keep the call signatures the rest of the app already uses
 *      (`useBlocks({limit, miner, …})` instead of `useListBlocks({…})`),
 *      so this migration is one file diff per page rather than many.
 *   2. Normalize the spec's nullable array fields (`page.data: T[] | null`,
 *      `tx.logs: Log[] | null`) into the non-null shapes components were
 *      written against. The OpenAPI generator faithfully reflects
 *      `["array", "null"]` from huma; at the UI layer "no rows yet" and
 *      "null" mean the same thing.
 *
 * Beyond those two concerns this module adds nothing the generated
 * hooks don't already provide. New call sites can pull directly from
 * `@/lib/api/generated/firn`.
 */

import { useQuery, type UseQueryOptions } from "@tanstack/react-query";
import {
  getBlock as fetchBlock,
  getChain as fetchChain,
  getProposerState as fetchProposerState,
  getTransaction as fetchTransaction,
  getValidatorUptime as fetchValidatorUptime,
  getValidators as fetchValidators,
  listAddressInternalTransactions as fetchAddressInternalTransactions,
  listAddressLogs as fetchAddressLogs,
  listAddressTokenTransfers as fetchAddressTokenTransfers,
  listBlocks as fetchBlocks,
  listICMMessages as fetchICMMessages,
  listTeleporterMessages as fetchTeleporterMessages,
  listTokenHolders as fetchTokenHolders,
  listTokenTransfers as fetchTokenTransfers,
  listTokens as fetchTokens,
  listTransactions as fetchTransactions,
  getBlockTransactions as fetchBlockTransactions,
  getStats as fetchStats,
  getAddress as fetchAddress,
  getToken as fetchToken,
  getListBlocksUrl,
  getListTransactionsUrl,
  getGetChainUrl,
  getGetStatsUrl,
  getGetBlockUrl,
  getGetBlockTransactionsUrl,
  getGetTransactionUrl,
  getGetValidatorsUrl,
  getGetProposerStateUrl,
  getGetValidatorUptimeUrl,
  getListICMMessagesUrl,
  getListTeleporterMessagesUrl,
  getListTokensUrl,
  getGetTokenUrl,
  getListTokenTransfersUrl,
  getListTokenHoldersUrl,
  getGetAddressUrl,
  getListAddressInternalTransactionsUrl,
  getListAddressTokenTransfersUrl,
  getListAddressLogsUrl,
} from "./generated/firn";
import { firnQueryKey } from "./generated-query-key";
import { FirnApiError, pchainCall } from "./client";
import { fetchSourcifyContract, type SourcifyContract } from "@/lib/sourcify";
import { decodeFromAbi, fetchExternalSelector, type SelectorMatch } from "@/lib/selectors";
import type {
  Address as FirnAddress,
  AddressLog as GenAddressLog,
  Block as GenBlock,
  Chain as GenChain,
  InternalTransaction as GenInternalTransaction,
  Message as GenMessage,
  Stats as GenStats,
  Token as GenToken,
  TokenHolder as GenTokenHolder,
  TokenTransfer as GenTokenTransfer,
  Transaction as GenTransaction,
} from "./generated/schemas";

// Re-export the generated schema types so call sites can pull them
// from one place instead of remembering whether a name lives here or
// in the generated tree.
export type {
  Address,
  AddressLog,
  AppMessage,
  AppFieldNode,
  AppMessageEnvelope,
  Block,
  BlockConsensus,
  BlockGas,
  BlockRef,
  Chain,
  Cursor,
  ErrorModel,
  GasPrice,
  InternalTransaction,
  L1Validator,
  Log,
  Message,
  Method,
  NativeToken,
  Stats,
  TeleporterFeeInfoDecoded,
  TeleporterMessageDecoded,
  TeleporterMessageReceiptDecoded,
  Token,
  TokenHolder,
  TokenTransfer,
  Trace,
  Transaction,
  TransactionGas,
  WarpAddressedCall,
  WarpEnvelope,
} from "./generated/schemas";

// Legacy alias — old code referenced `AppMessageFieldNode`; the spec
// renamed it to `AppFieldNode`. Keep both spellings available.
export type { AppFieldNode as AppMessageFieldNode } from "./generated/schemas";

/** firn API kind discriminator — `kind: string` in the spec, but only
 *  these two values are ever emitted. */
export type ICMKind = "warp" | "teleporter";

/** Frontend-friendly alias for the wire `Message` type. */
export type ICMMessage = GenMessage;

/** Page<T> — generated as nullable; we normalize to non-null arrays. */
export interface Page<T> {
  data: T[];
  cursor: { next?: string; prev?: string };
}

type RawPage<T> = {
  data: T[] | null | undefined;
  cursor?: { next?: string; prev?: string } | undefined;
};
function normalizePage<T>(p: RawPage<T>): Page<T> {
  return { data: p.data ?? [], cursor: p.cursor ?? {} };
}

type QueryOpts<T> = Omit<UseQueryOptions<T, Error, T, readonly unknown[]>, "queryKey" | "queryFn">;
const DEFAULT_LIMIT = 50;

// ---------------------------------------------------------------------------
// Top-level chain meta
// ---------------------------------------------------------------------------

export function useChain(opts?: QueryOpts<GenChain>) {
  return useQuery({
    queryKey: firnQueryKey({}, { url: getGetChainUrl() }),
    queryFn: ({ signal }) => fetchChain({ signal }) as unknown as Promise<GenChain>,
    staleTime: 5 * 60 * 1000,
    ...opts,
  });
}

export function useStats(opts?: QueryOpts<GenStats>) {
  return useQuery({
    queryKey: firnQueryKey({}, { url: getGetStatsUrl() }),
    queryFn: ({ signal }) => fetchStats({ signal }) as unknown as Promise<GenStats>,
    ...opts,
  });
}

// ---------------------------------------------------------------------------
// Blocks + Transactions
// ---------------------------------------------------------------------------

export function useBlocks(
  params: { limit?: number; cursor?: string; miner?: string; from?: number; to?: number } = {},
  opts?: QueryOpts<Page<GenBlock>>,
) {
  const limit = params.limit ?? DEFAULT_LIMIT;
  // Spec types from/to as decimal strings for int64 safety; UI passes
  // numbers. Stringify here so the URL serializer works without surprises.
  const merged = {
    limit,
    cursor: params.cursor,
    miner: params.miner,
    from: params.from != null ? String(params.from) : undefined,
    to: params.to != null ? String(params.to) : undefined,
  };
  return useQuery({
    queryKey: firnQueryKey({ params: merged }, { url: getListBlocksUrl(merged) }),
    queryFn: ({ signal }) =>
      fetchBlocks(merged, { signal }).then((p) =>
        normalizePage<GenBlock>(p as unknown as RawPage<GenBlock>),
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
  opts?: QueryOpts<Page<GenTransaction>>,
) {
  const limit = params.limit ?? DEFAULT_LIMIT;
  const merged = { ...params, limit };
  return useQuery({
    queryKey: firnQueryKey({ params: merged }, { url: getListTransactionsUrl(merged) }),
    queryFn: ({ signal }) =>
      fetchTransactions(merged, { signal }).then((p) =>
        normalizePage<GenTransaction>(p as unknown as RawPage<GenTransaction>),
      ),
    ...opts,
  });
}

export function useBlock(id: string | number | undefined, opts?: QueryOpts<GenBlock>) {
  return useQuery({
    queryKey: firnQueryKey(
      { id },
      { url: id != null ? getGetBlockUrl(String(id)) : "/v1/blocks/_" },
    ),
    queryFn: ({ signal }) =>
      fetchBlock(String(id), undefined, { signal }) as unknown as Promise<GenBlock>,
    enabled: id != null,
    ...opts,
  });
}

export function useBlockTransactions(
  id: string | number | undefined,
  params: { limit?: number; cursor?: string } = {},
  opts?: QueryOpts<Page<GenTransaction>>,
) {
  const limit = params.limit ?? DEFAULT_LIMIT;
  const merged = { ...params, limit };
  return useQuery({
    queryKey: firnQueryKey(
      { id, params: merged },
      {
        url:
          id != null ? getGetBlockTransactionsUrl(String(id), merged) : "/v1/blocks/_/transactions",
      },
    ),
    queryFn: ({ signal }) =>
      fetchBlockTransactions(String(id), merged, { signal }).then((p) =>
        normalizePage<GenTransaction>(p as unknown as RawPage<GenTransaction>),
      ),
    enabled: id != null,
    ...opts,
  });
}

export function useTransaction(hash: string | undefined, opts?: QueryOpts<GenTransaction>) {
  const params = { expand: "logs,traces" };
  return useQuery({
    queryKey: firnQueryKey(
      { hash, params },
      { url: hash != null ? getGetTransactionUrl(hash, params) : "/v1/transactions/_" },
    ),
    queryFn: ({ signal }) =>
      fetchTransaction(hash!, params, { signal }) as unknown as Promise<GenTransaction>,
    enabled: hash != null && hash.length > 0,
    ...opts,
  });
}

// ---------------------------------------------------------------------------
// Validators — `/v1/validators` and `/v1/validators/uptime` are JSON
// pass-throughs to P-Chain / subnet-evm — typed as `unknown` in
// openapi.json. Hand-stamped shapes mirror the upstream responses.
// ---------------------------------------------------------------------------

export interface ValidatorsResponse {
  validators: Validator[];
}

export interface Validator {
  txID: string;
  validationID?: string;
  startTime: string;
  endTime: string;
  stakeAmount?: string;
  weight: string;
  nodeID: string;
  publicKey?: string;
  uptime?: string;
  connected?: boolean;
  delegationFee?: string;
  delegatorCount?: string;
  delegatorWeight?: string;
  potentialReward?: string;
  accruedDelegateeReward?: string;
  delegators?: Delegator[] | null;
  validationRewardOwner?: RewardOwner;
  delegationRewardOwner?: RewardOwner;
  signer?: { publicKey: string; proofOfPossession: string };
}

export interface Delegator {
  txID: string;
  startTime: string;
  endTime: string;
  stakeAmount: string;
  nodeID: string;
  rewardOwner?: RewardOwner;
  potentialReward?: string;
}

export interface RewardOwner {
  locktime: string;
  threshold: string;
  addresses: string[];
}

export interface L1UptimeResponse {
  validators: L1UptimeEntry[];
}

export interface L1UptimeEntry {
  nodeID: string;
  uptime?: string | number;
  uptimePercent?: string | number;
  weight?: string;
  startTimestamp?: number | string;
  validationID?: string;
  isActive?: boolean;
  isConnected?: boolean;
  isL1Validator?: boolean;
}

export interface L1ValidatorDetails {
  subnetID: string;
  nodeID: string;
  publicKey: string;
  remainingBalanceOwner: RewardOwner;
  deactivationOwner: RewardOwner;
  startTime: string;
  weight: string;
  minNonce: string;
  balance: string;
  height?: string;
}

export interface ProposerState {
  proposedHeight?: string;
}

export function useValidators(
  params: { subnetID?: string } = {},
  opts?: QueryOpts<ValidatorsResponse>,
) {
  return useQuery({
    queryKey: firnQueryKey({ params }, { url: getGetValidatorsUrl(params) }),
    queryFn: ({ signal }) =>
      fetchValidators(params, { signal }) as unknown as Promise<ValidatorsResponse>,
    staleTime: 30 * 1000,
    refetchInterval: (q) => (isBootstrappingError(q.state.error) ? 15_000 : false),
    retry: (n, err) => (isBootstrappingError(err) ? false : n < 2),
    ...opts,
  });
}

export function isBootstrappingError(err: unknown): boolean {
  return err instanceof FirnApiError && err.code === "bootstrapping";
}

export function useProposerState(opts?: QueryOpts<ProposerState>) {
  return useQuery({
    queryKey: firnQueryKey({}, { url: getGetProposerStateUrl() }),
    queryFn: ({ signal }) => fetchProposerState({ signal }) as unknown as Promise<ProposerState>,
    staleTime: 5 * 1000,
    retry: 1,
    ...opts,
  });
}

export function useL1Uptime(opts?: QueryOpts<L1UptimeResponse>) {
  return useQuery({
    queryKey: firnQueryKey({}, { url: getGetValidatorUptimeUrl() }),
    queryFn: ({ signal }) =>
      fetchValidatorUptime({ signal }) as unknown as Promise<L1UptimeResponse>,
    staleTime: 30 * 1000,
    retry: 1,
    ...opts,
  });
}

/**
 * `platform.getL1Validator(validationID)` — JSON-RPC POST. The opaque
 * body keeps it out of the generated query surface; we use pchainCall
 * directly so the call site stays a `useQuery` (cached) instead of a
 * mutation.
 */
export function useL1Validator(
  validationID: string | undefined,
  opts?: QueryOpts<L1ValidatorDetails>,
) {
  return useQuery({
    queryKey: firnQueryKey(
      { method: "platform.getL1Validator", validationID },
      { url: "/v1/rpc/p" },
    ),
    queryFn: () => pchainCall<L1ValidatorDetails>("platform.getL1Validator", { validationID }),
    enabled: !!validationID,
    staleTime: 30 * 1000,
    ...opts,
  });
}

// ---------------------------------------------------------------------------
// Tokens
// ---------------------------------------------------------------------------

export function useTokens(
  params: { limit?: number; cursor?: string } = {},
  opts?: QueryOpts<Page<GenToken>>,
) {
  const limit = params.limit ?? DEFAULT_LIMIT;
  const merged = { ...params, limit };
  return useQuery({
    queryKey: firnQueryKey({ params: merged }, { url: getListTokensUrl(merged) }),
    queryFn: ({ signal }) =>
      fetchTokens(merged, { signal }).then((p) =>
        normalizePage<GenToken>(p as unknown as RawPage<GenToken>),
      ),
    staleTime: 30_000,
    ...opts,
  });
}

export function useToken(address: string | undefined, opts?: QueryOpts<GenToken>) {
  return useQuery({
    queryKey: firnQueryKey(
      { address: address?.toLowerCase() },
      { url: address ? getGetTokenUrl(address) : "/v1/tokens/_" },
    ),
    queryFn: ({ signal }) => fetchToken(address!, { signal }) as unknown as Promise<GenToken>,
    enabled: address != null && address.length === 42,
    staleTime: 60_000,
    ...opts,
  });
}

export function useTokenTransfers(
  address: string | undefined,
  params: { limit?: number; cursor?: string } = {},
  opts?: QueryOpts<Page<GenTokenTransfer>>,
) {
  const limit = params.limit ?? DEFAULT_LIMIT;
  const merged = { ...params, limit };
  return useQuery({
    queryKey: firnQueryKey(
      { address: address?.toLowerCase(), params: merged },
      { url: address ? getListTokenTransfersUrl(address, merged) : "/v1/tokens/_/transfers" },
    ),
    queryFn: ({ signal }) =>
      fetchTokenTransfers(address!, merged, { signal }).then((p) =>
        normalizePage<GenTokenTransfer>(p as unknown as RawPage<GenTokenTransfer>),
      ),
    enabled: address != null && address.length === 42,
    staleTime: 5_000,
    ...opts,
  });
}

export function useTokenHolders(
  address: string | undefined,
  params: { limit?: number } = {},
  opts?: QueryOpts<Page<GenTokenHolder>>,
) {
  const limit = params.limit ?? 100;
  const merged = { ...params, limit };
  return useQuery({
    queryKey: firnQueryKey(
      { address: address?.toLowerCase(), params: merged },
      { url: address ? getListTokenHoldersUrl(address, merged) : "/v1/tokens/_/holders" },
    ),
    queryFn: ({ signal }) =>
      fetchTokenHolders(address!, merged, { signal }).then((p) =>
        normalizePage<GenTokenHolder>(p as unknown as RawPage<GenTokenHolder>),
      ),
    enabled: address != null && address.length === 42,
    staleTime: 30_000,
    ...opts,
  });
}

// ---------------------------------------------------------------------------
// Address detail
// ---------------------------------------------------------------------------

export function useAddress(hash: string | undefined, opts?: QueryOpts<FirnAddress>) {
  return useQuery({
    queryKey: firnQueryKey(
      { hash: hash?.toLowerCase() },
      { url: hash ? getGetAddressUrl(hash) : "/v1/addresses/_" },
    ),
    queryFn: ({ signal }) => fetchAddress(hash!, { signal }) as unknown as Promise<FirnAddress>,
    enabled: hash != null && hash.length === 42,
    staleTime: 10_000,
    ...opts,
  });
}

export function useAddressInternalTransactions(
  hash: string | undefined,
  params: { limit?: number; cursor?: string } = {},
  opts?: QueryOpts<Page<GenInternalTransaction>>,
) {
  const limit = params.limit ?? DEFAULT_LIMIT;
  const merged = { ...params, limit };
  return useQuery({
    queryKey: firnQueryKey(
      { hash: hash?.toLowerCase(), params: merged },
      {
        url: hash
          ? getListAddressInternalTransactionsUrl(hash, merged)
          : "/v1/addresses/_/internal-transactions",
      },
    ),
    queryFn: ({ signal }) =>
      fetchAddressInternalTransactions(hash!, merged, { signal }).then((p) =>
        normalizePage<GenInternalTransaction>(p as unknown as RawPage<GenInternalTransaction>),
      ),
    enabled: hash != null && hash.length === 42,
    staleTime: 5_000,
    ...opts,
  });
}

export function useAddressTokenTransfers(
  hash: string | undefined,
  params: { limit?: number; cursor?: string } = {},
  opts?: QueryOpts<Page<GenTokenTransfer>>,
) {
  const limit = params.limit ?? DEFAULT_LIMIT;
  const merged = { ...params, limit };
  return useQuery({
    queryKey: firnQueryKey(
      { hash: hash?.toLowerCase(), params: merged },
      {
        url: hash
          ? getListAddressTokenTransfersUrl(hash, merged)
          : "/v1/addresses/_/token-transfers",
      },
    ),
    queryFn: ({ signal }) =>
      fetchAddressTokenTransfers(hash!, merged, { signal }).then((p) =>
        normalizePage<GenTokenTransfer>(p as unknown as RawPage<GenTokenTransfer>),
      ),
    enabled: hash != null && hash.length === 42,
    staleTime: 5_000,
    ...opts,
  });
}

export function useAddressLogs(
  hash: string | undefined,
  params: { limit?: number; cursor?: string } = {},
  opts?: QueryOpts<Page<GenAddressLog>>,
) {
  const limit = params.limit ?? DEFAULT_LIMIT;
  const merged = { ...params, limit };
  return useQuery({
    queryKey: firnQueryKey(
      { hash: hash?.toLowerCase(), params: merged },
      { url: hash ? getListAddressLogsUrl(hash, merged) : "/v1/addresses/_/logs" },
    ),
    queryFn: ({ signal }) =>
      fetchAddressLogs(hash!, merged, { signal }).then((p) =>
        normalizePage<GenAddressLog>(p as unknown as RawPage<GenAddressLog>),
      ),
    enabled: hash != null && hash.length === 42,
    staleTime: 5_000,
    ...opts,
  });
}

export function useAddressTransactions(
  hash: string | undefined,
  params: { limit?: number; cursor?: string } = {},
  opts?: QueryOpts<Page<GenTransaction>>,
) {
  const limit = params.limit ?? DEFAULT_LIMIT;
  const merged = { ...params, limit, address: hash };
  return useQuery({
    queryKey: firnQueryKey({ hash, params: merged }, { url: getListTransactionsUrl(merged) }),
    queryFn: ({ signal }) =>
      fetchTransactions(merged, { signal }).then((p) =>
        normalizePage<GenTransaction>(p as unknown as RawPage<GenTransaction>),
      ),
    enabled: hash != null && hash.length > 0,
    ...opts,
  });
}

// ---------------------------------------------------------------------------
// ICM
// ---------------------------------------------------------------------------

export function useICMMessages(
  params: {
    limit?: number;
    cursor?: string;
    kind?: ICMKind;
    messageId?: string;
    address?: string;
    block?: number;
  } = {},
  opts?: QueryOpts<Page<GenMessage>>,
) {
  const limit = params.limit ?? DEFAULT_LIMIT;
  const merged = { ...params, limit };
  return useQuery({
    queryKey: firnQueryKey({ params: merged }, { url: getListICMMessagesUrl(merged) }),
    queryFn: ({ signal }) =>
      fetchICMMessages(merged, { signal }).then((p) =>
        normalizePage<GenMessage>(p as unknown as RawPage<GenMessage>),
      ),
    ...opts,
  });
}

export function useTeleporterMessages(
  params: {
    limit?: number;
    cursor?: string;
    messageId?: string;
    address?: string;
    block?: number;
  } = {},
  opts?: QueryOpts<Page<GenMessage>>,
) {
  const limit = params.limit ?? DEFAULT_LIMIT;
  const merged = { ...params, limit };
  return useQuery({
    queryKey: firnQueryKey({ params: merged }, { url: getListTeleporterMessagesUrl(merged) }),
    queryFn: ({ signal }) =>
      fetchTeleporterMessages(merged, { signal }).then((p) =>
        normalizePage<GenMessage>(p as unknown as RawPage<GenMessage>),
      ),
    ...opts,
  });
}

// ---------------------------------------------------------------------------
// Sourcify + selector decoding (network-agnostic — global resources)
// ---------------------------------------------------------------------------

export function useContractSource(
  chainId: number | string | undefined,
  address: string | undefined,
  opts?: QueryOpts<SourcifyContract | null>,
) {
  return useQuery({
    queryKey: [
      /* network-agnostic: Sourcify is keyed globally by EVM chainId. */
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

export function useMethodSignature({
  selector,
  contractAddress,
  chainId,
  firnName,
}: {
  selector: string | undefined;
  contractAddress: string | null | undefined;
  chainId: number | string | undefined;
  firnName?: string | null;
}) {
  const hasFirnName = !!firnName;
  const sourcify = useContractSource(
    chainId,
    hasFirnName ? undefined : (contractAddress ?? undefined),
  );

  return useQuery({
    queryKey: [
      /* network-agnostic: 4-byte selectors are a global signature space. */
      "selector",
      selector ?? null,
      contractAddress ?? null,
      hasFirnName ? "firn" : (sourcify.data?.match ?? null),
      firnName ?? null,
    ] as const,
    queryFn: async (): Promise<SelectorMatch | null> => {
      if (!selector) return null;
      if (firnName) return { signature: firnName, name: firnName, source: "firn" };
      const fromAbi = decodeFromAbi(selector, sourcify.data?.abi);
      if (fromAbi) return fromAbi;
      return fetchExternalSelector(selector);
    },
    enabled: !!selector && (hasFirnName || !sourcify.isPending),
    staleTime: 24 * 60 * 60 * 1000,
    retry: 1,
  });
}
