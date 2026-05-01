"use client";

import { useTransactions } from "@/lib/api/queries";
import { Hash } from "@/components/lattice/hash";
import { Chip } from "@/components/lattice/chip";
import { Skeleton } from "@/components/ui/skeleton";
import {
  formatNativeAmount,
  formatNumber,
  formatRelativeTime,
} from "@/lib/format";

export default function TransactionsPage() {
  const { data, isPending, error } = useTransactions();

  return (
    <div className="px-10 py-8 pb-12">
      <div className="eyebrow mb-2.5">◆ Transactions</div>
      <div className="flex items-baseline gap-3 mb-2">
        <span className="h-display" style={{ fontSize: 56 }}>
          Latest transactions
        </span>
        <span className="live-dot" />
        <span style={{ fontSize: 12, color: "var(--ink-3)" }}>live</span>
      </div>
      <div className="mb-9" style={{ fontSize: 14, color: "var(--ink-3)" }}>
        Updated via WebSocket whenever a new transaction lands on chain.
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
          <div style={{ fontWeight: 500, marginBottom: 4 }}>
            Couldn&apos;t load transactions
          </div>
          <div className="mono" style={{ fontSize: 11.5, color: "var(--ink-3)" }}>
            {error.message}
          </div>
        </div>
      ) : null}

      <div className="card border border-line rounded-[10px] bg-bg-elev">
        <table className="lat-tbl">
          <thead>
            <tr>
              <th style={{ width: 80 }}>Status</th>
              <th>Hash</th>
              <th style={{ width: 110 }}>Method</th>
              <th>From</th>
              <th>To</th>
              <th style={{ textAlign: "right", width: 140 }}>Value</th>
              <th style={{ textAlign: "right", width: 100 }}>Block</th>
              <th style={{ textAlign: "right", width: 100 }}>Age</th>
            </tr>
          </thead>
          <tbody>
            {isPending ? (
              Array.from({ length: 10 }).map((_, i) => (
                <tr key={i}>
                  <td colSpan={8}>
                    <Skeleton className="h-4 w-full" />
                  </td>
                </tr>
              ))
            ) : data?.items.length ? (
              data.items.map((t) => (
                <tr key={t.hash}>
                  <td>
                    <Chip tone={t.status === "ok" ? "good" : "bad"}>
                      {t.status === "ok" ? "✓ ok" : t.status ?? "—"}
                    </Chip>
                  </td>
                  <td className="mono">
                    <Hash value={t.hash} link length={12} />
                  </td>
                  <td>
                    {t.method ? (
                      <Chip tone="steel">{t.method}</Chip>
                    ) : (
                      <span style={{ color: "var(--ink-4)", fontSize: 12 }}>—</span>
                    )}
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
                      <span style={{ color: "var(--ink-4)", fontSize: 12 }}>create</span>
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
                    style={{ textAlign: "right", color: "var(--ink-2)" }}
                  >
                    #{formatNumber(t.block_number ?? null)}
                  </td>
                  <td
                    className="mono"
                    style={{ textAlign: "right", color: "var(--ink-4)" }}
                  >
                    {formatRelativeTime(t.timestamp)}
                  </td>
                </tr>
              ))
            ) : (
              <tr>
                <td
                  colSpan={8}
                  className="text-center py-10"
                  style={{ color: "var(--ink-4)" }}
                >
                  No transactions yet.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
