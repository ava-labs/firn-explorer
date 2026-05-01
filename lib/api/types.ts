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
}

export interface BlockGas {
  limit: string;
  used: string;
  baseFeePerGas: string;
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
// WebSocket
// ---------------------------------------------------------------------------

export type WsClientMsg =
  | { op: "subscribe"; topic: WsTopic; filter?: Record<string, string> }
  | { op: "unsubscribe"; topic: WsTopic }
  | { op: "ping" };

export type WsTopic = "blocks" | "transactions" | "logs" | "icm";

export type WsServerMsg =
  | { topic: "blocks"; event: "new"; data: Block }
  | { topic: "transactions"; event: "new" | "removed"; data: Transaction | { hash: string } }
  | { topic: "logs"; event: "new"; data: Log }
  | { type: "ping" }
  | { type: "pong" }
  | { type: "error"; code: string; message: string };

export interface APIError {
  error: {
    code: string;
    message: string;
    requestId?: string;
  };
}
