/**
 * Frontend ICM helpers — small utilities only.
 *
 * Heavy lifting has moved to the backend (firn/internal/decoders/icm/):
 * Teleporter event structs are decoded server-side via
 * github.com/ava-labs/icm-contracts Go bindings; the application-
 * payload envelope (TransferrerMessage and ICTT message types) is
 * decoded by ictt-contracts-shaped ABI in Go. Both arrive on the
 * `ICMMessage` shape as structured fields:
 *
 *   - `teleporterMessage` — TeleporterMessageDecoded
 *   - `feeInfo`           — TeleporterFeeInfoDecoded
 *   - `appMessage`        — AppMessage with protocol + kindLabel + fields
 *   - `warpEnvelope`      — already decoded backend-side too
 *
 * What stays here: the network-id label lookup (presentational), and
 * an Avalanche-specific helper or two. Anything that needs to reach
 * for an ABI is going to belong on the backend instead.
 */

/**
 * Human label for an Avalanche network ID. Static lookup — only the
 * three canonical values are mapped; anything else is rendered as a
 * number.
 */
export function avaxNetworkName(id: number): string | undefined {
  if (id === 1) return "mainnet";
  if (id === 5) return "fuji";
  if (id === 12345) return "local";
  return undefined;
}

/**
 * Compact "0x1234…cdef" form for bytes32 / address display. Returns
 * the input unchanged when it's already short enough.
 */
export function shortHex(value: string, length = 10): string {
  if (!value) return "—";
  if (value.length <= length + 4) return value;
  return `${value.slice(0, length)}…${value.slice(-4)}`;
}

import type { AppMessage, AppFieldNode } from "@/lib/api/queries";

/**
 * One-row summary of an ICTT-decoded AppMessage, suitable for
 * inlining in the /icm index table. The detail page renders the full
 * field list — this helper just picks the 2-3 fields a glance needs.
 *
 * Values mirror the Go decoder (firn/internal/decoders/icm/appmessage.go):
 *   RegisterRemoteMessage  → no transfer, just a label
 *   SingleHopSendMessage   → recipient + amount
 *   SingleHopCallMessage   → recipientContract + amount
 *   MultiHopSendMessage    → recipient + amount + destinationBlockchainID
 *   MultiHopCallMessage    → recipientContract + amount + destinationBlockchainID
 */
export interface ICTTSummary {
  protocol: string;
  kindLabel: string;
  /** "send" | "call" | "register" | "other" — collapsed for badge rendering. */
  family: "send" | "call" | "register" | "other";
  /** End-user destination address. Address for Send messages, contract for Call. */
  recipient?: string;
  /** Whether `recipient` is a recipientContract (call) vs a plain recipient (send). */
  recipientIsContract: boolean;
  /** Raw uint256 amount as a decimal string. Caller decides how to format
   *  (we don't know the token's decimals here — that requires a token lookup). */
  amount?: string;
  /** Cross-chain hop target for multi-hop variants. */
  destinationBlockchainId?: string;
}

export function summarizeICTT(app: AppMessage | undefined): ICTTSummary | null {
  if (!app || !app.protocol || !app.kindLabel) return null;
  if (app.protocol !== "ICTT") return null;
  const fields = app.fields ?? [];
  const get = (name: string) => fields.find((f) => f.name === name)?.value;

  const kind = app.kindLabel;
  let family: ICTTSummary["family"] = "other";
  if (kind === "RegisterRemoteMessage") family = "register";
  else if (kind === "SingleHopSendMessage" || kind === "MultiHopSendMessage") family = "send";
  else if (kind === "SingleHopCallMessage" || kind === "MultiHopCallMessage") family = "call";

  const recipientField = get("recipient") ?? get("recipientContract");
  const recipientIsContract = !!get("recipientContract");

  return {
    protocol: app.protocol,
    kindLabel: app.kindLabel,
    family,
    recipient: recipientField,
    recipientIsContract,
    amount: get("amount"),
    destinationBlockchainId: get("destinationBlockchainID"),
  };
}

/**
 * Compact bigint string render for ICTT amounts. Used as the fallback
 * when we don't know the token's decimals (no upstream RPC, or the
 * contract didn't implement decimals()). For known tokens prefer
 * `formatTokenAmount` which produces "1,500.25 USDC".
 *
 * Renders raw uint256 with grouping for small values and scientific
 * shorthand for large ones — operators click through to the detail
 * page for the exact number.
 */
export function compactBigUint(s: string | undefined): string {
  if (!s) return "—";
  const trimmed = s.replace(/^0+(?=\d)/, "");
  if (trimmed.length <= 9) {
    return Number(trimmed).toLocaleString();
  }
  const lead = trimmed.slice(0, 3);
  const exp = trimmed.length - 1;
  const mantissa = `${lead[0]}.${lead.slice(1)}`;
  return `${mantissa}e${exp}`;
}

/**
 * Format a uint256 token amount as a decimal string with grouping,
 * given the token's `decimals`. Returns the raw `compactBigUint`
 * render when decimals is 0 (treated as "unknown") so the caller
 * doesn't have to branch.
 *
 * Precision: we keep up to 4 fractional digits — enough to read 18-dp
 * amounts at the unit level ("0.0123 ETH") without trailing noise.
 * Trims trailing zeros so "1.5000 USDC" reads as "1.5 USDC".
 */
export function formatTokenAmount(raw: string | undefined, decimals: number | undefined): string {
  if (!raw) return "—";
  if (!decimals || decimals <= 0) return compactBigUint(raw);
  const cleaned = raw.replace(/^0+(?=\d)/, "");
  if (cleaned.length <= decimals) {
    // Pure-fractional amount: "0.000000000000000123"
    const padded = cleaned.padStart(decimals + 1, "0");
    const intPart = padded.slice(0, padded.length - decimals);
    const fracPart = padded.slice(padded.length - decimals);
    const trimmed = trimFraction(fracPart, 4);
    return trimmed ? `${intPart}.${trimmed}` : intPart;
  }
  const intPart = cleaned.slice(0, cleaned.length - decimals);
  const fracPart = cleaned.slice(cleaned.length - decimals);
  const intGrouped = Number(intPart).toLocaleString();
  const fracTrim = trimFraction(fracPart, 4);
  return fracTrim ? `${intGrouped}.${fracTrim}` : intGrouped;
}

function trimFraction(s: string, max: number): string {
  // Truncate (not round) so the displayed value is always ≤ the actual
  // amount. Avoids the misleading "0.0001 USDC" when the real value
  // was 0.00009.
  let out = s.slice(0, max);
  while (out.endsWith("0")) out = out.slice(0, -1);
  return out;
}

/**
 * Field accessor used by both the detail page's full renderer and the
 * index page's inline summary, so kind-name strings don't drift.
 */
export function fieldByName(
  fields: AppFieldNode[] | null | undefined,
  name: string,
): string | undefined {
  return (fields ?? []).find((f) => f.name === name)?.value;
}
