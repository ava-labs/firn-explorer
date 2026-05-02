// firn v1 API types — Chain, Stats, Block.
// Mirrors firn/docs/API_SPEC.md.

import type { Transaction } from "./transactions";

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
