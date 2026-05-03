"use client";

import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { useTransactions, useStats, useChain } from "@/lib/api/queries";
import { Hash } from "@/components/lattice/hash";
import { Chip } from "@/components/lattice/chip";
import { GenesisChip } from "@/components/lattice/genesis-chip";
import { MethodChip } from "@/components/lattice/method-chip";
import { isGenesisTx } from "@/lib/genesis";
import { Skeleton } from "@/components/ui/skeleton";
import { PauseButton } from "@/components/lattice/pause-button";
import { ErrorBanner } from "@/components/page/error-banner";
import { FilterBar, FilterInput, FilterPillGroup } from "@/components/lattice/filter-bar";
import { KpiCell } from "@/components/page/kpi-cell";
import { AnimatedNumber } from "@/components/lattice/animated-number";
import {
  SortableTh,
  applyDir,
  compareBig,
  compareDate,
  compareNumeric,
  type SortState,
} from "@/components/lattice/sortable-th";
import { useFreshHashes, useNowTick } from "@/lib/use-fresh";
import {
  formatGwei,
  formatNativeAmount,
  formatNumber,
  formatRelativeTime,
  formatTxFee,
} from "@/lib/format";

type SortKey = "status" | "value" | "fee" | "block";
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
  const { data: stats } = useStats();
  const txs = page?.data;
  const freshTxs = useFreshHashes(txs);
  const symbol = chain?.nativeToken.symbol ?? "—";
  // 10Hz so the "Xms ago" labels animate smoothly under sub-second arrival.
  useNowTick(100);

  // 24h-derived TPS — gives a stable headline that matches what users see
  // across page reloads. The instantaneous TPS lives on the home chart.
  const tps24h = useMemo(() => {
    const n = Number(stats?.transactionsLast24h);
    if (!Number.isFinite(n) || n <= 0) return null;
    return n / 86400;
  }, [stats?.transactionsLast24h]);

  // Page-scoped success rate. Cheap to compute (page is bounded to 50)
  // and gives the user a sense of the current chain's health without
  // waiting on a backend aggregate.
  const successRate = useMemo(() => {
    if (!txs?.length) return null;
    const ok = txs.filter((t) => t.status === "success").length;
    return (ok / txs.length) * 100;
  }, [txs]);

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
          case "fee": {
            // gas.used * gas.price — both unbounded; use BigInt math.
            const af = BigInt(a.gas.price || "0") * BigInt(a.gas.used || 0);
            const bf = BigInt(b.gas.price || "0") * BigInt(b.gas.used || 0);
            return af === bf ? 0 : af < bf ? -1 : 1;
          }
          case "block": {
            const cmp = compareNumeric(a.block.number, b.block.number);
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

      {/* KPI strip — matches the home page hero KPI row visually so the page
          feels like a focused continuation of the home transactions panel
          rather than a different surface. */}
      <div
        className="grid grid-cols-2 sm:grid-cols-4 mb-9"
        style={{ borderTop: "1px solid var(--line)" }}
      >
        <KpiCell
          first
          label="Total transactions"
          value={stats ? <AnimatedNumber value={stats.totalTransactions} /> : null}
          sub={stats ? `${formatNumber(stats.transactionsLast24h)} last 24h` : ""}
        />
        <KpiCell
          divider
          label="Average TPS (24h)"
          value={tps24h != null ? tps24h.toFixed(tps24h >= 100 ? 0 : 1) : null}
          sub="rolling 24h average"
        />
        <KpiCell
          divider
          label="Median gas price"
          value={stats ? formatGwei(stats.gasPrice.average) : null}
          sub={
            stats
              ? `slow ${formatGwei(stats.gasPrice.slow)} · fast ${formatGwei(stats.gasPrice.fast)}`
              : ""
          }
        />
        <KpiCell
          label="Success rate"
          value={successRate != null ? `${successRate.toFixed(1)}%` : null}
          sub={view ? `${formatNumber(view.length)} on this page` : ""}
        />
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
              {/* Column shape mirrors the home page live transactions table:
                  Status | Hash | Method | From | To | Nonce (lg+) | Fee (lg+) | Value | Block · Age.
                  Same widths so the visual grid lines up between the two
                  surfaces and the user's eye doesn't have to retrain. */}
              <SortableTh<SortKey> k="status" active={sort} onSort={setSort} width={64}>
                Status
              </SortableTh>
              <th style={{ width: 160 }}>Hash</th>
              <th className="hidden md:table-cell" style={{ width: 130 }}>
                Method
              </th>
              <th className="hidden md:table-cell" style={{ width: 130 }}>
                From
              </th>
              <th className="hidden md:table-cell" style={{ width: 130 }}>
                To
              </th>
              <th className="hidden lg:table-cell mono" style={{ width: 80 }}>
                Nonce
              </th>
              <SortableTh<SortKey>
                k="fee"
                active={sort}
                onSort={setSort}
                align="right"
                width={100}
                className="hidden lg:table-cell"
              >
                Fee
              </SortableTh>
              <SortableTh<SortKey>
                k="value"
                active={sort}
                onSort={setSort}
                align="right"
                width={130}
              >
                Value
              </SortableTh>
              <SortableTh<SortKey>
                k="block"
                active={sort}
                onSort={setSort}
                align="right"
                width={110}
              >
                Block · Age
              </SortableTh>
            </tr>
          </thead>
          <tbody>
            {isPending ? (
              Array.from({ length: 10 }).map((_, i) => (
                <tr key={i}>
                  <td colSpan={9}>
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
                    <Hash value={t.hash} tone="link" length={10} href={`/transactions/${t.hash}`} />
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
                  <td
                    className="hidden lg:table-cell mono"
                    style={{ color: "var(--ink-3)", fontVariantNumeric: "tabular-nums" }}
                  >
                    {t.nonce}
                  </td>
                  <td
                    className="hidden lg:table-cell mono"
                    style={{
                      textAlign: "right",
                      color: "var(--ink-4)",
                      fontVariantNumeric: "tabular-nums",
                    }}
                  >
                    {formatTxFee(t.gas.used, t.gas.price, symbol)}
                  </td>
                  <td
                    className="mono"
                    style={{
                      textAlign: "right",
                      color: "var(--ink)",
                      fontVariantNumeric: "tabular-nums",
                    }}
                  >
                    {formatNativeAmount(t.value, symbol)}
                  </td>
                  <td className="mono" style={{ textAlign: "right" }}>
                    {/* Two-line cell — block# above, age below — matching the
                        home page table exactly. tabular-nums + a fixed-width
                        inline-block prevents the 10Hz age tick from nudging
                        the column or its neighbours when the string crosses
                        unit boundaries (Xms → 1s → 1m). */}
                    <div
                      style={{
                        color: "var(--ink-2)",
                        fontSize: 12,
                        fontVariantNumeric: "tabular-nums",
                      }}
                    >
                      #{formatNumber(t.block.number)}
                    </div>
                    <div
                      style={{
                        color: "var(--ink-4)",
                        fontSize: 11,
                        fontVariantNumeric: "tabular-nums",
                      }}
                    >
                      <span
                        style={{
                          display: "inline-block",
                          minWidth: 64,
                          textAlign: "right",
                        }}
                      >
                        {formatRelativeTime(t.block.timestamp)}
                      </span>
                    </div>
                  </td>
                </tr>
              ))
            ) : (
              <tr>
                <td colSpan={9} className="text-center py-10" style={{ color: "var(--ink-4)" }}>
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
