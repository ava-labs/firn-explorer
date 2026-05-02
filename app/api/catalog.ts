// firn v1 endpoint catalog driving the API playground at /api.
// Mirrors firn/internal/api/api.go::routes — keep in sync when you add
// new endpoints there.

export type Param = {
  name: string;
  type: string;
  required?: boolean;
  example?: string;
  description?: string;
  /** When set, the playground seeds the value from chain context on first
   *  render (e.g. fill subnetID from the active chain's subnet). */
  suggest?: "subnetId" | "blockchainId" | "ownAddress";
};

export type Endpoint = {
  id: string;
  method: "GET" | "POST" | "WS";
  path: string;
  /** Compact path for the sidebar (defaults to `path`). */
  shortPath?: string;
  title: string;
  description: string;
  pathParams?: Param[];
  queryParams?: Param[];
  /** For POST endpoints — initial JSON body. */
  exampleBody?: string;
};

export type Group = {
  id: string;
  label: string;
  endpoints: Endpoint[];
};

const PAGINATION: Param[] = [
  { name: "limit", type: "integer", example: "50", description: "Max rows to return. Default 50." },
  {
    name: "cursor",
    type: "string",
    description: "Opaque cursor from a prior response's `cursor.next` / `cursor.prev`.",
  },
];

export const CATALOG: Group[] = [
  {
    id: "chain",
    label: "Chain",
    endpoints: [
      {
        id: "chain.get",
        method: "GET",
        path: "/v1/chain",
        title: "Chain metadata",
        description:
          "Active L1's identifying data — chainId, blockchainId, subnetId, native token, indexer head.",
      },
      {
        id: "stats.get",
        method: "GET",
        path: "/v1/stats",
        title: "Network stats",
        description:
          "Aggregate counts and rolling-window metrics: total blocks, transactions, addresses, 24h volume, gas-price quantiles, network utilization.",
      },
      {
        id: "chain.config",
        method: "GET",
        path: "/v1/chain/config",
        title: "Chain config",
        description:
          "subnet-evm `eth_getChainConfig` cached — fork activations and chain-level parameters.",
      },
      {
        id: "chain.rules",
        method: "GET",
        path: "/v1/chain/rules",
        title: "Active chain rules",
        description:
          "subnet-evm `eth_getActiveRulesAt` at the given timestamp. Defaults to chain head when `timestamp` is omitted.",
        queryParams: [
          {
            name: "timestamp",
            type: "number",
            example: "1732550400",
            description:
              "Unix-seconds timestamp to evaluate network upgrades at. Optional — empty = chain head.",
          },
        ],
      },
      {
        id: "chain.precompiles",
        method: "GET",
        path: "/v1/chain/precompiles",
        title: "Active precompiles",
        description:
          "subnet-evm `eth_getActivePrecompilesAt` at the given timestamp. Defaults to chain head.",
        queryParams: [
          {
            name: "timestamp",
            type: "number",
            example: "1732550400",
            description: "Unix-seconds timestamp. Optional — empty = chain head.",
          },
        ],
      },
      {
        id: "chain.proposer",
        method: "GET",
        path: "/v1/chain/proposer",
        title: "ProposerVM state",
        description:
          "`proposervm.getProposedHeight` — the P-Chain height the ProposerVM has pinned for validator-set lookup on this L1.",
      },
    ],
  },
  {
    id: "blocks",
    label: "Blocks",
    endpoints: [
      {
        id: "blocks.list",
        method: "GET",
        path: "/v1/blocks",
        title: "List blocks",
        description: "Newest-first paginated block list.",
        queryParams: PAGINATION,
      },
      {
        id: "blocks.get",
        method: "GET",
        path: "/v1/blocks/{id}",
        shortPath: "/v1/blocks/{id}",
        title: "Block by number or hash",
        description: "`{id}` may be a decimal block height, a 0x-prefixed block hash, or `latest`.",
        pathParams: [
          {
            name: "id",
            type: "string",
            required: true,
            example: "latest",
            description: "Decimal height, 0x hash, or `latest`.",
          },
        ],
      },
      {
        id: "blocks.txs",
        method: "GET",
        path: "/v1/blocks/{id}/transactions",
        shortPath: "/v1/blocks/{id}/transactions",
        title: "Transactions in block",
        description: "Paginated tx list scoped to one block.",
        pathParams: [{ name: "id", type: "string", required: true, example: "latest" }],
        queryParams: PAGINATION,
      },
    ],
  },
  {
    id: "transactions",
    label: "Transactions",
    endpoints: [
      {
        id: "txs.list",
        method: "GET",
        path: "/v1/transactions",
        title: "List transactions",
        description: "Newest-first paginated tx list. Filter by address, method, or status.",
        queryParams: [
          ...PAGINATION,
          { name: "address", type: "address", description: "From or to address (0x-prefixed)." },
          {
            name: "method",
            type: "string",
            description: "Function selector (`0x...`) or canonical name.",
          },
          { name: "status", type: "enum", description: "`success` or `failed`." },
        ],
      },
      {
        id: "txs.get",
        method: "GET",
        path: "/v1/transactions/{hash}",
        shortPath: "/v1/transactions/{hash}",
        title: "Transaction by hash",
        description:
          "Full tx + receipt. Pass `expand=logs,traces` to include decoded logs and call traces.",
        pathParams: [{ name: "hash", type: "0x32-byte hash", required: true }],
        queryParams: [
          {
            name: "expand",
            type: "string",
            example: "logs,traces",
            description: "CSV: `logs`, `traces`.",
          },
        ],
      },
    ],
  },
  {
    id: "tokens",
    label: "Tokens",
    endpoints: [
      {
        id: "tokens.list",
        method: "GET",
        path: "/v1/tokens",
        title: "List tokens",
        description: "Newest-first list of tokens firn has indexed (ERC-20 + ERC-721).",
        queryParams: PAGINATION,
      },
      {
        id: "tokens.get",
        method: "GET",
        path: "/v1/tokens/{address}",
        shortPath: "/v1/tokens/{address}",
        title: "Token by address",
        description:
          "Token metadata — name, symbol, decimals, totalSupply (eth_call'd lazily and cached).",
        pathParams: [{ name: "address", type: "address", required: true }],
      },
      {
        id: "tokens.transfers",
        method: "GET",
        path: "/v1/tokens/{address}/transfers",
        shortPath: "/v1/tokens/{address}/transfers",
        title: "Token transfers",
        description: "Decoded `Transfer` events for one token, newest first.",
        pathParams: [{ name: "address", type: "address", required: true }],
        queryParams: PAGINATION,
      },
      {
        id: "tokens.holders",
        method: "GET",
        path: "/v1/tokens/{address}/holders",
        shortPath: "/v1/tokens/{address}/holders",
        title: "Token holders",
        description: "Top holders of one token, by balance.",
        pathParams: [{ name: "address", type: "address", required: true }],
        queryParams: PAGINATION,
      },
    ],
  },
  {
    id: "addresses",
    label: "Addresses",
    endpoints: [
      {
        id: "addr.get",
        method: "GET",
        path: "/v1/addresses/{address}",
        shortPath: "/v1/addresses/{address}",
        title: "Address summary",
        description: "Balance, tx counts, contract metadata if applicable.",
        pathParams: [{ name: "address", type: "address", required: true, suggest: "ownAddress" }],
      },
      {
        id: "addr.internal",
        method: "GET",
        path: "/v1/addresses/{address}/internal-transactions",
        shortPath: "/v1/addresses/{address}/internal-transactions",
        title: "Internal transactions",
        description: "Internal call traces touching this address.",
        pathParams: [{ name: "address", type: "address", required: true, suggest: "ownAddress" }],
        queryParams: PAGINATION,
      },
      {
        id: "addr.transfers",
        method: "GET",
        path: "/v1/addresses/{address}/token-transfers",
        shortPath: "/v1/addresses/{address}/token-transfers",
        title: "Address token transfers",
        description: "ERC-20 / ERC-721 transfers in or out of this address.",
        pathParams: [{ name: "address", type: "address", required: true, suggest: "ownAddress" }],
        queryParams: PAGINATION,
      },
      {
        id: "addr.logs",
        method: "GET",
        path: "/v1/addresses/{address}/logs",
        shortPath: "/v1/addresses/{address}/logs",
        title: "Address logs",
        description: "Raw event logs emitted by this address (only meaningful for contracts).",
        pathParams: [{ name: "address", type: "address", required: true, suggest: "ownAddress" }],
        queryParams: PAGINATION,
      },
    ],
  },
  {
    id: "icm",
    label: "ICM",
    endpoints: [
      {
        id: "icm.list",
        method: "GET",
        path: "/v1/icm/messages",
        title: "ICM messages",
        description:
          "Unified Avalanche Warp + Teleporter event stream, decoded. Filter by kind, messageId, or emitter contract.",
        queryParams: [
          ...PAGINATION,
          { name: "kind", type: "enum", description: "`warp` | `teleporter`." },
          {
            name: "messageId",
            type: "bytes32",
            description: "Single-message lookup (matches both Teleporter and Warp unsigned IDs).",
          },
          { name: "address", type: "address", description: "Emitter contract." },
        ],
      },
      {
        id: "teleporter.list",
        method: "GET",
        path: "/v1/teleporter/messages",
        title: "Teleporter messages",
        description: "Sugar wrapper around `/v1/icm/messages` with `kind=teleporter` pre-applied.",
        queryParams: [
          ...PAGINATION,
          { name: "messageId", type: "bytes32" },
          { name: "address", type: "address" },
        ],
      },
    ],
  },
  {
    id: "validators",
    label: "Validators",
    endpoints: [
      {
        id: "validators.list",
        method: "GET",
        path: "/v1/validators",
        title: "Current validators",
        description:
          "Cached `platform.getCurrentValidators` from P-Chain. Defaults to the active L1's subnet; pass `subnetID` to override.",
        queryParams: [
          {
            name: "subnetID",
            type: "string",
            suggest: "subnetId",
            description: "Override subnet to query.",
          },
        ],
      },
      {
        id: "validators.uptime",
        method: "GET",
        path: "/v1/validators/uptime",
        title: "L1 uptime",
        description:
          "Cached `validators.getCurrentValidators` from the L1's `/ext/bc/<chain>/validators` namespace. Reports L1 uptime that P-Chain doesn't expose.",
      },
    ],
  },
  {
    id: "rpc",
    label: "JSON-RPC passthrough",
    endpoints: [
      {
        id: "rpc.cchain",
        method: "POST",
        path: "/v1/rpc",
        title: "Subnet-EVM RPC",
        description:
          "Forwards JSON-RPC verbatim to the L1's subnet-evm endpoint. Single requests or batches.",
        exampleBody: JSON.stringify(
          { jsonrpc: "2.0", id: 1, method: "eth_blockNumber", params: [] },
          null,
          2,
        ),
      },
      {
        id: "rpc.pchain",
        method: "POST",
        path: "/v1/rpc/p",
        title: "P-Chain RPC",
        description: "Forwards JSON-RPC verbatim to the configured P-Chain endpoint.",
        exampleBody: JSON.stringify(
          { jsonrpc: "2.0", id: 1, method: "platform.getHeight", params: {} },
          null,
          2,
        ),
      },
      {
        id: "rpc.proposer",
        method: "POST",
        path: "/v1/rpc/proposer",
        title: "ProposerVM RPC",
        description: "Forwards JSON-RPC to the L1's `/proposervm` namespace.",
        exampleBody: JSON.stringify(
          { jsonrpc: "2.0", id: 1, method: "proposervm.getProposedHeight", params: [] },
          null,
          2,
        ),
      },
      {
        id: "rpc.validators",
        method: "POST",
        path: "/v1/rpc/validators",
        title: "Validators namespace RPC",
        description: "Forwards JSON-RPC to the L1's `/validators` namespace.",
        exampleBody: JSON.stringify(
          { jsonrpc: "2.0", id: 1, method: "validators.getCurrentValidators", params: [] },
          null,
          2,
        ),
      },
    ],
  },
  {
    id: "stream",
    label: "Streaming",
    endpoints: [
      {
        id: "ws.stream",
        method: "WS",
        path: "/v1/stream",
        title: "Live event WebSocket",
        description:
          "Bidirectional WebSocket. Subscribe to `blocks`, `transactions`, `logs`, or `icm`. Frame format documented in firn/docs/API_SPEC.md. Not runnable from this playground — open it from your client of choice.",
      },
    ],
  },
];
