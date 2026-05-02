// firn v1 API types — Transaction + adjacent data exposed for the
// address detail page (internal transactions, logs).
// Mirrors firn/docs/API_SPEC.md.

import type { BlockRef } from "./common";

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
