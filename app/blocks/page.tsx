"use client";

import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { useBlocks, useStats } from "@/lib/api/queries";
import { useExplorerBootstrap } from "@/lib/api/explorer";
import { ChartCard } from "@/components/page/chart-card";
import { Hash } from "@/components/lattice/hash";
import { Skeleton } from "@/components/ui/skeleton";
import { PauseButton } from "@/components/lattice/pause-button";
import { FilterBar, FilterInput, FilterPillGroup } from "@/components/lattice/filter-bar";
import { KpiCell } from "@/components/page/kpi-cell";
import { AnimatedNumber } from "@/components/lattice/animated-number";
import { ErrorBanner } from "@/components/page/error-banner";
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
  formatBlockSize,
  formatNumber,
  formatRelativeTime,
  gasUsedPct,
  gasUsedPctNum,
  gasUtilTone,
} from "@/lib/format";

type SortKey = "number" | "txns" | "gas" | "gasPct" | "size" | "validator" | "age";
type EmptyFilter = "any" | "withTxns" | "empty";

const EMPTY_OPTIONS = [
  { value: "any" as const, label: "All" },
  { value: "withTxns" as const, label: "Has txns" },
  { value: "empty" as const, label: "Empty" },
];

export default function BlocksPage() {
  const router = useRouter();
  const [validator, setValidator] = useState("");
  const [from, setFrom] = useState("");
  const [to, setTo] = useState("");
  const [emptyFilter, setEmptyFilter] = useState<EmptyFilter>("any");
  const [sort, setSort] = useState<SortState<SortKey> | null>(null);

  const minerParam = validator.trim().toLowerCase();
  const fromN = parseUintMaybe(from);
  const toN = parseUintMaybe(to);

  const {
    data: page,
    isPending,
    error,
  } = useBlocks({
    limit: 50,
    miner: minerParam.length > 0 ? minerParam : undefined,
    from: fromN,
    to: toN,
  });
  const { data: stats } = useStats();
  // Same chart series the home page consumes — server-smoothed, 50-block
  // rolling window. Pulling from the bootstrap query (already cached) so
  // mounting this page doesn't trigger a separate fetch.
  const { data: bootstrap } = useExplorerBootstrap();
  const tpsSeries = bootstrap?.stats.tps.points;
  const gasSeries = bootstrap?.stats.gasUtilization.points;

  const blocks = page?.data;
  const freshBlocks = useFreshHashes(blocks);
  // 10Hz so age labels animate smoothly through Xms → s → m boundaries.
  useNowTick(100);

  // Live BPS derived from the rolling block-time average. One scalar so
  // the user can compare against the stale "average block time" KPI on
  // the same row.
  const bps = useMemo(() => {
    const ms = stats?.averageBlockTimeMs;
    if (!ms || ms <= 0) return null;
    return 1000 / ms;
  }, [stats?.averageBlockTimeMs]);

  // Page-scoped averages — only across the visible page so it's responsive
  // to any filter the user applied. Useful when scoping by validator: you
  // can see what gas pressure / block size looks like for that operator
  // specifically without re-pulling.
  const pageStats = useMemo(() => {
    if (!blocks?.length) return null;
    let gasPctSum = 0;
    let txCount = 0;
    let emptyCount = 0;
    for (const b of blocks) {
      gasPctSum += gasUsedPctNum(b.gas.used, b.gas.limit);
      txCount += b.transactionsCount;
      if (b.transactionsCount === 0) emptyCount++;
    }
    return {
      avgGasPct: gasPctSum / blocks.length,
      avgTxns: txCount / blocks.length,
      emptyPct: (emptyCount / blocks.length) * 100,
    };
  }, [blocks]);

  const view = useMemo(() => {
    if (!blocks) return blocks;
    let out = blocks;
    if (emptyFilter !== "any") {
      out = out.filter((b) =>
        emptyFilter === "withTxns" ? b.transactionsCount > 0 : b.transactionsCount === 0,
      );
    }
    if (sort) {
      out = [...out].sort(
        applyDir((a, b) => {
          switch (sort.key) {
            case "number":
              return compareNumeric(a.number, b.number);
            case "txns":
              return compareNumeric(a.transactionsCount, b.transactionsCount);
            case "gas":
              return compareBig(a.gas.used, b.gas.used);
            case "gasPct":
              return (
                gasUsedPctNum(a.gas.used, a.gas.limit) - gasUsedPctNum(b.gas.used, b.gas.limit)
              );
            case "size":
              return compareNumeric(a.size, b.size);
            case "validator":
              return (a.miner ?? "").localeCompare(b.miner ?? "");
            case "age":
              return compareDate(a.timestamp, b.timestamp);
          }
        }, sort.dir),
      );
    }
    return out;
  }, [blocks, emptyFilter, sort]);

  const filtersActive =
    validator.trim().length > 0 ||
    from.trim().length > 0 ||
    to.trim().length > 0 ||
    emptyFilter !== "any";

  function reset() {
    setValidator("");
    setFrom("");
    setTo("");
    setEmptyFilter("any");
  }

  return (
    <div className="px-4 sm:px-6 lg:px-10 py-6 sm:py-8 pb-12">
      <div className="eyebrow mb-2.5">Blocks</div>
      <div className="flex items-baseline gap-3 mb-2">
        <span className="h-display" style={{ fontSize: 56 }}>
          Latest blocks
        </span>
        <PauseButton feed="blocks" />
      </div>
      <div className="mb-7" style={{ fontSize: 14, color: "var(--ink-3)" }}>
        Live block stream from the indexer — filter the visible page or pause the stream while you
        read.
      </div>

      {/* KPI strip — chain-wide on the left, page-scoped on the right.
          The page-scoped cells respect the active filters so a validator
          filter immediately reveals that operator's block-shape. */}
      <div
        className="grid grid-cols-2 sm:grid-cols-4 mb-9"
        style={{ borderTop: "1px solid var(--line)" }}
      >
        <KpiCell
          first
          label="Total blocks"
          value={stats ? <AnimatedNumber value={stats.totalBlocks} /> : null}
          sub={
            stats?.averageBlockTimeMs
              ? `${(stats.averageBlockTimeMs / 1000).toFixed(2)}s avg block time`
              : ""
          }
        />
        <KpiCell
          divider
          label="Live BPS"
          value={bps != null ? bps.toFixed(2) : null}
          sub="blocks per second"
        />
        <KpiCell
          divider
          label="Avg gas % (page)"
          value={pageStats ? `${pageStats.avgGasPct.toFixed(1)}%` : null}
          sub={pageStats ? `${pageStats.avgTxns.toFixed(1)} txns/block` : ""}
        />
        <KpiCell
          label="Empty % (page)"
          value={pageStats ? `${pageStats.emptyPct.toFixed(1)}%` : null}
          sub={view ? `${formatNumber(view.length)} on this page` : ""}
        />
      </div>

      {/* Chart strip — same primitive (Sparkline) and styling as the home
          page so the visual language is consistent across surfaces. On
          the blocks index, gas utilization is the headline (block-shape
          signal); throughput rides alongside so the user can tell whether
          a saturation spike is "many small txs" or "one fat tx". */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 lg:gap-8 mb-8">
        <ChartCard
          title="Block gas utilization"
          unit="%"
          series={gasSeries}
          yMax={100}
          color={
            gasSeries && gasSeries.length > 0
              ? gasUtilTone(gasSeries[gasSeries.length - 1])
              : "var(--accent)"
          }
        />
        <ChartCard title="Throughput" unit="tx/s" series={tpsSeries} color="var(--accent)" />
      </div>

      <FilterBar
        active={filtersActive}
        onReset={reset}
        count={view ? `${formatNumber(view.length)} block${view.length === 1 ? "" : "s"}` : null}
      >
        <FilterInput
          value={validator}
          onChange={setValidator}
          placeholder="Validator 0x…"
          ariaLabel="Filter by validator address"
          width={260}
        />
        <FilterInput
          value={from}
          onChange={setFrom}
          placeholder="From #"
          ariaLabel="From block number"
          width={120}
          type="number"
        />
        <FilterInput
          value={to}
          onChange={setTo}
          placeholder="To #"
          ariaLabel="To block number"
          width={120}
          type="number"
        />
        <FilterPillGroup<EmptyFilter>
          value={emptyFilter}
          options={EMPTY_OPTIONS}
          onChange={setEmptyFilter}
        />
      </FilterBar>

      {error ? <ErrorBanner title="Couldn't load blocks" message={error.message} /> : null}

      <div className="card border border-line rounded-[10px] bg-bg-elev overflow-x-auto">
        <table className="lat-tbl">
          <thead>
            <tr>
              <SortableTh<SortKey> k="number" active={sort} onSort={setSort} width={120}>
                Number
              </SortableTh>
              <th>Hash</th>
              <SortableTh<SortKey> k="txns" active={sort} onSort={setSort} align="right" width={70}>
                Txns
              </SortableTh>
              <SortableTh<SortKey>
                k="gasPct"
                active={sort}
                onSort={setSort}
                align="right"
                width={130}
              >
                Gas %
              </SortableTh>
              <SortableTh<SortKey>
                k="gas"
                active={sort}
                onSort={setSort}
                align="right"
                width={130}
                className="hidden lg:table-cell"
              >
                Gas used
              </SortableTh>
              <SortableTh<SortKey>
                k="size"
                active={sort}
                onSort={setSort}
                align="right"
                width={90}
                className="hidden md:table-cell"
              >
                Size
              </SortableTh>
              <SortableTh<SortKey>
                k="validator"
                active={sort}
                onSort={setSort}
                className="hidden md:table-cell"
              >
                Validator
              </SortableTh>
              <SortableTh<SortKey> k="age" active={sort} onSort={setSort} align="right" width={100}>
                Age
              </SortableTh>
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
            ) : view?.length ? (
              view.map((b) => {
                const pct = gasUsedPctNum(b.gas.used, b.gas.limit);
                const tone = gasUtilTone(pct);
                return (
                  <tr
                    key={b.hash}
                    className={freshBlocks.has(b.hash) ? "fresh-row" : undefined}
                    onClick={() => router.push(`/blocks/${b.number}`)}
                    style={{ cursor: "pointer" }}
                    role="link"
                    aria-label={`Block ${b.number}`}
                  >
                    <td
                      className="mono"
                      style={{ color: "var(--ink)", fontVariantNumeric: "tabular-nums" }}
                    >
                      #{formatNumber(b.number)}
                    </td>
                    <td>
                      <Hash value={b.hash} tone="link" length={14} href={`/blocks/${b.number}`} />
                    </td>
                    <td
                      className="mono"
                      style={{
                        textAlign: "right",
                        color: b.transactionsCount === 0 ? "var(--ink-4)" : "var(--ink-2)",
                        fontVariantNumeric: "tabular-nums",
                      }}
                    >
                      {b.transactionsCount}
                    </td>
                    {/* Gas % cell carries both the percentage and an inline
                        utilization bar — same tone palette as the home page
                        live blocks so the visual language is consistent. */}
                    <td style={{ paddingTop: 8, paddingBottom: 8 }}>
                      <div
                        className="mono"
                        style={{
                          fontSize: 12,
                          color: tone,
                          textAlign: "right",
                          fontVariantNumeric: "tabular-nums",
                        }}
                      >
                        {gasUsedPct(b.gas.used, b.gas.limit)}
                      </div>
                      <div
                        style={{
                          height: 3,
                          marginTop: 4,
                          borderRadius: 99,
                          background: "var(--bg-sunken)",
                          overflow: "hidden",
                        }}
                      >
                        <div
                          style={{
                            width: `${Math.min(100, pct)}%`,
                            height: "100%",
                            background: tone,
                          }}
                        />
                      </div>
                    </td>
                    <td
                      className="mono hidden lg:table-cell"
                      style={{
                        textAlign: "right",
                        color: "var(--ink-3)",
                        fontVariantNumeric: "tabular-nums",
                      }}
                    >
                      {formatNumber(b.gas.used)}
                    </td>
                    <td
                      className="mono hidden md:table-cell"
                      style={{
                        textAlign: "right",
                        color: "var(--ink-3)",
                        fontVariantNumeric: "tabular-nums",
                      }}
                    >
                      {formatBlockSize(b.size)}
                    </td>
                    <td className="hidden md:table-cell">
                      {b.miner ? (
                        <Hash value={b.miner} tone="dim" length={6} href={`/address/${b.miner}`} />
                      ) : (
                        <span style={{ color: "var(--ink-4)" }}>—</span>
                      )}
                    </td>
                    <td
                      className="mono"
                      style={{
                        textAlign: "right",
                        color: "var(--ink-4)",
                        fontVariantNumeric: "tabular-nums",
                      }}
                    >
                      <span style={{ display: "inline-block", minWidth: 64, textAlign: "right" }}>
                        {formatRelativeTime(b.timestamp)}
                      </span>
                    </td>
                  </tr>
                );
              })
            ) : (
              <tr>
                <td colSpan={8} className="text-center py-10" style={{ color: "var(--ink-4)" }}>
                  {filtersActive ? "No blocks match these filters." : "No blocks yet."}
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}

function parseUintMaybe(s: string): number | undefined {
  const t = s.trim();
  if (!t) return undefined;
  const n = Number(t);
  if (!Number.isFinite(n) || n < 0 || !Number.isInteger(n)) return undefined;
  return n;
}
