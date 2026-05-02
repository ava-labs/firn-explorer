/**
 * Sourcify client. Sourcify (https://sourcify.dev) is an open-source contract
 * source/metadata repository keyed on chainId + address. We use the v2 API:
 *
 *   GET https://sourcify.dev/server/v2/contract/{chainId}/{address}?fields=all
 *
 * Match status:
 *   - "exact_match"  — bytecode + metadata + sources all match (highest trust)
 *   - "match"        — bytecode matches (slightly less strict)
 *   - undefined / 404 — not verified on Sourcify
 *
 * For an L1 with a custom chain ID that Sourcify doesn't index yet, expect 404
 * or `match: undefined`. The UI should degrade gracefully to "not verified".
 */

const SOURCIFY_BASE = "https://sourcify.dev/server/v2";

export type SourcifyMatch = "exact_match" | "match" | null;

export interface SourcifyContract {
  /** Verification result. null when no match found. */
  match: SourcifyMatch;
  /** Verification of contract creation bytecode (when available). */
  creationMatch?: SourcifyMatch;
  /** Verification of runtime (deployed) bytecode. */
  runtimeMatch?: SourcifyMatch;
  /** Solidity ABI as parsed JSON. */
  abi?: AbiItem[];
  /** Compilation metadata.json content. */
  metadata?: unknown;
  /** Compilation summary (compiler version, settings). */
  compilation?: {
    language?: string;
    compiler?: string;
    compilerVersion?: string;
    name?: string;
    fullyQualifiedName?: string;
  };
  /** Source files: path → content. */
  sources?: SourcifySource[];
  /** Verified-at timestamp (ISO). */
  verifiedAt?: string;
}

export interface SourcifySource {
  path: string;
  content: string;
}

export type AbiInputType = string;
export interface AbiInput {
  name: string;
  type: AbiInputType;
  internalType?: string;
  indexed?: boolean;
  components?: AbiInput[];
}

export interface AbiItem {
  type: "function" | "event" | "constructor" | "receive" | "fallback" | "error";
  name?: string;
  inputs?: AbiInput[];
  outputs?: AbiInput[];
  stateMutability?: "pure" | "view" | "nonpayable" | "payable";
  anonymous?: boolean;
}

/**
 * Fetch contract source/metadata from Sourcify. Returns `null` when the
 * contract is not verified (404 or empty match).
 *
 * Sourcify is a third-party service; failures are intentionally non-fatal.
 * Callers should treat any thrown error as "not verified".
 */
export async function fetchSourcifyContract(
  chainId: number | string,
  address: string,
  init?: RequestInit,
): Promise<SourcifyContract | null> {
  const url = `${SOURCIFY_BASE}/contract/${chainId}/${address}?fields=all`;
  const res = await fetch(url, {
    ...init,
    headers: {
      Accept: "application/json",
      ...(init?.headers ?? {}),
    },
  });

  if (res.status === 404) return null;
  if (!res.ok) {
    throw new Error(`Sourcify ${res.status} ${res.statusText}`);
  }

  const json = (await res.json()) as Partial<SourcifyContract> & {
    error?: string;
  };
  if (json.error) return null;
  if (!json.match && !json.runtimeMatch && !json.creationMatch) return null;

  return {
    match: json.match ?? json.runtimeMatch ?? json.creationMatch ?? null,
    creationMatch: json.creationMatch,
    runtimeMatch: json.runtimeMatch,
    abi: json.abi,
    metadata: json.metadata,
    compilation: json.compilation,
    sources: json.sources,
    verifiedAt: json.verifiedAt,
  };
}

/** Group ABI items by intent (read / write / event / error). */
export function groupAbi(abi: AbiItem[] | undefined): {
  read: AbiItem[];
  write: AbiItem[];
  events: AbiItem[];
  errors: AbiItem[];
} {
  const out = {
    read: [] as AbiItem[],
    write: [] as AbiItem[],
    events: [] as AbiItem[],
    errors: [] as AbiItem[],
  };
  for (const item of abi ?? []) {
    if (item.type === "event") {
      out.events.push(item);
    } else if (item.type === "error") {
      out.errors.push(item);
    } else if (item.type === "function") {
      const m = item.stateMutability;
      if (m === "view" || m === "pure") out.read.push(item);
      else out.write.push(item);
    }
  }
  return out;
}

/** Render an ABI item's solidity-ish signature: `name(type1,type2)`. */
export function abiSignature(item: AbiItem): string {
  const inputs = (item.inputs ?? []).map((p) => p.type + (p.name ? ` ${p.name}` : "")).join(",");
  return `${item.name ?? "<unnamed>"}(${inputs})`;
}

/** Infer file language from a source path for syntax-highlight hints. */
export function fileLanguage(path: string): "solidity" | "json" | "vyper" | "text" {
  if (path.endsWith(".sol")) return "solidity";
  if (path.endsWith(".json")) return "json";
  if (path.endsWith(".vy") || path.endsWith(".vyper")) return "vyper";
  return "text";
}
