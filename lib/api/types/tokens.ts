// firn v1 API types — ERC-20 / ERC-721 contracts detected via Transfer logs.

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
