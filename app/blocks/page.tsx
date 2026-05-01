"use client";

import { useBlocks } from "@/lib/api/queries";
import { Hash } from "@/components/lattice/hash";
import { Skeleton } from "@/components/ui/skeleton";
import { formatNumber, formatRelativeTime } from "@/lib/format";

export default function BlocksPage() {
  const { data: page, isPending, error } = useBlocks({ limit: 50 });
  const blocks = page?.data;

  return (
    <div className="px-10 py-8 pb-12">
      <div className="eyebrow mb-2.5">◆ Blocks</div>
      <div className="flex items-baseline gap-3 mb-2">
        <span className="h-display" style={{ fontSize: 56 }}>
          Latest blocks
        </span>
        <span className="live-dot" />
        <span style={{ fontSize: 12, color: "var(--ink-3)" }}>live</span>
      </div>
      <div className="mb-9" style={{ fontSize: 14, color: "var(--ink-3)" }}>
        Streamed via WebSocket directly from the indexer.
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
            Couldn&apos;t load blocks
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
              <th style={{ width: 120 }}>Number</th>
              <th>Hash</th>
              <th style={{ textAlign: "right", width: 80 }}>Txns</th>
              <th style={{ textAlign: "right", width: 140 }}>Gas used</th>
              <th>Validator</th>
              <th style={{ textAlign: "right", width: 100 }}>Age</th>
            </tr>
          </thead>
          <tbody>
            {isPending ? (
              Array.from({ length: 10 }).map((_, i) => (
                <tr key={i}>
                  <td colSpan={6}>
                    <Skeleton className="h-4 w-full" />
                  </td>
                </tr>
              ))
            ) : blocks?.length ? (
              blocks.map((block) => (
                <tr key={block.hash}>
                  <td className="mono" style={{ color: "var(--ink)" }}>
                    #{formatNumber(block.number)}
                  </td>
                  <td>
                    <Hash value={block.hash} tone="link" length={14} />
                  </td>
                  <td
                    className="mono"
                    style={{ textAlign: "right", color: "var(--ink-2)" }}
                  >
                    {block.transactionsCount}
                  </td>
                  <td
                    className="mono"
                    style={{ textAlign: "right" }}
                  >
                    {formatNumber(block.gas.used)}
                  </td>
                  <td>
                    {block.miner ? (
                      <Hash value={block.miner} tone="dim" length={8} />
                    ) : (
                      <span style={{ color: "var(--ink-4)" }}>—</span>
                    )}
                  </td>
                  <td
                    className="mono"
                    style={{ textAlign: "right", color: "var(--ink-4)" }}
                  >
                    {formatRelativeTime(block.timestamp)}
                  </td>
                </tr>
              ))
            ) : (
              <tr>
                <td
                  colSpan={6}
                  className="text-center py-10"
                  style={{ color: "var(--ink-4)" }}
                >
                  No blocks yet.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
