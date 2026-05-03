/**
 * Genesis sentinel helpers — single source of truth for the various
 * "is this the null/zero/genesis reference?" checks scattered across
 * the explorer. Mint events log Transfer.from = 0x0…0; firn's genesis
 * seeder synthesizes block-0 txs whose `from` is the zero address; the
 * URL/search bar accepts the literal "genesis" or "0" as shortcuts.
 * Keeping these constants and predicates colocated keeps callers from
 * re-deriving them inline (and getting them subtly wrong).
 */

import type { Transaction } from "@/lib/api/queries";

export const ZERO_HASH32 = "0x" + "0".repeat(64);

export const ZERO_ADDRESS = "0x" + "0".repeat(40);

// Wave 2 ships the dedicated /genesis route; until then, links 404.
export const GENESIS_HREF = "/genesis";

export function isGenesisTx(tx: Pick<Transaction, "block" | "from">): boolean {
  return tx.block.number === 0 && tx.from.toLowerCase() === ZERO_ADDRESS;
}

export function isGenesisRef(raw: string): boolean {
  const s = raw.trim().toLowerCase();
  return s === ZERO_HASH32 || s === ZERO_ADDRESS || s === "genesis" || s === "0";
}
