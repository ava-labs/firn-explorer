"use client";

import Link from "next/link";
import { useStats, useBlocks, useTransactions } from "@/lib/api/queries";
import { Hash } from "@/components/lattice/hash";
import { Chip } from "@/components/lattice/chip";
import { Skeleton } from "@/components/ui/skeleton";
import {
  formatNativeAmount,
  formatNumber,
  formatRelativeTime,
} from "@/lib/format";

export default function Home() {
  const { data: stats } = useStats();
  const { data: blocks } = useBlocks();
  const { data: txs } = useTransactions();

  const blockTimeMs =
    typeof stats?.average_block_time === "number" && stats.average_block_time > 0
      ? stats.average_block_time
      : null;
  const tps = blockTimeMs && blocks?.items[0]
    ? Math.round((blocks.items[0].transactions_count * 1000) / blockTimeMs)
    : null;

  return (
    <div className="px-10 py-8 pb-12">
      {/* Hero row: headline stat + live block ticker */}
      <div
        className="grid gap-12 items-start mb-14"
        style={{ gridTemplateColumns: "1.4fr 1fr" }}
      >
        <div>
          <div className="eyebrow mb-5">
            ◆ Avalanche L1 · {stats ? "Connected" : "Connecting…"}
            {blockTimeMs ? ` · ${(blockTimeMs / 1000).toFixed(2)}s block time` : ""}
          </div>
          <div className="h-display" style={{ fontSize: 88 }}>
            {stats ? formatNumber(stats.total_blocks) : <Skeleton className="h-[88px] w-[360px]" />}
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
              value={stats ? formatNumber(stats.total_transactions) : null}
              sub={stats ? `${formatNumber(stats.transactions_today)} today` : ""}
            />
            <Kpi
              label="Avg gas price"
              value={
                stats?.gas_prices && typeof stats.gas_prices === "object"
                  ? `${(stats.gas_prices as { average?: number }).average ?? 0} gwei`
                  : null
              }
              sub="median, 60s"
            />
            <Kpi
              label="Addresses"
              value={stats ? formatNumber(stats.total_addresses) : null}
              sub={stats?.network_utilization_percentage != null
                ? `${stats.network_utilization_percentage.toFixed(2)}% util`
                : ""}
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
          <div className="flex items-center justify-between border-b border-line"
            style={{ padding: "14px 18px" }}>
            <div className="flex items-center gap-2">
              <span className="live-dot" />
              <span style={{ fontSize: 12, fontWeight: 500 }}>Live blocks</span>
            </div>
            <span
              className="mono"
              style={{ fontSize: 11, color: "var(--ink-4)" }}
            >
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
            ) : blocks.items.length === 0 ? (
              <div
                className="text-center py-12"
                style={{ color: "var(--ink-4)", fontSize: 13 }}
              >
                Waiting for first block…
              </div>
            ) : (
              blocks.items.slice(0, 6).map((b, i, arr) => (
                <div
                  key={b.hash}
                  className="grid items-center gap-3.5"
                  style={{
                    gridTemplateColumns: "100px 1fr auto",
                    padding: "14px 18px",
                    borderBottom: i < arr.length - 1 ? "1px solid var(--line-2)" : 0,
                  }}
                >
                  <div>
                    <div className="mono" style={{ fontSize: 13, color: "var(--ink)" }}>
                      #{formatNumber(b.height)}
                    </div>
                    <div
                      className="mono"
                      style={{ fontSize: 11, color: "var(--ink-4)" }}
                    >
                      {formatRelativeTime(b.timestamp)}
                    </div>
                  </div>
                  <div>
                    <div style={{ fontSize: 12.5, color: "var(--ink-2)" }}>
                      {b.transactions_count} txns
                    </div>
                    <div
                      className="mono"
                      style={{ fontSize: 10.5, color: "var(--ink-4)" }}
                    >
                      by {b.miner?.hash ? `${b.miner.hash.slice(0, 8)}…${b.miner.hash.slice(-4)}` : "—"}
                    </div>
                  </div>
                  <div className="text-right">
                    <div className="mono" style={{ fontSize: 12, color: "var(--ink-2)" }}>
                      {formatNumber(b.gas_used)}
                    </div>
                    <div
                      className="mono"
                      style={{ fontSize: 10.5, color: "var(--ink-4)" }}
                    >
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
                <th style={{ width: 80 }}>Status</th>
                <th>Hash</th>
                <th>From</th>
                <th>To</th>
                <th style={{ textAlign: "right" }}>Value</th>
                <th style={{ textAlign: "right", width: 80 }}>Age</th>
              </tr>
            </thead>
            <tbody>
              {!txs ? (
                Array.from({ length: 6 }).map((_, i) => (
                  <tr key={i}>
                    <td colSpan={6}>
                      <Skeleton className="h-4 w-full" />
                    </td>
                  </tr>
                ))
              ) : (
                txs.items.slice(0, 8).map((t) => (
                  <tr key={t.hash}>
                    <td>
                      <Chip tone={t.status === "ok" ? "good" : "bad"}>
                        {t.status === "ok" ? "✓ ok" : t.status ?? "—"}
                      </Chip>
                    </td>
                    <td className="mono">
                      <Hash value={t.hash} link length={12} />
                    </td>
                    <td className="mono">
                      <Hash
                        value={t.from?.hash ?? ""}
                        link
                        length={6}
                        showCopy={false}
                      />
                    </td>
                    <td className="mono">
                      {t.to?.hash ? (
                        <Hash value={t.to.hash} link length={6} showCopy={false} />
                      ) : (
                        <span style={{ color: "var(--ink-4)" }}>contract creation</span>
                      )}
                    </td>
                    <td
                      className="mono"
                      style={{ textAlign: "right", color: "var(--ink)" }}
                    >
                      {formatNativeAmount(t.value as string | undefined)}
                    </td>
                    <td
                      className="mono"
                      style={{ textAlign: "right", color: "var(--ink-4)" }}
                    >
                      {formatRelativeTime(t.timestamp)}
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
      <div
        className="mono mt-1.5"
        style={{ fontSize: 11.5, color: "var(--ink-4)" }}
      >
        {sub}
      </div>
    </div>
  );
}
