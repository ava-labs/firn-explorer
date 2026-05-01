"use client";

import { useTransactions } from "@/lib/api/queries";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Skeleton } from "@/components/ui/skeleton";
import { Badge } from "@/components/ui/badge";
import {
  formatNativeAmount,
  formatNumber,
  formatRelativeTime,
  truncateHash,
} from "@/lib/format";

export default function TransactionsPage() {
  const { data, isPending, error } = useTransactions();

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">Transactions</h1>
        <p className="text-sm text-muted-foreground">
          Latest transactions on the chain. Refreshes every 5s.
        </p>
      </div>

      {error ? (
        <div className="rounded-md border border-destructive/40 bg-destructive/5 p-4 text-sm">
          <p className="font-medium">Couldn&apos;t load transactions</p>
          <p className="text-muted-foreground mt-1 font-mono text-xs">{error.message}</p>
        </div>
      ) : null}

      <div className="rounded-md border">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead className="w-[160px]">Hash</TableHead>
              <TableHead className="w-[80px]">Status</TableHead>
              <TableHead className="w-[100px]">Block</TableHead>
              <TableHead>From</TableHead>
              <TableHead>To</TableHead>
              <TableHead className="text-right w-[140px]">Value</TableHead>
              <TableHead className="text-right w-[100px]">Age</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {isPending ? (
              Array.from({ length: 8 }).map((_, i) => (
                <TableRow key={i}>
                  <TableCell><Skeleton className="h-4 w-32" /></TableCell>
                  <TableCell><Skeleton className="h-5 w-12" /></TableCell>
                  <TableCell><Skeleton className="h-4 w-12" /></TableCell>
                  <TableCell><Skeleton className="h-4 w-32" /></TableCell>
                  <TableCell><Skeleton className="h-4 w-32" /></TableCell>
                  <TableCell className="text-right"><Skeleton className="h-4 w-20 ml-auto" /></TableCell>
                  <TableCell className="text-right"><Skeleton className="h-4 w-14 ml-auto" /></TableCell>
                </TableRow>
              ))
            ) : data?.items.length ? (
              data.items.map((tx) => (
                <TableRow key={tx.hash}>
                  <TableCell className="font-mono text-xs">{truncateHash(tx.hash, 6, 4)}</TableCell>
                  <TableCell>
                    <Badge
                      variant={tx.status === "ok" ? "secondary" : "destructive"}
                      className="font-mono text-[10px] uppercase"
                    >
                      {tx.status ?? "—"}
                    </Badge>
                  </TableCell>
                  <TableCell className="font-mono">
                    {formatNumber(tx.block_number ?? null)}
                  </TableCell>
                  <TableCell className="font-mono text-xs text-muted-foreground">
                    {truncateHash(tx.from?.hash ?? "", 6, 4)}
                  </TableCell>
                  <TableCell className="font-mono text-xs text-muted-foreground">
                    {tx.to?.hash ? truncateHash(tx.to.hash, 6, 4) : "—"}
                  </TableCell>
                  <TableCell className="text-right font-mono text-xs">
                    {formatNativeAmount(tx.value as string | undefined)}
                  </TableCell>
                  <TableCell className="text-right text-muted-foreground text-xs">
                    {formatRelativeTime(tx.timestamp)}
                  </TableCell>
                </TableRow>
              ))
            ) : (
              <TableRow>
                <TableCell colSpan={7} className="text-center text-muted-foreground py-8">
                  No transactions yet.
                </TableCell>
              </TableRow>
            )}
          </TableBody>
        </Table>
      </div>
    </div>
  );
}
