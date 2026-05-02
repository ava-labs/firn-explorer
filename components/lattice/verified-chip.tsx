import { Chip } from "./chip";
import { lookupKnownContract, type KnownContract } from "@/lib/known-contracts";

/**
 * Renders a verified-contract badge for an address that's in firn's
 * known-contracts registry (canonical Avalanche infrastructure with
 * deterministic deployment addresses — Teleporter, Warp precompile,
 * etc.). Returns null when the address isn't recognized so callers
 * can place it inline without worrying about empty space.
 *
 * For general dapp verification (per-chain Sourcify match), use the
 * separate `useContractSource` hook — that's a different verification
 * surface than this offline registry.
 */
export function VerifiedContractChip({
  address,
  showVersion = true,
}: {
  address: string | undefined;
  showVersion?: boolean;
}) {
  const known = lookupKnownContract(address);
  if (!known) return null;
  return <Chip tone="good">{label(known, showVersion)}</Chip>;
}

function label(c: KnownContract, showVersion: boolean): string {
  const v = showVersion && c.version ? ` ${c.version}` : "";
  return `✓ ${c.name}${v}`;
}
