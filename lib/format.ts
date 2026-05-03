export function truncateHash(hash: string, head = 6, tail = 4): string {
  if (!hash) return "";
  if (hash.length <= head + tail + 2) return hash;
  return `${hash.slice(0, head + 2)}…${hash.slice(-tail)}`;
}

export function formatNumber(value: string | number | null | undefined): string {
  if (value === null || value === undefined || value === "") return "—";
  const n = typeof value === "string" ? Number(value) : value;
  if (!Number.isFinite(n)) return String(value);
  return n.toLocaleString();
}

// Adaptive gas-price display. Chains with sub-gwei base fees (benchmark
// L1s, ACP-176-tuned chains, low-traffic L1s) render as "0 gwei" if we
// always force the gwei unit. Drop down to wei when it'd otherwise be
// misleading, and pop up to gwei (or even "ngwei" / "twei" if needed)
// only when the value justifies it.
export function formatGwei(weiStr: string | null | undefined): string {
  if (!weiStr) return "—";
  try {
    const wei = BigInt(weiStr);
    if (wei === BigInt(0)) return "0";
    const ONE_GWEI = BigInt(10) ** BigInt(9);
    if (wei < ONE_GWEI) {
      return `${wei.toLocaleString()} wei`;
    }
    const gwei = Number(wei) / 1e9;
    return `${gwei.toLocaleString(undefined, { maximumFractionDigits: 4 })} gwei`;
  } catch {
    return weiStr ?? "—";
  }
}

/**
 * Format a wei amount as `<whole>.<frac6> <symbol>`. Symbol intentionally
 * has NO default — every caller must thread the active L1's
 * `chain.nativeToken.symbol` through. Hard-coding "AVAX" here used to
 * silently mislabel non-AVAX L1s (Echo, Dispatch, Beam, …) as paying
 * AVAX gas. Pass an empty string to render a unitless number when the
 * chain hasn't loaded yet.
 */
export function formatNativeAmount(weiStr: string | null | undefined, symbol: string): string {
  const tail = symbol ? ` ${symbol}` : "";
  if (!weiStr) return `0${tail}`;
  try {
    const wei = BigInt(weiStr);
    const ETHER = BigInt(10) ** BigInt(18);
    const whole = wei / ETHER;
    const frac = wei % ETHER;
    const fracStr = frac.toString().padStart(18, "0").slice(0, 6).replace(/0+$/, "");
    return `${whole.toString()}${fracStr ? `.${fracStr}` : ""}${tail}`;
  } catch {
    return `${weiStr} wei`;
  }
}

/** Format a uint256 token amount given the token's decimals.
 *  Truncates to `precision` fractional digits and trims trailing zeros. */
export function formatUnits(
  raw: string | null | undefined,
  decimals: number | null | undefined,
  precision = 4,
): string {
  if (!raw) return "—";
  const dec = decimals ?? 0;
  try {
    const v = BigInt(raw);
    if (dec === 0) return v.toLocaleString();
    const base = BigInt(10) ** BigInt(dec);
    const whole = v / base;
    const frac = v % base;
    const fracStr = frac.toString().padStart(dec, "0").slice(0, precision).replace(/0+$/, "");
    return `${whole.toLocaleString()}${fracStr ? `.${fracStr}` : ""}`;
  } catch {
    return raw;
  }
}

const MAX_UINT256 = (BigInt(1) << BigInt(256)) - BigInt(1);

/** Compact display for token amounts — K / M / B / T suffixes for anything
 *  over a million, full digits below that, and the "uncapped" sentinel for
 *  max-uint256 (a common totalSupply pattern). Use this for KPIs and
 *  headlines; use `formatUnits` when the user needs the exact figure. */
export function formatCompactUnits(
  raw: string | null | undefined,
  decimals: number | null | undefined,
): string {
  if (!raw) return "—";
  const dec = decimals ?? 0;
  try {
    const v = BigInt(raw);
    if (v === MAX_UINT256) return "uncapped";

    const base = BigInt(10) ** BigInt(dec);
    const whole = v / base;
    if (whole < BigInt(1_000_000)) return formatUnits(raw, dec, 4);

    const units = [
      { divisor: BigInt(10) ** BigInt(15), suffix: "Q" }, // quadrillion
      { divisor: BigInt(10) ** BigInt(12), suffix: "T" }, // trillion
      { divisor: BigInt(10) ** BigInt(9), suffix: "B" }, // billion
      { divisor: BigInt(10) ** BigInt(6), suffix: "M" }, // million
    ];
    for (const u of units) {
      if (whole >= u.divisor) {
        // If the magnitude is so vast that even quadrillion-scaled fits in
        // 10+ digits (i.e. > 10^25), fall back to scientific notation rather
        // than print a meaninglessly long number.
        const scaled = whole / u.divisor;
        if (scaled >= BigInt(10_000_000_000)) {
          // Keep two significant figures of the actual whole.
          const wholeStr = whole.toString();
          const lead = wholeStr.slice(0, 3);
          const exp = wholeStr.length - 1;
          return `${lead[0]}.${lead.slice(1)}e${exp}`;
        }
        const remainder = (whole * BigInt(100)) / u.divisor - scaled * BigInt(100);
        const fracStr = remainder.toString().padStart(2, "0").replace(/0+$/, "");
        return `${scaled.toLocaleString()}${fracStr ? `.${fracStr}` : ""}${u.suffix}`;
      }
    }
    return whole.toLocaleString();
  } catch {
    return raw;
  }
}

/**
 * Gas-used percentage for a block. Returns `0` for invalid input rather
 * than throwing — callers thread this directly into row UI where a
 * silent zero is preferable to a layout-breaking exception.
 */
export function gasUsedPctNum(used: string, limit: string): number {
  try {
    const u = BigInt(used);
    const l = BigInt(limit);
    if (l === 0n) return 0;
    return Number((u * 10000n) / l) / 100;
  } catch {
    return 0;
  }
}

/** String-formatted version of `gasUsedPctNum` — drops the decimal at >=10%. */
export function gasUsedPct(used: string, limit: string): string {
  const n = gasUsedPctNum(used, limit);
  return `${n.toFixed(n >= 10 ? 0 : 1)}%`;
}

/** Same shape as `gasUsedPct` but takes the firn `BlockGas`-shaped object directly. */
export function gasUtilization(gas: { limit: string; used: string }): string {
  return gasUsedPct(gas.used, gas.limit);
}

/**
 * Pick a tasteful tone for a 0–100 utilization percentage. Returns a CSS
 * variable reference: `--ink-3` (boring grey, idle), `--good` (busy),
 * `--warn` (filling up), or `--bad` (near-saturation). Thresholds match
 * how operators reason about block gas pressure — under ~10% the chain
 * is essentially idle and the chart should blend into the surrounding
 * text rather than alarming green; 10–60% there's real load, 60–85%
 * the L1 is busy but still healthy, above 85% blocks are routinely full
 * and queue depth starts to matter.
 */
export function gasUtilTone(pct: number): string {
  if (pct >= 85) return "var(--bad)";
  if (pct >= 60) return "var(--warn)";
  if (pct > 10) return "var(--good)";
  return "var(--ink-3)";
}

/**
 * Compute and format the wei fee paid by a transaction (`gasPrice *
 * gasUsed`) at whatever unit reads best. Auto-picks symbol/wei/gwei to
 * avoid the two failure modes:
 *
 *   - native units: collapses every benchmark-chain fee (525000 wei =
 *     5.25e-13 AVAX) to "0 AVAX"
 *   - raw wei: scales fine for tiny fees but prints "1000000000000000 wei"
 *     for a normal mainnet 0.001 AVAX tx
 *
 * Thresholds:
 *
 *   ≥ 0.0001 native   → "<n.nnn> SYMBOL" (4-decimal cap)
 *   ≥ 1 gwei          → "<n> gwei"        (sub-native fees, common on benchmarks)
 *   otherwise         → "<n> wei"         (sub-gwei fees)
 *
 * Used on block detail, transaction detail, and the homepage live txs
 * table where the column is narrow and we can't waste pixels on big
 * numbers or many fractional digits.
 */
export function formatTxFee(gasUsed: number, gasPriceWei: string, symbol: string): string {
  try {
    const wei = BigInt(gasPriceWei) * BigInt(gasUsed);
    if (wei === 0n) return `0 ${symbol}`;
    const ONE_GWEI = BigInt(10) ** BigInt(9);
    const NATIVE_THRESHOLD = BigInt(10) ** BigInt(14); // 0.0001 native
    if (wei >= NATIVE_THRESHOLD) {
      return formatNativeAmount(wei.toString(), symbol);
    }
    if (wei >= ONE_GWEI) {
      const gwei = Number(wei) / 1e9;
      const formatted = gwei.toLocaleString(undefined, {
        maximumFractionDigits: gwei >= 100 ? 0 : gwei >= 10 ? 1 : 2,
      });
      return `${formatted} gwei`;
    }
    return `${Number(wei).toLocaleString()} wei`;
  } catch {
    return "—";
  }
}

/**
 * Compact byte-size display for block payloads. Auto-picks unit so we
 * never print "203,847 B" or "0.001 MB" — KB up to 1 MiB, MB above.
 * Used on the live blocks panel where the column is narrow.
 */
export function formatBlockSize(bytes: number | null | undefined): string {
  if (bytes == null || !Number.isFinite(bytes) || bytes < 0) return "—";
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) {
    const kb = bytes / 1024;
    return `${kb.toLocaleString(undefined, {
      maximumFractionDigits: kb >= 100 ? 0 : 1,
    })} KB`;
  }
  const mb = bytes / (1024 * 1024);
  return `${mb.toLocaleString(undefined, {
    maximumFractionDigits: mb >= 10 ? 1 : 2,
  })} MB`;
}

/** Render a millisecond block time as `<n> ms` or `<n.nn> s`. */
export function formatBlockTime(ms: number): string {
  if (ms < 0) return "—";
  if (ms < 1000) return `${ms} ms`;
  const s = ms / 1000;
  return `${s.toFixed(s < 10 ? 2 : 1)} s`;
}

export function formatRelativeTime(iso: string | null | undefined): string {
  if (!iso) return "—";
  const t = Date.parse(iso);
  if (Number.isNaN(t)) return iso;
  const diffMs = Date.now() - t;
  if (diffMs < 100) return "just now";
  if (diffMs < 1000) return `${Math.floor(diffMs / 100) * 100}ms ago`;
  const sec = Math.floor(diffMs / 1000);
  if (sec < 60) return `${sec}s ago`;
  const min = Math.floor(sec / 60);
  if (min < 60) return `${min}m ago`;
  const hr = Math.floor(min / 60);
  if (hr < 24) return `${hr}h ago`;
  const day = Math.floor(hr / 24);
  return `${day}d ago`;
}
