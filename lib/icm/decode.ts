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
