// firn v1 API types — hand-written, owned end-to-end.
// Mirrors firn/docs/API_SPEC.md.

export interface Page<T> {
  data: T[];
  cursor: Cursor;
}

export interface Cursor {
  next?: string;
  prev?: string;
}

export interface Chain {
  chainId: number;
  blockchainId: string;
  subnetId: string;
  network: "mainnet" | "testnet" | "local";
  name: string;
  nativeToken: NativeToken;
  headBlock: number;
  latestIndexedBlock: number;
  blockTimeMs: number;
}

export interface NativeToken {
  symbol: string;
  name: string;
  decimals: number;
}

export interface Stats {
  totalBlocks: string;
  totalTransactions: string;
  totalAddresses: string;
  transactionsLast24h: string;
  averageBlockTimeMs: number;
  gasPrice: GasPrice;
  networkUtilization: number;
  as: string; // ISO timestamp
}

export interface GasPrice {
  slow: string;
  average: string;
  fast: string;
}

export interface Block {
  number: number;
  hash: string;
  parentHash: string;
  timestamp: string; // ISO
  miner: string;
  size: number;
  gas: BlockGas;
  transactionsCount: number;
  /** Present only when ?expand=transactions */
  transactions?: Transaction[];
  /**
   * Optional Snowman++/Coreth consensus fields. firn does not yet expose
   * these on /v1/blocks; the explorer renders them whenever present so the
   * Consensus tab automatically lights up once firn ships them. The
   * proposed contract:
   *   timestampMs       — block produced-at, sub-second (Etna+).
   *   blockGasCost      — APR4 dynamic gas cost charged to producer.
   *   minDelayExcess    — ACP-176 dynamic-fee EWMA excess.
   *   extraData         — Coreth header extra bytes (hex).
   *   blockExtraData    — Atomic-tx envelope (hex), pre-Cortina.
   *   extDataGasUsed    — Gas for atomic data, pre-Cortina.
   */
  consensus?: BlockConsensus;
}

export interface BlockGas {
  limit: string;
  used: string;
  baseFeePerGas: string;
}

export interface BlockConsensus {
  timestampMs?: string;
  blockGasCost?: string;
  minDelayExcess?: string;
  extraData?: string;
  blockExtraData?: string;
  extDataGasUsed?: string;
  /**
   * Future: when firn proxies `proposervm.getProposedHeight` per block, fill
   * in the proposer NodeID and P-Chain reference height here.
   */
  proposerNodeID?: string;
  pChainHeight?: string;
}

export interface Transaction {
  hash: string;
  status: "success" | "failed";
  block: BlockRef;
  from: string;
  to: string | null;
  value: string;
  nonce: number;
  method: Method;
  gas: TransactionGas;
  logsCount: number;
  tracesCount: number;
  /** Present only when ?expand=logs */
  logs?: Log[];
  /** Present only when ?expand=traces */
  traces?: Trace[];
}

export interface BlockRef {
  number: number;
  hash: string;
  timestamp: string;
}

export interface Method {
  selector: string;
  name: string | null;
  decoded: unknown;
}

export interface TransactionGas {
  limit: number;
  used: number;
  price: string;
  priorityFee: string;
  baseFee: string;
}

export interface Log {
  logIndex: number;
  address: string;
  topics: string[];
  data: string;
}

export interface Trace {
  traceAddress: number[];
  from: string;
  to: string | null;
  gas: number;
  gasUsed: number;
  value: string;
  input: string;
  output: string;
  callType: string;
}

// ---------------------------------------------------------------------------
// Validators (P-Chain via firn /v1/validators)
//
// Mirrors the platform.getCurrentValidators response. firn's /v1/validators
// is a thin proxy + cache over the configured P-Chain endpoint, optionally
// scoped to the L1's subnet ID.
// ---------------------------------------------------------------------------

export interface ValidatorsResponse {
  validators: Validator[];
}

export interface Validator {
  /** Add-validator tx ID (P-Chain), present for both classic and L1 validators. */
  txID: string;
  /**
   * ACP-77 L1 validator ID. Present only for validators on a non-Primary
   * subnet that has converted to an L1 (post-Etna). Use this to call
   * `platform.getL1Validator` for AVAX balance + BLS owners.
   */
  validationID?: string;
  /** Unix-second timestamp string (P-Chain returns numbers as strings). */
  startTime: string;
  endTime: string;
  /** Native nAVAX amount (string of large int) — Primary Network only. */
  stakeAmount?: string;
  /** Voting weight, including delegators. String of large int. */
  weight: string;
  nodeID: string;
  /**
   * BLS public key (hex). For Primary Network validators this is nested
   * under `signer.publicKey`; for ACP-77 L1 validators P-Chain may return
   * it at top level. We accept both.
   */
  publicKey?: string;
  /** 0..1 connectivity ratio, string. Primary Network only. */
  uptime?: string;
  connected?: boolean;
  /** Decimal percent string ("2"-"100" with up to 4 dec places). */
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

/**
 * Response from `validators.getCurrentValidators` on the subnet-evm
 * `/ext/bc/<chain>/validators` namespace (proxied by firn at
 * `GET /v1/validators/uptime`). Provides L1 uptime data that P-Chain's
 * `getCurrentValidators` doesn't return for L1 validators.
 *
 * Schema is permissive — subnet-evm versions vary in exactly which fields
 * accompany `nodeID` + `uptime`; we model only what we use.
 */
export interface L1UptimeResponse {
  validators: L1UptimeEntry[];
}

export interface L1UptimeEntry {
  nodeID: string;
  /** May be returned as 0..1 fractional ratio or 0..100 percent string. */
  uptime?: string | number;
  /** Sometimes returned as a separate "uptimePercent" string. */
  uptimePercent?: string | number;
  weight?: string;
  startTimestamp?: number | string;
  validationID?: string;
  isActive?: boolean;
  isConnected?: boolean;
  isL1Validator?: boolean;
}

/**
 * Response from `platform.getL1Validator(validationID)` — only meaningful
 * for ACP-77 L1 validators. `balance` is the remaining AVAX (in nAVAX) the
 * validator has deposited to pay continuous fees; once it hits zero the
 * validator is deactivated.
 */
export interface L1ValidatorDetails {
  subnetID: string;
  nodeID: string;
  /** BLS pubkey, hex. */
  publicKey: string;
  /** P-Chain bech32 owner that can withdraw remaining balance. */
  remainingBalanceOwner: RewardOwner;
  /** P-Chain bech32 owner that can deactivate the validator. */
  deactivationOwner: RewardOwner;
  /** Unix-second string. */
  startTime: string;
  weight: string;
  minNonce: string;
  /** Remaining AVAX balance (nAVAX), pays continuous fees. */
  balance: string;
  /** Pending nonce of the next Validator-Manager-issued tx for this validator. */
  height?: string;
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

export interface Address {
  hash: string;
  isContract: boolean;
  balance: string;
  transactionsCount: number;
  firstSeenBlock: number;
  lastSeenBlock: number;
  code: string | null;
  tokenBalances: unknown[];
}

// ---------------------------------------------------------------------------
// Tokens (ERC-20 / ERC-721 contracts detected via Transfer logs)
// ---------------------------------------------------------------------------

export interface Token {
  address: string;
  /** Human-readable token name. May be absent until firn has eth_call'd `name()`. */
  name?: string;
  /** Symbol from `symbol()`. May be absent. */
  symbol?: string;
  /** Decimals from `decimals()`. May be absent. */
  decimals?: number;
  /** Decimal string from `totalSupply()`. May be absent. */
  totalSupply?: string;
  /** How many Transfer events firn has seen for this contract. */
  transferCount: number;
  /** Approximate unique participant count (distinct from/to in Transfer logs). */
  holders: number;
  /** Block number where the first Transfer was observed. */
  firstSeenBlock: number;
}

/** One trace row surfaced for the address detail page. `to` is null for
 *  contract creation. `value` is uint256 decimal. */
export interface InternalTransaction {
  txHash: string;
  blockNumber: number;
  blockTime: string;
  traceAddress: number[];
  from: string;
  to?: string;
  value: string;
  gas: number;
  gasUsed: number;
  callType: string;
  txSuccess: boolean;
}

/** One log entry emitted by an address (or for an address). */
export interface AddressLog {
  blockNumber: number;
  blockTime: string;
  txHash: string;
  logIndex: number;
  address: string;
  topics: string[];
  data: string;
}

/** One row in `GET /v1/tokens/{address}/holders`. `balance` is the raw
 *  uint256 decimal from on-chain `balanceOf(address)`; format with the
 *  token's `decimals` for display. Server already filters out zero-balance
 *  entries and ranks descending. */
export interface TokenHolder {
  address: string;
  balance: string;
}

/** One decoded ERC-20 / ERC-721 Transfer event. `value` is the raw uint256
 *  decimal string; format with the token's `decimals` for display. */
export interface TokenTransfer {
  from: string;
  to: string;
  value: string;
  blockNumber: number;
  blockTime: string; // ISO
  txHash: string;
  logIndex: number;
}

// ---------------------------------------------------------------------------
// Avalanche Interchain Messaging (ICM)
//
// firn's `/v1/icm/messages` decodes the unified Warp + Teleporter event
// stream into one flat shape. Most fields are optional because event
// types differ — a unified UI keys off `kind` + `event`. Mirrors
// firn/internal/icm/decoder.go::Message.
// ---------------------------------------------------------------------------

export type ICMKind = "warp" | "teleporter";

export interface ICMMessage {
  kind: ICMKind;
  event: string;
  block: BlockRef;
  transactionHash: string;
  logIndex: number;
  contractAddress: string;
  /** Universal join key — bytes32 hex. Present on all Teleporter events
   *  and on Warp's unsignedMessageID. */
  messageId?: string;
  sourceBlockchainId?: string;
  destinationBlockchainId?: string;
  /** Resolved against P-Chain getBlockchains + primary-network seeds —
   *  the OPPOSITE side of the active chain is filled in implicitly
   *  (e.g. on a MessageExecuted event we're indexing the destination,
   *  so destinationBlockchainName = active chain name). Empty when the
   *  resolver doesn't know the chain (rare; subnet just created). */
  sourceBlockchainName?: string;
  sourceBlockchainCb58?: string;
  destinationBlockchainName?: string;
  destinationBlockchainCb58?: string;
  /** SendWarpMessage only. */
  sender?: string;
  /** ReceiveCrossChainMessage only. */
  deliverer?: string;
  rewardAddress?: string;
  /** RelayerRewardsRedeemed only. */
  asset?: string;
  amount?: string;
  /** Canonical Warp message bytes (hex). */
  unsignedMessage?: string;
  /** Raw ABI-encoded `data` from the log; consumers can decode the deeper
   *  TeleporterMessage / TeleporterFeeInfo structs when needed. */
  rawData?: string;
}

export interface APIError {
  error: {
    code: string;
    message: string;
    requestId?: string;
  };
}
