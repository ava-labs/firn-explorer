"use client";

import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { useTransactions, useChain } from "@/lib/api/queries";
import { Hash } from "@/components/lattice/hash";
import { Chip } from "@/components/lattice/chip";
import { GenesisChip } from "@/components/lattice/genesis-chip";
import { MethodChip } from "@/components/lattice/method-chip";
import { isGenesisTx } from "@/lib/genesis";
import { Skeleton } from "@/components/ui/skeleton";
import { PauseButton } from "@/components/lattice/pause-button";
import { ErrorBanner } from "@/components/page/error-banner";
import { FilterBar, FilterInput, FilterPillGroup } from "@/components/lattice/filter-bar";
import {
  SortableTh,
  applyDir,
  compareBig,
  compareDate,
  type SortState,
} from "@/components/lattice/sortable-th";
import { useFreshHashes, useNowTick } from "@/lib/use-fresh";
import { formatNativeAmount, formatNumber, formatRelativeTime } from "@/lib/format";

type SortKey = "status" | "value" | "block";
type StatusFilter = "all" | "success" | "failed";

const STATUS_OPTIONS = [
  { value: "all" as const, label: "All" },
  { value: "success" as const, label: "Success" },
  { value: "failed" as const, label: "Failed" },
];

export default function TransactionsPage() {
  const router = useRouter();
  const [address, setAddress] = useState("");
  const [method, setMethod] = useState("");
  const [status, setStatus] = useState<StatusFilter>("all");
  const [sort, setSort] = useState<SortState<SortKey> | null>(null);

  const addressParam = address.trim().toLowerCase() || undefined;
  const methodParam = method.trim().toLowerCase() || undefined;
  const statusParam: "success" | "failed" | undefined =
    status === "success" ? "success" : status === "failed" ? "failed" : undefined;

  const {
    data: page,
    isPending,
    error,
  } = useTransactions({
    limit: 50,
    address: addressParam,
    method: methodParam,
    status: statusParam,
  });
  const { data: chain } = useChain();
  const txs = page?.data;
  const freshTxs = useFreshHashes(txs);
  const symbol = chain?.nativeToken.symbol ?? "—";
  useNowTick(1000);

  const view = useMemo(() => {
    if (!txs) return txs;
    if (!sort) return txs;
    return [...txs].sort(
      applyDir((a, b) => {
        switch (sort.key) {
          case "status":
            return a.status.localeCompare(b.status);
          case "value":
            return compareBig(a.value, b.value);
          case "block": {
            const cmp = a.block.number - b.block.number;
            if (cmp !== 0) return cmp;
            return compareDate(a.block.timestamp, b.block.timestamp);
          }
        }
      }, sort.dir),
    );
  }, [txs, sort]);

  const filtersActive = address.trim().length > 0 || method.trim().length > 0 || status !== "all";

  function reset() {
    setAddress("");
    setMethod("");
    setStatus("all");
  }

  return (
    <div className="px-4 sm:px-6 lg:px-10 py-6 sm:py-8 pb-12">
      <div className="eyebrow mb-2.5">Transactions</div>
      <div className="flex items-baseline gap-3 mb-2">
        <span className="h-display" style={{ fontSize: 56 }}>
          Latest transactions
        </span>
        <PauseButton feed="transactions" />
      </div>
      <div className="mb-7" style={{ fontSize: 14, color: "var(--ink-3)" }}>
        Live updates whenever a new transaction lands on chain.
      </div>

      <FilterBar
        active={filtersActive}
        onReset={reset}
        count={view ? `${formatNumber(view.length)} txn${view.length === 1 ? "" : "s"}` : null}
      >
        <FilterInput
          value={address}
          onChange={setAddress}
          placeholder="Address 0x… (from or to)"
          ariaLabel="Filter by address"
          width={300}
        />
        <FilterInput
          value={method}
          onChange={setMethod}
          placeholder="Method 0x12345678"
          ariaLabel="Filter by 4-byte selector"
          width={180}
        />
        <FilterPillGroup<StatusFilter>
          value={status}
          options={STATUS_OPTIONS}
          onChange={setStatus}
        />
      </FilterBar>

      {error ? <ErrorBanner title="Couldn't load transactions" message={error.message} /> : null}

      <div className="card border border-line rounded-[10px] bg-bg-elev overflow-x-auto">
        <table className="lat-tbl">
          <thead>
            <tr>
              <SortableTh<SortKey> k="status" active={sort} onSort={setSort} width={72}>
                Status
              </SortableTh>
              <th>Hash</th>
              <th className="hidden md:table-cell" style={{ width: 110 }}>
                Method
              </th>
              <th className="hidden md:table-cell" style={{ width: 160 }}>
                From
              </th>
              <th className="hidden md:table-cell" style={{ width: 160 }}>
                To
              </th>
              <SortableTh<SortKey>
                k="value"
                active={sort}
                onSort={setSort}
                align="right"
                width={140}
              >
                Value
              </SortableTh>
              <SortableTh<SortKey>
                k="block"
                active={sort}
                onSort={setSort}
                align="right"
                width={130}
              >
                Block · Age
              </SortableTh>
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
            ) : view?.length ? (
              view.map((t) => (
                <tr
                  key={t.hash}
                  className={freshTxs.has(t.hash) ? "fresh-row" : undefined}
                  onClick={() => router.push(`/transactions/${t.hash}`)}
                  style={{ cursor: "pointer" }}
                  role="link"
                  aria-label={`Transaction ${t.hash}`}
                >
                  <td>
                    <Chip tone={t.status === "success" ? "good" : "bad"}>
                      {t.status === "success" ? "✓ ok" : t.status}
                    </Chip>
                  </td>
                  <td>
                    <Hash value={t.hash} tone="link" length={12} href={`/transactions/${t.hash}`} />
                  </td>
                  <td className="hidden md:table-cell">
                    <MethodChip selector={t.method.selector} to={t.to} firnName={t.method.name} />
                  </td>
                  <td className="hidden md:table-cell">
                    {isGenesisTx(t) ? (
                      <GenesisChip />
                    ) : (
                      <Hash value={t.from} tone="from" length={6} href={`/address/${t.from}`} />
                    )}
                  </td>
                  <td className="hidden md:table-cell">
                    {t.to ? (
                      <Hash value={t.to} tone="to" length={6} href={`/address/${t.to}`} />
                    ) : t.contractAddress ? (
                      <span
                        style={{
                          display: "inline-flex",
                          alignItems: "center",
                          gap: 6,
                        }}
                        onClick={(e) => e.stopPropagation()}
                      >
                        <Hash
                          value={t.contractAddress}
                          tone="to"
                          length={6}
                          href={`/address/${t.contractAddress}`}
                        />
                        <span className="mono" style={{ fontSize: 10.5, color: "var(--ink-4)" }}>
                          deployed
                        </span>
                      </span>
                    ) : (
                      <Link
                        href={`/transactions/${t.hash}`}
                        onClick={(e) => e.stopPropagation()}
                        style={{ textDecoration: "none" }}
                      >
                        <Chip tone="steel">Contract creation</Chip>
                      </Link>
                    )}
                  </td>
                  <td className="mono" style={{ textAlign: "right", color: "var(--ink)" }}>
                    {formatNativeAmount(t.value, symbol)}
                  </td>
                  <td className="mono" style={{ textAlign: "right" }}>
                    <div style={{ color: "var(--ink-2)", fontSize: 12 }}>
                      #{formatNumber(t.block.number)}
                    </div>
                    <div style={{ color: "var(--ink-4)", fontSize: 11 }}>
                      {formatRelativeTime(t.block.timestamp)}
                    </div>
                  </td>
                </tr>
              ))
            ) : (
              <tr>
                <td colSpan={7} className="text-center py-10" style={{ color: "var(--ink-4)" }}>
                  {filtersActive ? "No transactions match these filters." : "No transactions yet."}
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
