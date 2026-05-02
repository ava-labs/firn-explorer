"use client";

import { use, useState } from "react";
import Link from "next/link";
import { Hash } from "@/components/lattice/hash";
import { Chip } from "@/components/lattice/chip";
import { Skeleton } from "@/components/ui/skeleton";
import {
  useChain,
  useContractSource,
  useToken,
  useTokenHolders,
  useTokenTransfers,
} from "@/lib/api/queries";
import {
  formatCompactUnits,
  formatNumber,
  formatRelativeTime,
  formatUnits,
  truncateHash,
} from "@/lib/format";
import { useFreshKeys } from "@/lib/use-fresh";

type TabId = "transfers" | "holders" | "contract";

export default function TokenDetailPage({ params }: { params: Promise<{ hash: string }> }) {
  const { hash: rawHash } = use(params);
  const hash = rawHash.toLowerCase();
  const [tab, setTab] = useState<TabId>("transfers");

  const { data: chain } = useChain();
  const { data: token, isPending: tokenPending, error: tokenErr } = useToken(hash);
  const { data: src, isPending: srcPending } = useContractSource(chain?.chainId, hash);

  const verified = src?.match === "exact_match" || src?.match === "match";
  const sourcifyName = src?.compilation?.name;
  const displayName = token?.name ?? sourcifyName ?? "Unknown token";
  const symbol = token?.symbol ?? "—";
  const decimals = token?.decimals ?? 0;
  const tokenInitial = (token?.symbol ?? token?.name ?? hash)
    .replace(/^0x/, "")
    .slice(0, 1)
    .toUpperCase();

  return (
    <div className="px-10 py-8 pb-12">
      <div className="eyebrow mb-2.5">◆ Token · ERC-20</div>

      {/* Header: icon + name/symbol */}
      <div className="flex items-center gap-4 mb-2">
        <div
          className="grid place-items-center text-white"
          style={{
            width: 48,
            height: 48,
            borderRadius: 12,
            background: "var(--accent)",
            fontFamily: "var(--font-display)",
            fontWeight: 600,
            fontSize: 22,
          }}
        >
          {tokenInitial}
        </div>
        <div style={{ minWidth: 0 }}>
          <div className="h-display flex items-center gap-3 flex-wrap" style={{ fontSize: 36 }}>
            <span
              style={{
                color: token?.name ? "var(--ink)" : "var(--ink-4)",
              }}
            >
              {tokenPending ? <Skeleton className="h-[36px] w-[220px]" /> : displayName}
            </span>
            {token?.symbol ? (
              <span className="mono" style={{ color: "var(--ink-3)", fontSize: 18 }}>
                · {token.symbol}
              </span>
            ) : null}
            {srcPending ? (
              <Chip tone="steel">checking Sourcify…</Chip>
            ) : verified ? (
              <Chip tone="good">✓ Verified</Chip>
            ) : null}
          </div>
          <Hash value={hash} length={0} tone="plain" showCopy />
        </div>
      </div>

      {/* Error band — surface 404 / connection failures inline */}
      {tokenErr ? (
        <div
          className="mt-4 mb-2 border border-line rounded-[8px] bg-bg-elev"
          style={{
            padding: "10px 14px",
            fontSize: 12,
            color: "var(--ink-3)",
          }}
        >
          firn returned an error for this address: {String(tokenErr.message)}
        </div>
      ) : null}

      {/* KPI strip */}
      <div
        className="grid"
        style={{
          gridTemplateColumns: "repeat(4, 1fr)",
          borderTop: "1px solid var(--line)",
          borderBottom: "1px solid var(--line)",
          margin: "32px 0",
        }}
      >
        <Kpi
          label="Total supply"
          value={
            tokenPending
              ? null
              : token?.totalSupply
                ? `${formatCompactUnits(token.totalSupply, decimals)} ${symbol === "—" ? "" : symbol}`.trim()
                : "—"
          }
          sub={`decimals: ${decimals}`}
        />
        <Kpi
          label="Holders"
          value={tokenPending ? null : formatNumber(token?.holders ?? 0)}
          sub="distinct addrs in Transfer logs"
        />
        <Kpi
          label="Transfers"
          value={tokenPending ? null : formatNumber(token?.transferCount ?? 0)}
          sub="total Transfer events"
        />
        <Kpi
          label="First seen"
          value={tokenPending ? null : `#${formatNumber(token?.firstSeenBlock ?? 0)}`}
          sub="block of first Transfer"
        />
      </div>

      {/* Tabs */}
      <div className="lat-tabs">
        {(
          [
            { id: "transfers", label: "Transfers" },
            { id: "holders", label: "Holders" },
            { id: "contract", label: "Contract" },
          ] as ReadonlyArray<{ id: TabId; label: string }>
        ).map((t) => (
          <button
            key={t.id}
            onClick={() => setTab(t.id)}
            className={`lat-tab ${tab === t.id ? "active" : ""}`}
          >
            {t.label}
          </button>
        ))}
      </div>

      {tab === "transfers" && (
        <TransfersTable address={hash} symbol={token?.symbol} decimals={decimals} />
      )}
      {tab === "holders" && (
        <HoldersTable
          address={hash}
          symbol={token?.symbol}
          decimals={decimals}
          totalSupply={token?.totalSupply}
        />
      )}
      {tab === "contract" && (
        <ContractPanel
          hash={hash}
          verified={verified}
          srcPending={srcPending}
          contractName={sourcifyName}
          compiler={src?.compilation?.compilerVersion}
          sourceCount={src?.sources?.length ?? 0}
        />
      )}
    </div>
  );
}

function Kpi({ label, value, sub }: { label: string; value: string | null; sub: string }) {
  return (
    <div
      style={{
        padding: "20px 18px",
        borderRight: "1px solid var(--line)",
      }}
    >
      <div className="eyebrow mb-2.5">{label}</div>
      <div className="h-display" style={{ fontSize: 24 }}>
        {value === null ? <Skeleton className="h-[24px] w-[120px]" /> : value}
      </div>
      <div className="mono" style={{ fontSize: 11, color: "var(--ink-4)", marginTop: 4 }}>
        {sub}
      </div>
    </div>
  );
}

function TransfersTable({
  address,
  symbol,
  decimals,
}: {
  address: string;
  symbol: string | undefined;
  decimals: number;
}) {
  const { data, isPending, error } = useTokenTransfers(address, { limit: 50 });
  const rows = data?.data ?? [];
  const fresh = useFreshKeys(rows, (t) => `${t.txHash}-${t.logIndex}`);

  return (
    <div className="card border border-line rounded-[10px] bg-bg-elev mt-6">
      <table className="lat-tbl">
        <thead>
          <tr>
            <th>Tx</th>
            <th>From</th>
            <th>To</th>
            <th style={{ textAlign: "right", width: 200 }}>Amount</th>
            <th style={{ textAlign: "right", width: 120 }}>Block</th>
            <th style={{ textAlign: "right", width: 100 }}>Age</th>
          </tr>
        </thead>
        <tbody>
          {error ? (
            <tr>
              <td colSpan={6} style={{ padding: "20px 12px" }}>
                <div className="mono" style={{ fontSize: 12, color: "var(--ink-4)" }}>
                  Failed to load transfers: {String(error.message)}
                </div>
              </td>
            </tr>
          ) : isPending && rows.length === 0 ? (
            Array.from({ length: 6 }).map((_, i) => (
              <tr key={`skel-${i}`}>
                <td colSpan={6}>
                  <Skeleton className="h-4 w-full" />
                </td>
              </tr>
            ))
          ) : rows.length === 0 ? (
            <tr>
              <td
                colSpan={6}
                style={{
                  padding: "32px 12px",
                  textAlign: "center",
                  color: "var(--ink-4)",
                  fontSize: 13,
                }}
              >
                No Transfer events for this address.
              </td>
            </tr>
          ) : (
            rows.map((t) => (
              <tr
                key={`${t.txHash}-${t.logIndex}`}
                className={fresh.has(`${t.txHash}-${t.logIndex}`) ? "fresh-row" : undefined}
              >
                <td>
                  <Link
                    href={`/transactions/${t.txHash}`}
                    className="mono"
                    style={{
                      color: "var(--accent-ink)",
                      textDecoration: "none",
                    }}
                  >
                    {truncateHash(t.txHash)}
                  </Link>
                </td>
                <td>
                  <Link href={`/address/${t.from}`} style={{ textDecoration: "none" }}>
                    <Hash value={t.from} length={20} tone="link" />
                  </Link>
                </td>
                <td>
                  <Link href={`/address/${t.to}`} style={{ textDecoration: "none" }}>
                    <Hash value={t.to} length={20} tone="link" />
                  </Link>
                </td>
                <td className="mono" style={{ textAlign: "right" }}>
                  {formatUnits(t.value, decimals, 4)}
                  {symbol ? <span style={{ color: "var(--ink-4)" }}> {symbol}</span> : null}
                </td>
                <td className="mono" style={{ textAlign: "right" }}>
                  <Link
                    href={`/blocks/${t.blockNumber}`}
                    style={{
                      color: "var(--accent-ink)",
                      textDecoration: "none",
                    }}
                  >
                    #{formatNumber(t.blockNumber)}
                  </Link>
                </td>
                <td className="mono" style={{ textAlign: "right", color: "var(--ink-3)" }}>
                  {formatRelativeTime(t.blockTime)}
                </td>
              </tr>
            ))
          )}
        </tbody>
      </table>
    </div>
  );
}

function HoldersTable({
  address,
  symbol,
  decimals,
  totalSupply,
}: {
  address: string;
  symbol: string | undefined;
  decimals: number;
  totalSupply: string | undefined;
}) {
  const { data, isPending, error } = useTokenHolders(address, { limit: 100 });
  const rows = data?.data ?? [];

  // Pre-compute total-supply BigInt once so we can divide each holder's
  // balance against it for a share %. If totalSupply is missing or zero,
  // we just hide the bars.
  let supplyBig: bigint | null = null;
  try {
    if (totalSupply) {
      const v = BigInt(totalSupply);
      if (v > BigInt(0)) supplyBig = v;
    }
  } catch {
    /* ignore */
  }

  return (
    <div className="card border border-line rounded-[10px] bg-bg-elev mt-6">
      <table className="lat-tbl">
        <thead>
          <tr>
            <th style={{ width: 60 }}>Rank</th>
            <th>Address</th>
            <th style={{ textAlign: "right", width: 220 }}>Balance</th>
            <th style={{ textAlign: "right", width: 90 }}>Share</th>
            <th style={{ width: 220 }}>Distribution</th>
          </tr>
        </thead>
        <tbody>
          {error ? (
            <tr>
              <td colSpan={5} style={{ padding: "20px 12px" }}>
                <div className="mono" style={{ fontSize: 12, color: "var(--ink-4)" }}>
                  Failed to load holders: {String(error.message)}
                </div>
              </td>
            </tr>
          ) : isPending && rows.length === 0 ? (
            Array.from({ length: 6 }).map((_, i) => (
              <tr key={`s-${i}`}>
                <td colSpan={5}>
                  <Skeleton className="h-4 w-full" />
                </td>
              </tr>
            ))
          ) : rows.length === 0 ? (
            <tr>
              <td
                colSpan={5}
                style={{
                  padding: "32px 12px",
                  textAlign: "center",
                  color: "var(--ink-4)",
                  fontSize: 13,
                }}
              >
                No non-zero holders found via balanceOf eth_call.
              </td>
            </tr>
          ) : (
            rows.map((h, i) => {
              let sharePct: number | null = null;
              try {
                if (supplyBig) {
                  const bal = BigInt(h.balance);
                  // basis-points × 100 → 4 decimal precision
                  const bps = (bal * BigInt(1_000_000)) / supplyBig;
                  sharePct = Number(bps) / 10_000;
                }
              } catch {
                /* ignore */
              }
              return (
                <tr key={h.address}>
                  <td className="mono" style={{ color: "var(--ink-4)" }}>
                    #{i + 1}
                  </td>
                  <td>
                    <Link href={`/address/${h.address}`} style={{ textDecoration: "none" }}>
                      <Hash value={h.address} length={20} tone="link" />
                    </Link>
                  </td>
                  <td className="mono" style={{ textAlign: "right" }}>
                    {formatUnits(h.balance, decimals, 4)}
                    {symbol ? <span style={{ color: "var(--ink-4)" }}> {symbol}</span> : null}
                  </td>
                  <td className="mono" style={{ textAlign: "right", color: "var(--ink-3)" }}>
                    {sharePct == null
                      ? "—"
                      : sharePct >= 0.01
                        ? `${sharePct.toFixed(2)}%`
                        : sharePct > 0
                          ? "<0.01%"
                          : "0%"}
                  </td>
                  <td>
                    <div
                      style={{
                        position: "relative",
                        width: 200,
                        height: 6,
                        borderRadius: 99,
                        background: "var(--bg-sunken)",
                      }}
                    >
                      {sharePct != null ? (
                        <div
                          style={{
                            position: "absolute",
                            left: 0,
                            top: 0,
                            bottom: 0,
                            width: `${Math.max(2, Math.min(100, sharePct))}%`,
                            background: "var(--accent)",
                            borderRadius: 99,
                          }}
                        />
                      ) : null}
                    </div>
                  </td>
                </tr>
              );
            })
          )}
        </tbody>
      </table>
    </div>
  );
}

function ContractPanel({
  hash,
  verified,
  srcPending,
  contractName,
  compiler,
  sourceCount,
}: {
  hash: string;
  verified: boolean;
  srcPending: boolean;
  contractName?: string;
  compiler?: string;
  sourceCount: number;
}) {
  if (srcPending) {
    return (
      <div
        className="card border border-line rounded-[10px] bg-bg-elev mt-6"
        style={{ padding: 32 }}
      >
        <Skeleton className="h-4 w-48 mb-3" />
        <Skeleton className="h-3 w-full" />
      </div>
    );
  }
  if (!verified) {
    return (
      <div
        className="card border border-line rounded-[10px] bg-bg-elev mt-6"
        style={{ padding: 32 }}
      >
        <div className="eyebrow mb-2.5">Not verified on Sourcify</div>
        <div style={{ fontSize: 13, color: "var(--ink-3)", maxWidth: 600 }}>
          No source files indexed for this token contract. Submit verification via{" "}
          <a
            href={`https://sourcify.dev/#/lookup/${hash}`}
            target="_blank"
            rel="noopener noreferrer"
            style={{ color: "var(--accent-ink)" }}
          >
            sourcify.dev
          </a>{" "}
          to surface ABI + source files here.
        </div>
      </div>
    );
  }
  return (
    <div
      className="card border border-line rounded-[10px] bg-bg-elev mt-6"
      style={{ padding: "24px 28px" }}
    >
      <div className="eyebrow mb-2.5">✓ Verified on Sourcify</div>
      <div
        style={{
          fontFamily: "var(--font-display), ui-sans-serif, system-ui, sans-serif",
          fontSize: 22,
          fontWeight: 500,
          letterSpacing: "-0.015em",
          marginBottom: 8,
        }}
      >
        {contractName ?? "Verified contract"}
      </div>
      <div className="mono" style={{ fontSize: 12.5, color: "var(--ink-4)", marginBottom: 20 }}>
        {compiler ?? "solc"} · {sourceCount} source file
        {sourceCount === 1 ? "" : "s"}
      </div>
      <Link
        href={`/address/${hash}?type=contract`}
        className="lat-btn"
        style={{ textDecoration: "none" }}
      >
        Open contract → Source / Read / Write
      </Link>
    </div>
  );
}
