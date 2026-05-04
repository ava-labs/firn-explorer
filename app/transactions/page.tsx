"use client";

import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import {
  useTransactions,
  useStats,
  useChain,
  useBlocks,
  useStatsMethods,
  type StatsBucket,
  type StatsWindow,
} from "@/lib/api/queries";
import { useExplorerBootstrap } from "@/lib/api/explorer";
import { Sparkline } from "@/components/lattice/sparkline";
import { Donut, type DonutSlice } from "@/components/lattice/donut";
import { BarChart, type Bar } from "@/components/lattice/bar-chart";
import { StackedArea } from "@/components/lattice/stacked-area";
import { Hash } from "@/components/lattice/hash";
import { Chip } from "@/components/lattice/chip";
import { GenesisChip } from "@/components/lattice/genesis-chip";
import { MethodChip } from "@/components/lattice/method-chip";
import { isGenesisTx } from "@/lib/genesis";
import { Skeleton } from "@/components/ui/skeleton";
import { PauseButton } from "@/components/lattice/pause-button";
import { ErrorBanner } from "@/components/page/error-banner";
import { FilterBar, FilterInput, FilterPillGroup } from "@/components/lattice/filter-bar";
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
  const [methodWindow, setMethodWindow] = useState<StatsWindow>("24h");

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
  // Same series the home page chart consumes — server-smoothed, 50-block
  // rolling window. Pulling from the bootstrap query (already cached
  // across the app) so this page mounting doesn't fan out a new fetch.
  const { data: bootstrap } = useExplorerBootstrap();
  const tpsSeries = bootstrap?.stats.tps.points;

  // Throughput-by-method aggregate, REAL data from firn's /v1/stats/methods.
  // Bucket choice scales with the window so 7d/30d give one point per day.
  const methodBucket: StatsBucket = methodWindow === "7d" || methodWindow === "30d" ? "1d" : "1h";
  const { data: methodSeries } = useStatsMethods(methodBucket, methodWindow);
  // Last 50 blocks for the per-hour gas-used bars. Sampling from the
  // most recent window — labelled honestly on the card as "last N
  // blocks" so it can't be misread as a 24h aggregate.
  const { data: blocksPage } = useBlocks({ limit: 50 });
  const blocksSample = blocksPage?.data;
  const txs = page?.data;
  const freshTxs = useFreshHashes(txs);
  const symbol = chain?.nativeToken.symbol ?? "—";
  // 10Hz so the "Xms ago" labels animate smoothly under sub-second arrival.
  useNowTick(100);

  // Page-scoped success rate. Cheap to compute (page is bounded to 50)
  // and gives the user a sense of the current chain's health without
  // waiting on a backend aggregate.
  const successRate = useMemo(() => {
    if (!txs?.length) return null;
    const ok = txs.filter((t) => t.status === "success").length;
    return (ok / txs.length) * 100;
  }, [txs]);

  // TPS series mean + peak — labelled on the hero so the headline reads
  // like the dashboard mockup ("444 tps avg · 612 peak"). The series is
  // already server-smoothed (rolling avg per block), so peak is the
  // smoothed max not a 1-block spike.
  const tpsAvg = useMemo(() => {
    if (!tpsSeries?.length) return null;
    return tpsSeries.reduce((a, b) => a + b, 0) / tpsSeries.length;
  }, [tpsSeries]);
  const tpsPeak = useMemo(() => {
    if (!tpsSeries?.length) return null;
    return Math.max(...tpsSeries);
  }, [tpsSeries]);

  // Page-scoped fee + gas-used aggregates. Sample size = whatever the
  // useTransactions limit gives us (50). Median over the visible page,
  // not 24h — labelled "last N txs" so it can't be misread.
  const feeAvg = useMemo(() => {
    if (!txs?.length) return null;
    let totalFee = BigInt(0);
    let totalGas = 0;
    for (const t of txs) {
      try {
        totalFee += BigInt(t.gas.price || "0") * BigInt(t.gas.used || 0);
        totalGas += t.gas.used || 0;
      } catch {
        /* skip malformed */
      }
    }
    if (totalGas === 0) return null;
    // Return as { fee: bigint, gasAvg: number } so the card can format
    // each side independently.
    return { fee: totalFee / BigInt(txs.length), gasAvg: Math.round(totalGas / txs.length) };
  }, [txs]);

  // Method-mix donut: bin by `method.name` (or `selector` when name is
  // unresolved). Native transfers (no selector) get their own bucket.
  const methodSlices = useMemo<DonutSlice[]>(() => {
    if (!txs?.length) return [];
    const counts = new Map<string, number>();
    for (const t of txs) {
      const sel = t.method.selector;
      const label = !sel || sel === "0x" ? "Native transfer" : (t.method.name ?? sel);
      counts.set(label, (counts.get(label) ?? 0) + 1);
    }
    return Array.from(counts, ([label, value]) => ({ label, value }));
  }, [txs]);

  // Recent fee trend: chronological (oldest first → newest last) so the
  // sparkline reads left-to-right like the throughput chart. Series is
  // numeric AVAX-equivalent so a linear range makes visual sense; values
  // are derived as gas.price * gas.used in wei, then normalized to gwei
  // (fees on benchmark are too small in native to chart linearly).
  const feeSeries = useMemo<number[] | undefined>(() => {
    if (!txs?.length) return undefined;
    const ONE_GWEI = BigInt(10) ** BigInt(9);
    return [...txs].reverse().map((t) => {
      try {
        const wei = BigInt(t.gas.price || "0") * BigInt(t.gas.used || 0);
        return Number((wei * BigInt(1000)) / ONE_GWEI) / 1000;
      } catch {
        return 0;
      }
    });
  }, [txs]);

  // Gas-used-per-bin bars derived from the recent blocks sample. Bin by
  // 5-block windows so 50 sampled blocks produce 10 bars — readable at
  // the card's width without crushing the bars to 1px each. Honest
  // label; not "by hour" since the 50-block window is much shorter.
  const gasBars = useMemo<Bar[]>(() => {
    if (!blocksSample?.length) return [];
    // blocks are returned newest-first; reverse for chronological bars.
    const ordered = [...blocksSample].reverse();
    const BIN = 5;
    const bins: Bar[] = [];
    for (let i = 0; i < ordered.length; i += BIN) {
      const slice = ordered.slice(i, i + BIN);
      let sum = 0;
      for (const b of slice) {
        sum += Number(b.gas.used || "0");
      }
      const startBlock = slice[0]?.number;
      bins.push({ label: startBlock != null ? `#${startBlock}` : `${i}`, value: sum });
    }
    return bins;
  }, [blocksSample]);

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

      {/* Hero — the headline number is the chain-wide 24h tx count. The
          sub-line carries supporting metrics from data we actually have:
          recent-window TPS avg + peak (from the server-smoothed 50-block
          series) and the page-scoped success rate. We do NOT show a
          "vs prev 24h" delta — that needs backend snapshot tracking firn
          doesn't expose today; faking it would be misleading. */}
      <div className="flex items-baseline flex-wrap gap-3 mb-2">
        {stats ? (
          <span className="h-display" style={{ fontSize: 64, lineHeight: 1 }}>
            <AnimatedNumber value={stats.transactionsLast24h} />
          </span>
        ) : (
          <Skeleton className="h-[64px] w-[280px]" />
        )}
        <span style={{ fontSize: 17, color: "var(--ink-3)" }}>
          transactions in the last 24 hours
        </span>
        <PauseButton feed="transactions" />
      </div>
      <div
        className="mono mb-9 flex flex-wrap items-baseline"
        style={{ fontSize: 12.5, color: "var(--ink-3)", gap: "6px 18px" }}
      >
        {tpsAvg != null ? (
          <span>
            <span style={{ color: "var(--ink-2)" }}>{tpsAvg.toFixed(tpsAvg >= 100 ? 0 : 1)}</span>{" "}
            tps avg
          </span>
        ) : null}
        {tpsPeak != null ? (
          <span>
            <span style={{ color: "var(--ink-2)" }}>{tpsPeak.toFixed(tpsPeak >= 100 ? 0 : 1)}</span>{" "}
            peak
          </span>
        ) : null}
        {successRate != null ? (
          <span>
            <span style={{ color: "var(--ink-2)" }}>{(100 - successRate).toFixed(2)}%</span> fail
            rate
          </span>
        ) : null}
        {stats ? (
          <span style={{ color: "var(--ink-4)" }}>
            · {formatNumber(stats.totalTransactions)} all-time
          </span>
        ) : null}
      </div>

      {/* Top dashboard row: main throughput-by-method stacked area on the
          left (~2/3), stack of small KPI cards on the right (~1/3, 2x2
          grid). Real data from firn's /v1/stats/methods aggregate; the
          time-range tabs swap window+bucket on the same query. */}
      <div className="grid grid-cols-1 lg:grid-cols-[2fr_1fr] gap-6 mb-8">
        <div className="card border border-line rounded-[10px] bg-bg-elev" style={{ padding: 18 }}>
          <div className="flex items-baseline justify-between mb-3">
            <div className="eyebrow">Throughput by method · {methodWindow.toUpperCase()}</div>
            <div className="flex items-center gap-3 mono" style={{ fontSize: 11.5 }}>
              {(["1h", "6h", "24h", "7d", "30d"] as const).map((w) => (
                <button
                  key={w}
                  type="button"
                  onClick={() => setMethodWindow(w)}
                  style={{
                    padding: "2px 6px",
                    border: "none",
                    background: "transparent",
                    color: w === methodWindow ? "var(--ink)" : "var(--ink-4)",
                    fontWeight: w === methodWindow ? 600 : 400,
                    cursor: "pointer",
                    borderRadius: 4,
                  }}
                >
                  {w}
                </button>
              ))}
            </div>
          </div>
          {methodSeries && methodSeries.length > 0 ? (
            <StackedArea data={methodSeries} height={220} />
          ) : (
            <Skeleton className="h-[220px] w-full" />
          )}
        </div>
        <div className="grid grid-cols-2 gap-6">
          <MiniKpi
            label="Median gas price"
            value={stats ? formatGwei(stats.gasPrice.average) : null}
            sub={stats ? `slow ${formatGwei(stats.gasPrice.slow)}` : ""}
          />
          <MiniKpi
            label="Avg gas / tx"
            value={feeAvg ? formatNumber(feeAvg.gasAvg) : null}
            sub={txs ? `last ${txs.length} txs` : ""}
          />
          <MiniKpi
            label="Avg fee / tx"
            value={feeAvg ? formatTxFee(feeAvg.gasAvg, feeAvg.fee.toString(), symbol) : null}
            sub={txs ? `last ${txs.length} txs` : ""}
          />
          <MiniKpi
            label="Success rate"
            value={successRate != null ? `${successRate.toFixed(1)}%` : null}
            sub={txs ? `last ${txs.length} txs` : ""}
          />
        </div>
      </div>

      {/* Bottom dashboard row: gas bars · method mix donut · fee trend
          line. Three equal cards stacked on small screens. Each card
          is honest about its window — none of these are 24h aggregates,
          they're recent-window samples. */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6 mb-9">
        <div className="card border border-line rounded-[10px] bg-bg-elev" style={{ padding: 18 }}>
          <div className="eyebrow mb-3">Gas used · last 50 blocks</div>
          {gasBars.length ? (
            <BarChart
              fluid
              bars={gasBars}
              height={88}
              tone="var(--ink-4)"
              peakTone="var(--ink-2)"
              leftLabel={gasBars[0]?.label}
              rightLabel={gasBars[gasBars.length - 1]?.label}
            />
          ) : (
            <Skeleton className="h-[88px] w-full" />
          )}
        </div>

        <div className="card border border-line rounded-[10px] bg-bg-elev" style={{ padding: 18 }}>
          <div className="eyebrow mb-3">Method mix · last {txs?.length ?? "—"} txs</div>
          {methodSlices.length ? (
            <Donut slices={methodSlices} size={120} thickness={14} />
          ) : (
            <Skeleton className="h-[120px] w-full" />
          )}
        </div>

        <div className="card border border-line rounded-[10px] bg-bg-elev" style={{ padding: 18 }}>
          <div className="eyebrow mb-3">Fee trend · last {feeSeries?.length ?? "—"} txs</div>
          <ChartCardInline series={feeSeries} unit="gwei" />
        </div>
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

/**
 * Compact KPI card for the right-hand 2x2 grid in the dashboard hero
 * row. Smaller value typography than KpiCell so the four cards fit
 * comfortably alongside the main throughput chart on lg screens.
 */
function MiniKpi({
  label,
  value,
  sub,
}: {
  label: string;
  value: React.ReactNode;
  sub?: React.ReactNode;
}) {
  return (
    <div
      className="card border border-line rounded-[10px] bg-bg-elev"
      style={{ padding: "14px 16px" }}
    >
      <div className="eyebrow mb-2">{label}</div>
      <div className="h-display" style={{ fontSize: 24, lineHeight: 1.1 }}>
        {value ?? <Skeleton className="h-7 w-20" />}
      </div>
      {sub != null ? (
        <div className="mono mt-1.5" style={{ fontSize: 11, color: "var(--ink-4)" }}>
          {sub}
        </div>
      ) : null}
    </div>
  );
}

/**
 * Sparkline + "now" tag, frameless. Used in the bottom dashboard row
 * where each card already has its own eyebrow header and we want a
 * slimmer chart body than ChartCard provides.
 */
function ChartCardInline({ series, unit }: { series: number[] | undefined; unit: string }) {
  const ready = series && series.length >= 2;
  const last = ready ? series[series.length - 1] : null;
  return (
    <>
      {ready ? (
        <Sparkline fluid height={88} data={series} color="var(--good)" />
      ) : (
        <Skeleton className="h-[88px] w-full" />
      )}
      <div
        className="mono mt-1.5"
        style={{ fontSize: 11, color: "var(--ink-4)", textAlign: "right" }}
      >
        Now ·{" "}
        <span style={{ color: "var(--ink-2)" }}>
          {last == null
            ? "—"
            : last >= 100
              ? `${Math.round(last)} ${unit}`
              : `${last.toFixed(2)} ${unit}`}
        </span>
      </div>
    </>
  );
}
