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

export function formatGwei(weiStr: string | null | undefined): string {
  if (!weiStr) return "—";
  try {
    const wei = BigInt(weiStr);
    const gwei = Number(wei) / 1e9;
    return `${gwei.toLocaleString(undefined, { maximumFractionDigits: 4 })} gwei`;
  } catch {
    return weiStr ?? "—";
  }
}

export function formatNativeAmount(weiStr: string | null | undefined, symbol = "AVAX"): string {
  if (!weiStr) return `0 ${symbol}`;
  try {
    const wei = BigInt(weiStr);
    const ETHER = BigInt(10) ** BigInt(18);
    const whole = wei / ETHER;
    const frac = wei % ETHER;
    const fracStr = frac.toString().padStart(18, "0").slice(0, 6).replace(/0+$/, "");
    return `${whole.toString()}${fracStr ? `.${fracStr}` : ""} ${symbol}`;
  } catch {
    return `${weiStr} wei`;
  }
}

export function formatRelativeTime(iso: string | null | undefined): string {
  if (!iso) return "—";
  const t = Date.parse(iso);
  if (Number.isNaN(t)) return iso;
  const diffMs = Date.now() - t;
  const sec = Math.round(diffMs / 1000);
  if (sec < 5) return "just now";
  if (sec < 60) return `${sec}s ago`;
  const min = Math.round(sec / 60);
  if (min < 60) return `${min}m ago`;
  const hr = Math.round(min / 60);
  if (hr < 24) return `${hr}h ago`;
  const day = Math.round(hr / 24);
  return `${day}d ago`;
}
