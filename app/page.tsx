"use client";

import Link from "next/link";
import { useStats, useBlocks } from "@/lib/api/queries";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { formatNumber, formatRelativeTime, truncateHash } from "@/lib/format";

export default function Home() {
  const { data: stats, isPending: statsPending } = useStats();
  const { data: blocks, isPending: blocksPending } = useBlocks();

  const tiles: Array<{ label: string; value: string }> = stats
    ? [
        { label: "Total blocks", value: formatNumber(stats.total_blocks) },
        { label: "Total transactions", value: formatNumber(stats.total_transactions) },
        { label: "Total addresses", value: formatNumber(stats.total_addresses) },
        {
          label: "Avg block time",
          value:
            typeof stats.average_block_time === "number" && stats.average_block_time > 0
              ? `${(stats.average_block_time / 1000).toFixed(2)}s`
              : "—",
        },
      ]
    : [];

  return (
    <div className="space-y-8">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">Dashboard</h1>
        <p className="text-sm text-muted-foreground">
          Live stats from the connected Blockscout backend.
        </p>
      </div>

      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        {statsPending
          ? Array.from({ length: 4 }).map((_, i) => (
              <Card key={i}>
                <CardHeader className="pb-2">
                  <Skeleton className="h-4 w-24" />
                </CardHeader>
                <CardContent>
                  <Skeleton className="h-7 w-20" />
                </CardContent>
              </Card>
            ))
          : tiles.map((tile) => (
              <Card key={tile.label}>
                <CardHeader className="pb-2">
                  <CardTitle className="text-xs font-medium text-muted-foreground uppercase tracking-wide">
                    {tile.label}
                  </CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="text-2xl font-semibold tabular-nums">{tile.value}</div>
                </CardContent>
              </Card>
            ))}
      </div>

      <section className="space-y-3">
        <div className="flex items-baseline justify-between">
          <h2 className="text-lg font-semibold">Latest blocks</h2>
          <Link href="/blocks" className="text-sm text-muted-foreground hover:text-foreground">
            View all →
          </Link>
        </div>
        <div className="rounded-md border divide-y">
          {blocksPending
            ? Array.from({ length: 5 }).map((_, i) => (
                <div key={i} className="flex items-center justify-between p-3">
                  <Skeleton className="h-4 w-24" />
                  <Skeleton className="h-4 w-32" />
                </div>
              ))
            : blocks?.items.slice(0, 5).map((b) => (
                <div
                  key={b.hash}
                  className="flex items-center justify-between p-3 text-sm"
                >
                  <div className="flex items-center gap-4">
                    <span className="font-mono font-medium">#{formatNumber(b.height)}</span>
                    <span className="font-mono text-xs text-muted-foreground">
                      {truncateHash(b.hash, 8, 6)}
                    </span>
                  </div>
                  <div className="flex items-center gap-4 text-muted-foreground text-xs">
                    <span>{b.transactions_count} txs</span>
                    <span>{formatRelativeTime(b.timestamp)}</span>
                  </div>
                </div>
              ))}
        </div>
      </section>
    </div>
  );
}
