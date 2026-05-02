/**
 * Pre-verified contract registry — addresses we know the bytecode of
 * because they're canonical Avalanche infrastructure with the same
 * address on every chain.
 *
 * Why this is separate from Sourcify: these contracts are deployed at
 * deterministic addresses (CREATE2 with a known salt + universal
 * deployer), so they're guaranteed identical bytecode on every L1. We
 * don't need a per-chain Sourcify roundtrip to know what they are — we
 * can ship the verification offline.
 *
 * The registry is intentionally tiny. Don't add general-purpose dapp
 * contracts here; that's what Sourcify is for. Only add things that:
 *   1. Have a single canonical address shared across every Avalanche L1
 *   2. Are foundational protocol surface (Teleporter, Warp precompile,
 *      ValidatorManager, ICTT registries, etc.) — i.e. things every
 *      explorer should recognize without per-deployment configuration.
 */

export interface KnownContract {
  /** Display name e.g. "Teleporter Messenger". */
  name: string;
  /** Optional protocol family for grouping in UI. */
  family?: "teleporter" | "warp" | "validator-manager" | "ictt";
  /** Version string when the protocol publishes one. Free-form. */
  version?: string;
  /** External docs URL for the protocol. */
  docsUrl?: string;
  /** Canonical bytecode source (e.g. GitHub release tag). */
  sourceUrl?: string;
  /** True when we've published a deployment audit / formal source match.
   *  Always true for entries in this registry — the registry IS the
   *  audit. Kept as an explicit flag so consumers can distinguish
   *  "registry-known" from "Sourcify-verified" if that becomes useful. */
  verified: true;
}

/**
 * Address → contract metadata.
 *
 * IMPORTANT: keys must be lowercase 0x-prefixed 20-byte addresses. Use
 * `lookupKnownContract()` for case-insensitive access.
 */
const REGISTRY: Record<string, KnownContract> = {
  // TeleporterMessenger v1.0.0 — deployed via Nick's Method to the
  // same address on every Avalanche L1 / Subnet that runs Teleporter.
  // https://github.com/ava-labs/teleporter/releases/tag/v1.0.0
  "0x253b2784c75e510dd0ff1da844684a1ac0aa5fcf": {
    name: "Teleporter Messenger",
    family: "teleporter",
    version: "v1.0.0",
    docsUrl: "https://github.com/ava-labs/teleporter",
    sourceUrl:
      "https://github.com/ava-labs/teleporter/blob/v1.0.0/contracts/teleporter/TeleporterMessenger.sol",
    verified: true,
  },
  // TeleporterRegistry v1.0.0 — same deployer pattern, fixed address.
  // Tracks TeleporterMessenger versions so dapps can resolve "the
  // current messenger" without hardcoding.
  "0x827364da64fefe79d740a82c6dd56ab5a47b4423": {
    name: "Teleporter Registry",
    family: "teleporter",
    version: "v1.0.0",
    docsUrl: "https://github.com/ava-labs/teleporter",
    verified: true,
  },
  // Warp precompile — Avalanche subnet-evm precompile address. Same on
  // every chain. Not a contract per se (it's a stateless precompile)
  // but rendering "Warp Precompile" is more useful than the bare hex.
  "0x0200000000000000000000000000000000000005": {
    name: "Warp Precompile",
    family: "warp",
    docsUrl: "https://github.com/ava-labs/subnet-evm/tree/master/precompile/contracts/warp",
    verified: true,
  },
};

/**
 * Look up a contract in the known-addresses registry. Case-insensitive.
 * Returns undefined when the address isn't a recognized canonical
 * Avalanche infrastructure contract — callers should fall back to the
 * Sourcify hook (`useContractSource`) for general dapp verification.
 */
export function lookupKnownContract(address: string | undefined): KnownContract | undefined {
  if (!address) return undefined;
  return REGISTRY[address.toLowerCase()];
}
