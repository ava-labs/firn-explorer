"use client";

import Link from "next/link";
import { useStats, useBlocks, useTransactions, useChain } from "@/lib/api/queries";
import { Hash } from "@/components/lattice/hash";
import { Chip } from "@/components/lattice/chip";
import { Skeleton } from "@/components/ui/skeleton";
import { useFreshHashes } from "@/lib/use-fresh";
import {
  formatNativeAmount,
  formatNumber,
  formatRelativeTime,
  truncateHash,
} from "@/lib/format";

export default function Home() {
  const { data: chain } = useChain();
  const { data: stats } = useStats();
  const { data: blocksPage } = useBlocks({ limit: 50 });
  const { data: txsPage } = useTransactions({ limit: 10 });

  const blocks = blocksPage?.data;
  const txs = txsPage?.data;
  const symbol = chain?.nativeToken.symbol ?? "—";
  const blockTimeMs = stats?.averageBlockTimeMs ?? null;
  const tps =
    blockTimeMs && blocks && blocks[0]
      ? Math.round((blocks[0].transactionsCount * 1000) / blockTimeMs)
      : null;

  const freshBlocks = useFreshHashes(blocks);

  return (
    <div className="px-10 py-8 pb-12">
      {/* Hero row: headline stat + live block ticker */}
      <div
        className="grid gap-12 items-start mb-14"
        style={{ gridTemplateColumns: "1.4fr 1fr" }}
      >
        <div>
          <div className="eyebrow mb-5">
            ◆ {chain?.name ?? "…"}
            {chain ? ` · ${chain.network}` : ""}
            {blockTimeMs ? ` · ${(blockTimeMs / 1000).toFixed(2)}s block time` : ""}
          </div>
          <div className="h-display" style={{ fontSize: 88 }}>
            {stats ? formatNumber(stats.totalBlocks) : <Skeleton className="h-[88px] w-[360px]" />}
          </div>
          <div className="flex items-baseline gap-3 mt-1.5 mb-9">
            <span style={{ fontSize: 16, color: "var(--ink-3)" }}>blocks produced</span>
            {tps != null ? (
              <Chip tone="good">
                <span
                  style={{ width: 5, height: 5, borderRadius: 99, background: "currentColor" }}
                />
                {tps} tx/s
              </Chip>
            ) : null}
          </div>

          {/* KPI strip */}
          <div
            className="grid"
            style={{
              gridTemplateColumns: "repeat(4, 1fr)",
              borderTop: "1px solid var(--line)",
            }}
          >
            <Kpi
              label="Transactions"
              value={stats ? formatNumber(stats.totalTransactions) : null}
              sub={stats ? `${formatNumber(stats.transactionsLast24h)} last 24h` : ""}
            />
            <Kpi
              label="Avg gas price"
              value={stats ? formatGwei(stats.gasPrice.average) : null}
              sub="median, 60s"
            />
            <Kpi
              label="Addresses"
              value={stats ? formatNumber(stats.totalAddresses) : null}
              sub={
                stats?.networkUtilization != null
                  ? `${(stats.networkUtilization * 100).toFixed(2)}% util`
                  : ""
              }
            />
            <Kpi
              label="Block time"
              value={blockTimeMs ? `${(blockTimeMs / 1000).toFixed(2)}s` : null}
              sub="rolling avg"
            />
          </div>
        </div>

        {/* Live ticker */}
        <div className="card overflow-hidden border border-line rounded-[10px] bg-bg-elev">
          <div
            className="flex items-center justify-between border-b border-line"
            style={{ padding: "14px 18px" }}
          >
            <div className="flex items-center gap-2">
              <span className="live-dot" />
              <span style={{ fontSize: 12, fontWeight: 500 }}>Live blocks</span>
            </div>
            <span className="mono" style={{ fontSize: 11, color: "var(--ink-4)" }}>
              via WebSocket
            </span>
          </div>
          <div>
            {!blocks ? (
              Array.from({ length: 6 }).map((_, i) => (
                <div key={i} className="px-[18px] py-3.5">
                  <Skeleton className="h-4 w-full" />
                </div>
              ))
            ) : blocks.length === 0 ? (
              <div
                className="text-center py-12"
                style={{ color: "var(--ink-4)", fontSize: 13 }}
              >
                Waiting for first block…
              </div>
            ) : (
              blocks.slice(0, 6).map((b, i, arr) => (
                <div
                  key={b.hash}
                  className={`grid items-center gap-3.5 ${freshBlocks.has(b.hash) ? "fresh-row" : ""}`}
                  style={{
                    gridTemplateColumns: "100px 1fr auto",
                    padding: "14px 18px",
                    borderBottom: i < arr.length - 1 ? "1px solid var(--line-soft)" : 0,
                  }}
                >
                  <div>
                    <div className="mono" style={{ fontSize: 13, color: "var(--ink)" }}>
                      #{formatNumber(b.number)}
                    </div>
                    <div className="mono" style={{ fontSize: 11, color: "var(--ink-4)" }}>
                      {formatRelativeTime(b.timestamp)}
                    </div>
                  </div>
                  <div>
                    <div style={{ fontSize: 12.5, color: "var(--ink-2)" }}>
                      {b.transactionsCount} txns
                    </div>
                    <div className="mono" style={{ fontSize: 10.5, color: "var(--ink-4)" }}>
                      by {b.miner ? truncateHash(b.miner, 6, 4) : "—"}
                    </div>
                  </div>
                  <div className="text-right">
                    <div className="mono" style={{ fontSize: 12, color: "var(--ink-2)" }}>
                      {formatNumber(b.gas.used)}
                    </div>
                    <div className="mono" style={{ fontSize: 10.5, color: "var(--ink-4)" }}>
                      gas
                    </div>
                  </div>
                </div>
              ))
            )}
          </div>
        </div>
      </div>

      {/* Latest transactions */}
      <div>
        <div className="flex items-baseline justify-between mb-[18px]">
          <div>
            <div className="eyebrow mb-1.5">Latest activity</div>
            <div className="h-display" style={{ fontSize: 26 }}>
              Transactions
            </div>
          </div>
          <Link
            href="/transactions"
            style={{
              fontSize: 12.5,
              color: "var(--ink-3)",
              textDecoration: "none",
            }}
          >
            View all →
          </Link>
        </div>
        <div className="card border border-line rounded-[10px] bg-bg-elev">
          <table className="lat-tbl">
            <thead>
              <tr>
                <th style={{ width: 72 }}>Status</th>
                <th>Hash</th>
                <th style={{ width: 110 }}>Method</th>
                <th>From</th>
                <th>To</th>
                <th style={{ textAlign: "right" }}>Value</th>
                <th style={{ textAlign: "right", width: 70 }}>Age</th>
              </tr>
            </thead>
            <tbody>
              {!txs ? (
                Array.from({ length: 6 }).map((_, i) => (
                  <tr key={i}>
                    <td colSpan={7}>
                      <Skeleton className="h-4 w-full" />
                    </td>
                  </tr>
                ))
              ) : (
                txs.slice(0, 8).map((t) => (
                  <tr key={t.hash}>
                    <td>
                      <Chip tone={t.status === "success" ? "good" : "bad"}>
                        {t.status === "success" ? "✓ ok" : t.status}
                      </Chip>
                    </td>
                    <td>
                      <Hash value={t.hash} tone="link" length={10} />
                    </td>
                    <td>
                      {t.method.name ? (
                        <Chip tone="steel">{t.method.name}</Chip>
                      ) : (
                        <span
                          className="mono"
                          style={{ fontSize: 11.5, color: "var(--ink-4)" }}
                        >
                          {t.method.selector}
                        </span>
                      )}
                    </td>
                    <td>
                      <Hash value={t.from} tone="dim" length={6} />
                    </td>
                    <td>
                      {t.to ? (
                        <Hash value={t.to} tone="dim" length={6} />
                      ) : (
                        <span
                          className="mono"
                          style={{ fontSize: 11.5, color: "var(--ink-4)" }}
                        >
                          contract creation
                        </span>
                      )}
                    </td>
                    <td
                      className="mono"
                      style={{ textAlign: "right", color: "var(--ink)" }}
                    >
                      {formatNativeAmount(t.value, symbol)}
                    </td>
                    <td
                      className="mono"
                      style={{ textAlign: "right", color: "var(--ink-4)" }}
                    >
                      {formatRelativeTime(t.block.timestamp)}
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}

function Kpi({
  label,
  value,
  sub,
}: {
  label: string;
  value: string | null;
  sub: string;
}) {
  return (
    <div style={{ padding: "20px 16px 0 0" }}>
      <div className="eyebrow mb-2.5">{label}</div>
      <div className="h-display" style={{ fontSize: 28 }}>
        {value ?? <Skeleton className="h-7 w-24" />}
      </div>
      <div className="mono mt-1.5" style={{ fontSize: 11.5, color: "var(--ink-4)" }}>
        {sub}
      </div>
    </div>
  );
}

function formatGwei(weiStr: string): string {
  try {
    const wei = BigInt(weiStr);
    const gwei = Number(wei) / 1e9;
    return `${gwei.toLocaleString(undefined, { maximumFractionDigits: 2 })} gwei`;
  } catch {
    return "—";
  }
}
