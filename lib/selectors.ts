/**
 * 4-byte function selector → human-readable signature decoder.
 *
 * Resolution chain (in order, first hit wins):
 *
 *   1. **firn** — when the indexer has already labelled `method.name`
 *      (e.g. a recognised ERC-20 `transfer`), we trust it.
 *   2. **Sourcify** — when `to` is a verified contract on
 *      https://sourcify.dev, derive the selector from each function in the
 *      ABI and match against the tx's selector. Highest-trust source for
 *      *this specific contract*.
 *   3. **openchain.xyz signature database** — community signature DB,
 *      typically the freshest. Returns multiple candidates per selector
 *      (collisions are rare but possible); we take the first.
 *   4. **4byte.directory** — long-running open registry; useful tail
 *      coverage when openchain misses.
 *
 * Each call below is intentionally non-fatal: a network error or 404 just
 * shifts to the next source. Callers see "loading" → either a name or the
 * raw selector.
 */

import { toFunctionSelector } from "viem";
import type { AbiItem } from "./sourcify";

const OPENCHAIN_BASE = "https://api.openchain.xyz/signature-database/v1/lookup";
const FOURBYTE_BASE = "https://www.4byte.directory/api/v1/signatures/";

export interface SelectorMatch {
  /** Function signature in solidity-ish form: `transfer(address,uint256)`. */
  signature: string;
  /** Just the function name (left of `(`). */
  name: string;
  /** Where this match came from. firn = backend resolver (static
   * registry + chdb-cached openchain.xyz lookup); sourcify =
   * verified-contract ABI; openchain/4byte = direct browser fetch
   * (only reached when firn doesn't know AND no Sourcify match). */
  source: "firn" | "sourcify" | "openchain" | "4byte";
}

/**
 * Look up a 4-byte selector against the Sourcify ABI of `contractAddress`,
 * if any. Cheaper than going to network — the ABI is already in tanstack
 * cache from the address page's contract panel.
 */
export function decodeFromAbi(
  selector: string | undefined,
  abi: AbiItem[] | undefined,
): SelectorMatch | null {
  if (!selector || !abi) return null;
  const want = selector.toLowerCase();
  for (const item of abi) {
    if (item.type !== "function" || !item.name) continue;
    try {
      const sig = abiSignatureForSelector(item);
      const sel = toFunctionSelector(sig).toLowerCase();
      if (sel === want) {
        return { signature: sig, name: item.name, source: "sourcify" };
      }
    } catch {
      // Malformed ABI item — skip silently.
    }
  }
  return null;
}

/**
 * `transfer(address,uint256)` — viem-compatible signature for selector
 * computation. Strips parameter names because selectors are over types only.
 */
function abiSignatureForSelector(item: AbiItem): string {
  const types = (item.inputs ?? []).map((p) => normaliseType(p.type, p));
  return `${item.name ?? ""}(${types.join(",")})`;
}

interface InputLike {
  type: string;
  components?: InputLike[];
}

function normaliseType(type: string, parent?: InputLike): string {
  // Tuples need their components expanded: `tuple(address,uint256)[]`.
  if (type.startsWith("tuple") && parent?.components?.length) {
    const inner = parent.components.map((c) => normaliseType(c.type, c)).join(",");
    const arraySuffix = type.slice("tuple".length); // `` | `[]` | `[2]`
    return `(${inner})${arraySuffix}`;
  }
  return type;
}

/**
 * Query openchain.xyz signature DB. Returns the first candidate or null.
 * Result shape:
 *   { ok: true, result: { function: { "0xa9059cbb": [{ name: "transfer(address,uint256)" }] } } }
 */
export async function fetchOpenchainSelector(selector: string): Promise<SelectorMatch | null> {
  const url = `${OPENCHAIN_BASE}?function=${encodeURIComponent(selector)}`;
  const res = await fetch(url, { headers: { Accept: "application/json" } });
  if (!res.ok) return null;
  const json = (await res.json()) as {
    ok?: boolean;
    result?: { function?: Record<string, Array<{ name: string }> | undefined> };
  };
  const candidates = json.result?.function?.[selector.toLowerCase()];
  const first = candidates?.[0]?.name;
  if (!first) return null;
  return {
    signature: first,
    name: first.split("(")[0] ?? first,
    source: "openchain",
  };
}

/**
 * Query 4byte.directory. Returns the most-popular candidate (highest id, in
 * practice the most-recently submitted matching signature isn't necessarily
 * the right one — collisions are rare so first result is usually correct).
 * Result shape:
 *   { results: [{ id, text_signature: "transfer(address,uint256)", ... }] }
 */
export async function fetch4byteSelector(selector: string): Promise<SelectorMatch | null> {
  const url = `${FOURBYTE_BASE}?hex_signature=${encodeURIComponent(selector)}`;
  const res = await fetch(url, { headers: { Accept: "application/json" } });
  if (!res.ok) return null;
  const json = (await res.json()) as {
    results?: Array<{ id: number; text_signature: string }>;
  };
  // 4byte returns most-recent first; pick the lowest id (oldest, usually the
  // canonical one that other DBs picked up too).
  const sorted = (json.results ?? []).slice().sort((a, b) => a.id - b.id);
  const first = sorted[0]?.text_signature;
  if (!first) return null;
  return {
    signature: first,
    name: first.split("(")[0] ?? first,
    source: "4byte",
  };
}

/**
 * Try openchain first, then 4byte. Each step is its own catch — both being
 * unreachable just yields null.
 */
export async function fetchExternalSelector(selector: string): Promise<SelectorMatch | null> {
  try {
    const oc = await fetchOpenchainSelector(selector);
    if (oc) return oc;
  } catch {
    /* fall through */
  }
  try {
    return await fetch4byteSelector(selector);
  } catch {
    return null;
  }
}
