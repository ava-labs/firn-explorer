// firn v1 API common types — shared across multiple domains.
// Mirrors firn/docs/API_SPEC.md.

export interface Page<T> {
  data: T[];
  cursor: Cursor;
}

export interface Cursor {
  next?: string;
  prev?: string;
}

/** Compact reference to a block — used embedded inside Transaction, ICMMessage, etc. */
export interface BlockRef {
  number: number;
  hash: string;
  timestamp: string;
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

export interface APIError {
  error: {
    code: string;
    message: string;
    requestId?: string;
  };
}
