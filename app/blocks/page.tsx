"use client";

import { useBlocks } from "@/lib/api/queries";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Skeleton } from "@/components/ui/skeleton";
import { formatNumber, formatRelativeTime, truncateHash } from "@/lib/format";

export default function BlocksPage() {
  const { data, isPending, error } = useBlocks();

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">Blocks</h1>
        <p className="text-sm text-muted-foreground">
          Latest blocks indexed by Blockscout. Refreshes every 5s.
        </p>
      </div>

      {error ? (
        <div className="rounded-md border border-destructive/40 bg-destructive/5 p-4 text-sm">
          <p className="font-medium">Couldn&apos;t load blocks</p>
          <p className="text-muted-foreground mt-1 font-mono text-xs">{error.message}</p>
        </div>
      ) : null}

      <div className="rounded-md border">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead className="w-[110px]">Height</TableHead>
              <TableHead>Hash</TableHead>
              <TableHead className="text-right w-[80px]">Txs</TableHead>
              <TableHead className="text-right w-[140px]">Gas used</TableHead>
              <TableHead className="text-right w-[120px]">Age</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {isPending ? (
              Array.from({ length: 8 }).map((_, i) => (
                <TableRow key={i}>
                  <TableCell><Skeleton className="h-4 w-16" /></TableCell>
                  <TableCell><Skeleton className="h-4 w-72" /></TableCell>
                  <TableCell className="text-right"><Skeleton className="h-4 w-8 ml-auto" /></TableCell>
                  <TableCell className="text-right"><Skeleton className="h-4 w-20 ml-auto" /></TableCell>
                  <TableCell className="text-right"><Skeleton className="h-4 w-14 ml-auto" /></TableCell>
                </TableRow>
              ))
            ) : data?.items.length ? (
              data.items.map((block) => (
                <TableRow key={block.hash}>
                  <TableCell className="font-mono">{formatNumber(block.height)}</TableCell>
                  <TableCell className="font-mono text-xs text-muted-foreground">
                    {truncateHash(block.hash, 8, 6)}
                  </TableCell>
                  <TableCell className="text-right tabular-nums">
                    {block.transactions_count}
                  </TableCell>
                  <TableCell className="text-right font-mono text-xs">
                    {formatNumber(block.gas_used)}
                  </TableCell>
                  <TableCell className="text-right text-muted-foreground text-xs">
                    {formatRelativeTime(block.timestamp)}
                  </TableCell>
                </TableRow>
              ))
            ) : (
              <TableRow>
                <TableCell colSpan={5} className="text-center text-muted-foreground py-8">
                  No blocks yet.
                </TableCell>
              </TableRow>
            )}
          </TableBody>
        </Table>
      </div>
    </div>
  );
}
