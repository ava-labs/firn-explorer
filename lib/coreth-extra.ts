/**
 * Decoder for the Coreth / subnet-evm block header `extraData` field.
 *
 * Layout on a post-Etna L1 (ACP-176 dynamic fees):
 *
 *   [   0,  80) — DynamicFeeRollingWindow: 10 × uint64 big-endian samples of
 *                 historical gas usage; consumed by the base-fee EMA.
 *   [  80,  86) — MinDelayExcess: uint48 ACP-176 dynamic-fee EWMA excess
 *                 value the proposer pinned for next-block base-fee math.
 *
 * Pre-Etna chains carry only the 80-byte fee window; the 6-byte excess
 * trailer is absent. We tolerate either by length-checking before we read.
 *
 * This decoder is pure client-side over the hex blob already in `extraData`,
 * so we don't need a chdb schema migration to surface ACP-176 state.
 */

export interface DecodedCorethExtra {
  /** Raw input, unchanged. */
  raw: string;
  /** Total decoded byte length. */
  byteLength: number;
  /**
   * The 10-sample rolling gas window. Empty if extraData is too short to
   * carry it (e.g. some genesis blocks).
   */
  feeWindow: bigint[];
  /** Sum across the fee window — a coarse "gas spent over recent history". */
  feeWindowSum?: bigint;
  /**
   * ACP-176 min-delay excess. Present only when extraData is at least
   * 86 bytes (10 × 8 + 6).
   */
  minDelayExcess?: bigint;
  /** Trailing bytes (as hex) that fall outside the known layout. */
  trailing?: string;
}

const FEE_WINDOW_BYTES = 80;
const FEE_WINDOW_SAMPLES = 10;
const MIN_DELAY_EXCESS_BYTES = 6;

export function decodeCorethExtra(raw: string | undefined | null): DecodedCorethExtra | null {
  if (!raw) return null;
  const hex = raw.startsWith("0x") || raw.startsWith("0X") ? raw.slice(2) : raw;
  if (hex.length === 0 || hex.length % 2 !== 0) return null;

  const bytes = hexToBytes(hex);
  if (!bytes) return null;

  const out: DecodedCorethExtra = {
    raw,
    byteLength: bytes.length,
    feeWindow: [],
  };

  if (bytes.length >= FEE_WINDOW_BYTES) {
    out.feeWindow = readUint64BE(bytes, 0, FEE_WINDOW_SAMPLES);
    out.feeWindowSum = out.feeWindow.reduce((a, b) => a + b, 0n);
  }

  if (bytes.length >= FEE_WINDOW_BYTES + MIN_DELAY_EXCESS_BYTES) {
    out.minDelayExcess = readUintBE(bytes, FEE_WINDOW_BYTES, MIN_DELAY_EXCESS_BYTES);
  }

  // Capture anything beyond the known sections so callers can show it raw
  // rather than silently swallowing data we don't understand yet.
  const consumed =
    (out.feeWindow.length > 0 ? FEE_WINDOW_BYTES : 0) +
    (out.minDelayExcess !== undefined ? MIN_DELAY_EXCESS_BYTES : 0);
  if (bytes.length > consumed) {
    out.trailing = bytesToHex(bytes.slice(consumed));
  }

  return out;
}

function hexToBytes(hex: string): Uint8Array | null {
  if (hex.length % 2 !== 0) return null;
  const out = new Uint8Array(hex.length / 2);
  for (let i = 0; i < out.length; i++) {
    const byte = parseInt(hex.slice(i * 2, i * 2 + 2), 16);
    if (Number.isNaN(byte)) return null;
    out[i] = byte;
  }
  return out;
}

function bytesToHex(bytes: Uint8Array): string {
  let out = "0x";
  for (const b of bytes) out += b.toString(16).padStart(2, "0");
  return out;
}

function readUint64BE(bytes: Uint8Array, offset: number, count: number): bigint[] {
  const result: bigint[] = [];
  for (let i = 0; i < count; i++) {
    result.push(readUintBE(bytes, offset + i * 8, 8));
  }
  return result;
}

function readUintBE(bytes: Uint8Array, offset: number, length: number): bigint {
  let v = 0n;
  for (let i = 0; i < length; i++) {
    v = (v << 8n) | BigInt(bytes[offset + i] ?? 0);
  }
  return v;
}
