// firn v1 API types — P-Chain validators + ACP-77 L1 validators.
//
// Mirrors the platform.getCurrentValidators response. firn's /v1/validators
// is a thin proxy + cache over the configured P-Chain endpoint, optionally
// scoped to the L1's subnet ID.

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
