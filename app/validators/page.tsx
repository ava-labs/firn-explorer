"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Skeleton } from "@/components/ui/skeleton";
import {
  isBootstrappingError,
  useChain,
  useL1Uptime,
  useL1Validator,
  usePeers,
  useValidators,
} from "@/lib/api/queries";
import type { L1UptimeEntry, Peer, Validator } from "@/lib/api/queries";
import { useNowTick } from "@/lib/use-fresh";
import { FilterBar, FilterInput, FilterPillGroup } from "@/components/lattice/filter-bar";
import { formatNumber } from "@/lib/format";

type SortKey = "weight" | "balance" | "period";
type ConnectedFilter = "any" | "live" | "off";

const CONNECTED_OPTIONS = [
  { value: "any" as const, label: "All" },
  { value: "live" as const, label: "● live" },
  { value: "off" as const, label: "○ off" },
];

// nAVAX → AVAX with 2-decimal display. Used for actual AVAX-denominated
// quantities (Primary Network stake, ACP-77 fee balance), NOT for L1 weight.
function formatAvax(nano: string | undefined, symbol: string): string {
  if (!nano) return `— ${symbol}`;
  let n: bigint;
  try {
    n = BigInt(nano);
  } catch {
    return `— ${symbol}`;
  }
  if (n === 0n) return `0 ${symbol}`;
  const ETHER_NANO = 1_000_000_000n;
  const whole = n / ETHER_NANO;
  const frac = (n % ETHER_NANO) / 10_000_000n; // 2 decimals
  const wholeNum = Number(whole);
  const compact =
    wholeNum >= 1_000_000
      ? `${(wholeNum / 1_000_000).toFixed(2)}M`
      : wholeNum >= 1_000
        ? `${(wholeNum / 1_000).toFixed(2)}K`
        : `${formatNumber(wholeNum)}.${frac.toString().padStart(2, "0")}`;
  return `${compact} ${symbol}`;
}

// L1/subnet weight is an opaque integer assigned at validator-add time.
// Format with K/M/B/T suffixes — never show as AVAX, that's misleading.
function formatWeight(w: string | undefined): string {
  if (!w) return "—";
  let n: bigint;
  try {
    n = BigInt(w);
  } catch {
    return w;
  }
  if (n === 0n) return "0";
  if (n < 1_000n) return n.toString();
  if (n < 1_000_000n) return `${(Number(n) / 1_000).toFixed(2)}K`;
  if (n < 1_000_000_000n) return `${(Number(n) / 1_000_000).toFixed(2)}M`;
  if (n < 1_000_000_000_000n) return `${(Number(n) / 1_000_000_000).toFixed(2)}B`;
  return `${(Number(n) / 1e12).toFixed(2)}T`;
}

function formatUptime(uptime: string | number | undefined): string {
  if (uptime === undefined || uptime === null || uptime === "") return "—";
  const n = typeof uptime === "number" ? uptime : parseFloat(uptime);
  if (Number.isNaN(n)) return "—";
  // P-Chain returns 0..1 fractional ratio; subnet-evm /validators returns 0..100.
  const pct = n <= 1 ? n * 100 : n;
  return `${pct.toFixed(2)}%`;
}

/** Pick the most useful uptime field from a subnet-evm /validators entry. */
function pickUptime(entry: L1UptimeEntry): string | number | undefined {
  return entry.uptimePercent ?? entry.uptime;
}

// P-Chain returns timestamps as decimal-string unix seconds.
function parsePChainTime(s: string | undefined): number | null {
  if (!s) return null;
  const n = Number(s);
  if (Number.isFinite(n) && n > 1_000_000_000) return n * 1000;
  const t = Date.parse(s);
  return Number.isFinite(t) ? t : null;
}

function formatPeriodRemaining(end: string | undefined): string {
  const ms = parsePChainTime(end);
  if (ms == null) return "—";
  const diff = ms - Date.now();
  if (diff <= 0) return "ended";
  const sec = Math.floor(diff / 1000);
  const day = Math.floor(sec / 86_400);
  if (day >= 365) {
    const y = Math.floor(day / 365);
    const d = day % 365;
    return d ? `${y}y ${d}d` : `${y}y`;
  }
  if (day >= 1) {
    const hr = Math.floor((sec % 86_400) / 3600);
    return hr ? `${day}d ${hr}h` : `${day}d`;
  }
  const hr = Math.floor(sec / 3600);
  if (hr >= 1) {
    const min = Math.floor((sec % 3600) / 60);
    return min ? `${hr}h ${min}m` : `${hr}h`;
  }
  return `${Math.max(1, Math.floor(sec / 60))}m`;
}

export default function ValidatorsPage() {
  const { data: chain } = useChain();
  const { data: vsResp, isPending, error } = useValidators();
  const bootstrapping = isBootstrappingError(error);
  // Optional: subnet-evm /validators namespace may or may not be wired up.
  // Errors are non-fatal — we just render uptime as "—" per row.
  const { data: l1Uptime, error: l1UptimeError } = useL1Uptime();
  // Optional: avalanchego /ext/info via firn's /v1/peers. 503 when firn
  // wasn't pointed at an info-exposing node (public RPC providers don't
  // expose this). Hooks return undefined data on error and we degrade
  // gracefully — the per-row peer line just doesn't render.
  const { data: peersData } = usePeers();
  const [sort, setSort] = useState<SortKey>("weight");
  const [filter, setFilter] = useState("");
  const [connected, setConnected] = useState<ConnectedFilter>("any");
  // Tick once a minute so "287d 4h" countdowns stay current.
  useNowTick(60_000);

  // Merge subnet-evm uptime with P-Chain uptime: subnet-evm wins per-row when
  // present (it's the authoritative L1 source), P-Chain's `v.uptime` is the
  // Primary-Network fallback.
  const uptimeByNode = useMemo(() => {
    const m = new Map<string, string | number>();
    for (const e of l1Uptime?.validators ?? []) {
      const u = pickUptime(e);
      if (u !== undefined) m.set(e.nodeID, u);
    }
    return m;
  }, [l1Uptime]);

  const uptimeFor = (v: Validator): string | number | undefined =>
    uptimeByNode.get(v.nodeID) ?? v.uptime;

  // Validator balances and primary-network stakes are paid in AVAX on the
  // P-Chain — they are NEVER denominated in the L1's native token. Don't
  // pull the symbol from chain.nativeToken (which is "ECH" on Echo, etc.);
  // the column is always AVAX.
  const symbol = "AVAX";
  // Stable identity: wrap the array-with-default in useMemo so
  // downstream useMemo deps (filtered, totals) don't invalidate on
  // every render when vsResp is undefined.
  const validators = useMemo(() => vsResp?.validators ?? [], [vsResp]);
  const isPrimary = chain?.subnetId === "11111111111111111111111111111111LpoYY";

  // Peer map keyed on nodeID, built from /v1/peers (avalanchego's
  // info.peers proxied by firn). Coverage is "peers our local
  // avalanchego currently gossips with" — a strict subset of the
  // validator set, since not every validator on this subnet is
  // necessarily peered to our node right now. The validator row falls
  // back to "—" when there's no hit.
  const peerByNode = useMemo(() => {
    const m = new Map<string, Peer>();
    for (const p of peersData?.peers ?? []) {
      m.set(p.nodeID, p);
    }
    return m;
  }, [peersData]);
  const peerFor = (v: Validator): Peer | undefined => peerByNode.get(v.nodeID);

  // How many validators are currently in our peer table vs the total
  // active set. Operator signal: a low ratio usually means our node is
  // poorly connected to its peers, not that those validators are
  // offline. Distinct from "avg uptime" (which reports the network's
  // consensus on validator reachability).
  const peeredCount = useMemo(() => {
    if (!peerByNode.size || !validators.length) return 0;
    let n = 0;
    for (const v of validators) {
      if (peerByNode.has(v.nodeID)) n++;
    }
    return n;
  }, [validators, peerByNode]);

  const filtered = useMemo(() => {
    const term = filter.trim().toLowerCase();
    return validators.filter((v) => {
      if (term && !v.nodeID.toLowerCase().includes(term)) return false;
      if (connected !== "any") {
        const isLive = v.connected === true;
        if (connected === "live" && !isLive) return false;
        if (connected === "off" && isLive) return false;
      }
      return true;
    });
  }, [validators, filter, connected]);

  const sorted = useMemo(() => {
    const arr = [...filtered];
    arr.sort((a, b) => {
      if (sort === "period") {
        const ae = parsePChainTime(a.endTime) ?? 0;
        const be = parsePChainTime(b.endTime) ?? 0;
        return ae - be;
      }
      // 'balance' sort: tiebreak by weight; balance comes from per-row
      // L1Validator fetches and isn't always available, so weight is the
      // sensible default ordering.
      return cmpBig(b.stakeAmount ?? b.weight, a.stakeAmount ?? a.weight);
    });
    return arr;
  }, [filtered, sort]);

  const filtersActive = filter.trim().length > 0 || connected !== "any";

  const totals = useMemo(() => {
    if (validators.length === 0) {
      return {
        count: 0,
        totalWeight: "0",
        totalStake: "0",
        blsCount: 0,
        avgUptime: 0,
        avgUptimeCount: 0,
      };
    }
    let totalWeight = 0n;
    let totalStake = 0n;
    let blsCount = 0;
    let upSum = 0;
    let upCount = 0;
    for (const v of validators) {
      try {
        totalWeight += BigInt(v.weight ?? "0");
      } catch {
        /* skip */
      }
      if (v.stakeAmount) {
        try {
          totalStake += BigInt(v.stakeAmount);
        } catch {
          /* skip */
        }
      }
      if (v.publicKey || v.signer?.publicKey) blsCount += 1;
      // Inline lookup so the useMemo deps stay precise (uptimeByNode +
      // validators) without depending on a closure that itself reads them.
      const u = uptimeByNode.get(v.nodeID) ?? v.uptime;
      if (u !== undefined && u !== "") {
        const n = typeof u === "number" ? u : parseFloat(u);
        if (Number.isFinite(n)) {
          upSum += n <= 1 ? n * 100 : n;
          upCount += 1;
        }
      }
    }
    return {
      count: validators.length,
      totalWeight: totalWeight.toString(),
      totalStake: totalStake.toString(),
      blsCount,
      avgUptime: upCount ? upSum / upCount : 0,
      avgUptimeCount: upCount,
    };
  }, [validators, uptimeByNode]);

  return (
    <div className="px-4 sm:px-6 lg:px-10 py-6 sm:py-8 pb-12">
      <div className="eyebrow mb-2.5">Validators</div>
      <div className="h-display" style={{ fontSize: 56, marginBottom: 6 }}>
        {isPending ? (
          <Skeleton className="h-[56px] w-[160px]" />
        ) : (
          <>
            {formatNumber(totals.count)}{" "}
            <span style={{ fontSize: 20, color: "var(--ink-3)", fontWeight: 400 }}>active</span>
          </>
        )}
      </div>
      <div className="mb-9" style={{ fontSize: 14, color: "var(--ink-3)" }}>
        Securing {chain?.name ?? "this L1"}
        {!isPrimary ? (
          <> · {formatWeight(totals.totalWeight)} total weight</>
        ) : (
          <> · {formatAvax(totals.totalStake, symbol)} staked</>
        )}
        {totals.avgUptimeCount > 0 ? ` · avg uptime ${totals.avgUptime.toFixed(2)}%` : ""}
      </div>

      {error ? (
        <div
          className="border rounded-md p-4 mb-6"
          style={{
            borderColor: "var(--accent-soft)",
            background: "var(--accent-soft)",
            color: "var(--accent-ink)",
            fontSize: 13,
          }}
        >
          {bootstrapping ? (
            <>
              <div style={{ fontWeight: 500, marginBottom: 4 }}>P-Chain still bootstrapping</div>
              <div style={{ fontSize: 12, color: "var(--ink-3)", lineHeight: 1.5 }}>
                The avalanchego node behind firn hasn&apos;t finished syncing the P-Chain yet.
                Validators will appear automatically once bootstrap completes — this page polls
                every 15s.
              </div>
            </>
          ) : (
            <>
              <div style={{ fontWeight: 500, marginBottom: 4 }}>Couldn&apos;t load validators</div>
              <div className="mono" style={{ fontSize: 11.5, color: "var(--ink-3)" }}>
                {error.message}
              </div>
            </>
          )}
        </div>
      ) : null}

      {/* KPI strip — 2-up on phones, 4-up at sm and above. */}
      <div
        className="grid grid-cols-2 sm:grid-cols-4"
        style={{
          borderTop: "1px solid var(--line)",
          borderBottom: "1px solid var(--line)",
          marginBottom: 32,
        }}
      >
        <KpiTile
          label={isPrimary ? "Total stake" : "Total weight"}
          value={
            isPrimary ? formatAvax(totals.totalStake, symbol) : formatWeight(totals.totalWeight)
          }
          sub="active set"
        />
        <KpiTile
          label="Avg uptime"
          value={totals.avgUptimeCount > 0 ? `${totals.avgUptime.toFixed(2)}%` : "—"}
          sub={
            totals.avgUptimeCount > 0
              ? `${totals.avgUptimeCount}/${totals.count} reporting`
              : describeUptimeMiss(l1UptimeError)
          }
        />
        {/* "Peered" replaces the BLS-equipped tile when the operator
            wired -info-rpc — peer connectivity is a more actionable
            day-to-day signal than BLS adoption. Falls back to BLS when
            /v1/peers is disabled (503 → undefined). */}
        {peersData ? (
          <KpiTile
            label="Peered"
            value={`${formatNumber(peeredCount)} / ${formatNumber(totals.count)}`}
            sub={
              peersData.numPeers > peeredCount
                ? `${formatNumber(peersData.numPeers)} total in /ext/info`
                : "in our node's peer table"
            }
          />
        ) : (
          <KpiTile
            label="BLS-equipped"
            value={`${formatNumber(totals.blsCount)} / ${formatNumber(totals.count)}`}
            sub="publicKey set"
          />
        )}
        <div style={{ padding: "20px 18px" }}>
          <div className="eyebrow mb-2.5">Subnet</div>
          {chain?.subnetId ? (
            <div
              className="mono"
              style={{
                fontSize: 12,
                color: "var(--ink)",
                wordBreak: "break-all",
                lineHeight: 1.35,
              }}
            >
              {chain.subnetId}
            </div>
          ) : (
            <div className="h-display" style={{ fontSize: 24, color: "var(--ink-4)" }}>
              —
            </div>
          )}
          <div className="mono" style={{ fontSize: 11, color: "var(--ink-4)", marginTop: 4 }}>
            {chain?.network ?? "scope"}
          </div>
        </div>
      </div>

      <FilterBar
        active={filtersActive}
        onReset={() => {
          setFilter("");
          setConnected("any");
        }}
        count={sorted.length ? `${sorted.length} validator${sorted.length === 1 ? "" : "s"}` : ""}
      >
        <FilterInput
          value={filter}
          onChange={setFilter}
          placeholder="Node ID NodeID-…"
          ariaLabel="Filter by node ID"
          width={300}
        />
        <FilterPillGroup<ConnectedFilter>
          value={connected}
          options={CONNECTED_OPTIONS}
          onChange={setConnected}
        />
      </FilterBar>

      {/* Sort buttons */}
      <div className="flex gap-2 mb-3 items-center">
        <span style={{ fontSize: 11.5, color: "var(--ink-4)" }}>Sort by</span>
        {(
          [
            ["weight", isPrimary ? "Stake" : "Weight"],
            ["balance", "Balance"],
            ["period", "Period"],
          ] as ReadonlyArray<[SortKey, string]>
        ).map(([k, label]) => (
          <button
            key={k}
            type="button"
            onClick={() => setSort(k)}
            className="lat-btn"
            style={
              sort === k
                ? {
                    background: "var(--ink)",
                    color: "var(--bg)",
                    borderColor: "var(--ink)",
                  }
                : undefined
            }
          >
            ↓ {label}
          </button>
        ))}
      </div>

      <div className="card border border-line rounded-[10px] bg-bg-elev overflow-x-auto">
        <table className="lat-tbl">
          <thead>
            <tr>
              <th>Node ID</th>
              <th style={{ textAlign: "right", width: 130 }}>{isPrimary ? "Stake" : "Weight"}</th>
              <th className="hidden md:table-cell" style={{ width: 200 }}>
                Voting share
              </th>
              <th className="hidden md:table-cell" style={{ textAlign: "right", width: 130 }}>
                Balance
              </th>
              <th className="hidden md:table-cell" style={{ textAlign: "right", width: 90 }}>
                Uptime
              </th>
              <th className="hidden md:table-cell" style={{ textAlign: "right", width: 110 }}>
                Period left
              </th>
              <th style={{ textAlign: "right", width: 90 }}>Status</th>
            </tr>
          </thead>
          <tbody>
            {isPending ? (
              Array.from({ length: 10 }).map((_, i) => (
                <tr key={i}>
                  <td colSpan={7}>
                    <Skeleton className="h-4 w-full" />
                  </td>
                </tr>
              ))
            ) : sorted.length === 0 ? (
              <tr>
                <td colSpan={7} style={{ padding: "20px 12px" }}>
                  <div className="mono text-center" style={{ fontSize: 12, color: "var(--ink-4)" }}>
                    {filtersActive ? (
                      <>No validators match these filters.</>
                    ) : error ? (
                      // Error already explained in the banner above —
                      // don't repeat it (and especially don't surface
                      // the misleading "check -pchain-rpc" remediation
                      // when the real cause was bootstrapping or an
                      // unrelated upstream failure).
                      <>—</>
                    ) : (
                      <>
                        No validators returned for subnet <code>{chain?.subnetId || "—"}</code>. The
                        L1&apos;s subnet ID may not be registered on the configured P-Chain yet.
                      </>
                    )}
                  </div>
                </td>
              </tr>
            ) : (
              sorted.map((v) => (
                <ValidatorRow
                  key={v.txID}
                  v={v}
                  symbol={symbol}
                  isPrimary={isPrimary}
                  totalWeight={totals.totalWeight}
                  uptime={uptimeFor(v)}
                  peer={peerFor(v)}
                />
              ))
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}

function ValidatorRow({
  v,
  symbol,
  isPrimary,
  totalWeight,
  uptime,
  peer,
}: {
  v: Validator;
  symbol: string;
  isPrimary: boolean;
  totalWeight: string;
  uptime: string | number | undefined;
  peer: Peer | undefined;
}) {
  const router = useRouter();
  const href = `/validators/${encodeURIComponent(v.nodeID)}`;

  const sharePct = useMemo(() => {
    try {
      const w = BigInt(v.weight ?? "0");
      const total = BigInt(totalWeight);
      if (total === 0n) return 0;
      return Number((w * 10000n) / total) / 100;
    } catch {
      return 0;
    }
  }, [v.weight, totalWeight]);

  // Pre-fetch L1Validator details for ACP-77 L1 validators so the Balance
  // column and the linked detail page hit a warm tanstack cache. Skip on
  // Primary Network — that endpoint won't know about Primary nodes.
  const {
    data: l1,
    isPending: l1Loading,
    error: l1Error,
  } = useL1Validator(!isPrimary ? v.validationID : undefined);

  const balanceDisplay = l1?.balance ? formatAvax(l1.balance, symbol) : null;

  return (
    <tr
      onClick={() => router.push(href)}
      style={{ cursor: "pointer" }}
      role="link"
      aria-label={`Open validator ${v.nodeID}`}
    >
      <td>
        <div style={{ display: "flex", flexDirection: "column", gap: 2 }}>
          <Link
            href={href}
            onClick={(e) => e.stopPropagation()}
            className="hash-link mono"
            style={{
              textDecoration: "none",
              color: "var(--accent-ink)",
              fontSize: 12.5,
              wordBreak: "break-all",
            }}
          >
            {v.nodeID}
          </Link>
          <PeerSubline peer={peer} />
        </div>
      </td>
      <td className="mono" style={{ textAlign: "right" }}>
        {isPrimary ? formatAvax(v.stakeAmount ?? v.weight, symbol) : formatWeight(v.weight)}
      </td>
      <td className="hidden md:table-cell">
        <div className="flex items-center gap-2">
          <div
            style={{
              width: 100,
              height: 5,
              borderRadius: 99,
              background: "var(--bg-sunken)",
              overflow: "hidden",
            }}
          >
            <div
              style={{
                width: `${Math.min(100, sharePct)}%`,
                height: "100%",
                background: "var(--ink)",
              }}
            />
          </div>
          <span className="mono" style={{ fontSize: 11.5, color: "var(--ink-3)" }}>
            {sharePct.toFixed(2)}%
          </span>
        </div>
      </td>
      <td className="mono hidden md:table-cell" style={{ textAlign: "right" }}>
        {isPrimary ? (
          <span style={{ color: "var(--ink-4)" }}>n/a</span>
        ) : !v.validationID ? (
          <span
            style={{ color: "var(--ink-4)" }}
            title="Classic subnet validator (pre-Etna), no balance tracking"
          >
            —
          </span>
        ) : l1Loading ? (
          <span style={{ color: "var(--ink-4)" }}>…</span>
        ) : l1Error ? (
          <BalanceErrorPill error={l1Error} />
        ) : (
          (balanceDisplay ?? <span style={{ color: "var(--ink-4)" }}>—</span>)
        )}
      </td>
      <td className="mono hidden md:table-cell" style={{ textAlign: "right" }}>
        {uptime !== undefined && uptime !== "" ? (
          formatUptime(uptime)
        ) : (
          <span
            style={{ color: "var(--ink-4)" }}
            title="No uptime reported for this validator. firn must be started with -rpc (which auto-derives -validators-rpc) for subnet-evm /validators data."
          >
            —
          </span>
        )}
      </td>
      <td className="mono hidden md:table-cell" style={{ textAlign: "right" }}>
        {formatPeriodRemaining(v.endTime)}
      </td>
      <td style={{ textAlign: "right" }}>
        <span
          className="mono"
          style={{
            fontSize: 11,
            color: v.connected ? "oklch(0.62 0.13 145)" : "var(--ink-4)",
          }}
        >
          {v.connected === undefined ? "—" : v.connected ? "● live" : "○ off"}
        </span>
      </td>
    </tr>
  );
}

function cmpBig(a: string | undefined, b: string | undefined): number {
  try {
    const ai = BigInt(a ?? "0");
    const bi = BigInt(b ?? "0");
    if (ai === bi) return 0;
    return ai > bi ? 1 : -1;
  } catch {
    return 0;
  }
}

/**
 * Renders the balance-cell error in a way that explains itself.
 *
 * The previous "err" rendering hid the underlying message in the
 * tooltip and gave the user no actionable signal. Common causes are
 * specific and worth distinguishing:
 *
 *   - 503 / "rpc_disabled"  → firn was started without -pchain-rpc;
 *     show "no rpc" so operators reach for the right config.
 *   - "method not found"    → the upstream P-Chain doesn't yet
 *     expose platform.getL1Validator (older avalanchego). Show
 *     "old node".
 *   - "validationID not found" / similar → the configured P-Chain
 *     is on a different network than the validator (running firn
 *     against mainnet's P-Chain while looking at Fuji validators is
 *     a frequent setup mistake). Show "wrong net".
 *   - everything else → "rpc err" with the message in the tooltip
 *     for diagnosis.
 *
 * Hover for full message in every case.
 */
/**
 * Translate a /v1/validators/uptime error into a one-line operator
 * hint shown under the Avg uptime tile. The previous fixed text
 * ("needs /validators proxy") was misleading on chains where firn
 * IS proxying /validators but the upstream returned an empty set —
 * which happens on a fresh L1 with no uptime samples yet, on
 * mainnet/testnet mismatches, or when the namespace isn't enabled
 * on the L1's avalanchego.
 */
function describeUptimeMiss(err: Error | null | undefined): string {
  if (!err) return "no samples yet";
  const msg = (err.message ?? "").toLowerCase();
  if (msg.includes("rpc_disabled") || msg.includes("503")) return "needs -validators-rpc";
  if (msg.includes("method not found") || msg.includes("-32601")) return "namespace not enabled";
  if (msg.includes("502") || msg.includes("upstream")) return "upstream unreachable";
  return "uptime endpoint failed";
}

function BalanceErrorPill({ error }: { error: Error }) {
  const msg = error.message ?? "";
  const lower = msg.toLowerCase();
  let label = "rpc err";
  // Order matters — check more specific shapes first.
  if (lower.includes("rpc_disabled") || lower.includes("503")) {
    label = "no rpc";
  } else if (lower.includes("method not found") || lower.includes("-32601")) {
    label = "old node";
  } else if (
    // "couldn't get validator: not found" / "validationID … not found"
    // — P-Chain saw the request, doesn't know this validationID. Most
    //   commonly means we're aimed at a different network's P-Chain.
    lower.includes("couldn't get validator") ||
    (lower.includes("not found") && (lower.includes("validation") || lower.includes("validator")))
  ) {
    label = "wrong net";
  } else if (
    // BadGateway / network unreachable from firn → P-Chain.
    lower.includes("502") ||
    lower.includes("upstream") ||
    lower.includes("connection refused") ||
    lower.includes("dial tcp") ||
    lower.includes("timeout")
  ) {
    label = "upstream";
  } else if (lower.includes("bootstrapping")) {
    label = "bootstrap";
  } else if (lower.includes("invalid") && lower.includes("validation")) {
    label = "bad id";
  }
  return (
    <span style={{ color: "var(--ink-4)", fontSize: 11.5, fontStyle: "italic" }} title={msg}>
      {label}
    </span>
  );
}

/**
 * Compact P2P-context line shown under each validator's nodeID.
 * Renders only when our local node is currently peered with this
 * validator (info.peers had a row); otherwise a tiny dim "not peered"
 * label so operators can tell the difference between "no peer info
 * available at all" (firn lacks /ext/info) and "we just don't see this
 * one." Tooltip carries the full PublicIP, version, and timestamps for
 * the curious.
 *
 * Privacy note: PublicIP is by definition advertised on the P2P
 * network; it's the same value avalanchego ships in `appRequest` and
 * peer-list gossip. Surfacing it here doesn't leak anything operators
 * haven't already broadcasted.
 */
function PeerSubline({ peer }: { peer: Peer | undefined }) {
  if (!peer) {
    return (
      <span
        className="mono"
        style={{ fontSize: 10.5, color: "var(--ink-4)" }}
        title="Not in our local node's peer table. Either firn isn't pointed at an /ext/info-exposing avalanchego (try -info-rpc), or the validator isn't currently gossiping with our node."
      >
        not peered
      </span>
    );
  }
  const host = peer.publicIP || peer.ip;
  const obs = parseFloat(peer.observedUptime || "");
  const obsLabel = Number.isFinite(obs) ? `${obs.toFixed(1)}%` : null;
  const titleParts = [
    peer.publicIP ? `publicIP=${peer.publicIP}` : "",
    peer.ip && peer.ip !== peer.publicIP ? `ip=${peer.ip}` : "",
    peer.version ? `version=${peer.version}` : "",
    peer.lastSent ? `lastSent=${peer.lastSent}` : "",
    peer.lastReceived ? `lastReceived=${peer.lastReceived}` : "",
    peer.benched && peer.benched.length > 0 ? `benched=${peer.benched.length}` : "",
  ].filter(Boolean);
  const benched = (peer.benched ?? []).length;
  return (
    <span
      className="mono"
      title={titleParts.join("\n")}
      style={{
        display: "inline-flex",
        alignItems: "center",
        gap: 8,
        fontSize: 10.5,
        color: "var(--ink-3)",
        flexWrap: "wrap",
      }}
    >
      <span style={{ color: "var(--ink-2)" }}>{host}</span>
      {peer.version ? (
        <span style={{ color: "var(--ink-4)" }}>{peer.version.replace(/^avalanche\//, "")}</span>
      ) : null}
      {obsLabel ? (
        <span
          style={{ color: obs >= 99 ? "oklch(0.62 0.13 145)" : "var(--ink-4)" }}
          title="Observed uptime — percentage of consensus polls this peer has answered, from our local node's perspective."
        >
          obs {obsLabel}
        </span>
      ) : null}
      {benched > 0 ? (
        <span
          style={{ color: "var(--warn)" }}
          title="Number of subnets where this peer has been benched (stopped responding to consensus polls)."
        >
          benched {benched}
        </span>
      ) : null}
    </span>
  );
}

function KpiTile({ label, value, sub }: { label: string; value: string; sub: string }) {
  return (
    <div style={{ padding: "20px 18px", borderRight: "1px solid var(--line)" }}>
      <div className="eyebrow mb-2.5">{label}</div>
      <div
        className="h-display"
        style={{ fontSize: 24, color: value === "—" ? "var(--ink-4)" : "var(--ink)" }}
      >
        {value}
      </div>
      <div className="mono" style={{ fontSize: 11, color: "var(--ink-4)", marginTop: 4 }}>
        {sub}
      </div>
    </div>
  );
}
