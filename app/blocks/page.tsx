"use client";

import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { useBlocks, useStats, useChain } from "@/lib/api/queries";
import { useExplorerBootstrap } from "@/lib/api/explorer";
import { Sparkline } from "@/components/lattice/sparkline";
import { Donut, type DonutSlice } from "@/components/lattice/donut";
import { BarChart, type Bar } from "@/components/lattice/bar-chart";
import { AnimatedNumber } from "@/components/lattice/animated-number";
import { Hash } from "@/components/lattice/hash";
import { Skeleton } from "@/components/ui/skeleton";
import { PauseButton } from "@/components/lattice/pause-button";
import { FilterBar, FilterInput, FilterPillGroup } from "@/components/lattice/filter-bar";
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
  const { data: chain } = useChain();
  // Same chart series the home page consumes — server-smoothed, 50-block
  // rolling window. Pulling from the bootstrap query (already cached) so
  // mounting this page doesn't trigger a separate fetch.
  const { data: bootstrap } = useExplorerBootstrap();
  const gasSeries = bootstrap?.stats.gasUtilization.points;
  const symbol = chain?.nativeToken.symbol ?? "—";

  const blocks = page?.data;
  const freshBlocks = useFreshHashes(blocks);
  // 1s tick is enough to keep relative-time labels accurate; the prior
  // 100ms churn re-rendered the whole page (huge headline, 50-row
  // table, 3 charts, KPIs, live list) ten times a second. Combined
  // with concurrent CSS animations (fresh-row, AnimatedNumber tween),
  // that re-render rate disengaged the browser's scroll anchor and
  // caused the page to feel like it was drifting downward as new
  // blocks landed. The relative-time labels don't need finer than 1s
  // anyway — `formatRelativeTime` rounds to the nearest second.
  useNowTick(1000);

  // Page-scoped averages — only across the visible page so it's responsive
  // to any filter the user applied. Useful when scoping by validator: you
  // can see what gas pressure / block size looks like for that operator
  // specifically without re-pulling.
  const pageStats = useMemo(() => {
    if (!blocks?.length) return null;
    let gasPctSum = 0;
    let txCount = 0;
    let emptyCount = 0;
    let sizeSum = 0;
    for (const b of blocks) {
      gasPctSum += gasUsedPctNum(b.gas.used, b.gas.limit);
      txCount += b.transactionsCount;
      if (b.transactionsCount === 0) emptyCount++;
      sizeSum += b.size || 0;
    }
    return {
      avgGasPct: gasPctSum / blocks.length,
      avgTxns: txCount / blocks.length,
      emptyPct: (emptyCount / blocks.length) * 100,
      avgSize: sizeSum / blocks.length,
    };
  }, [blocks]);

  // Validator-distribution donut from the visible page sample. Honest
  // window labelling — we don't pretend it's all-time. With a single
  // validator in benchmark mode this collapses to one slice; on a real
  // network it surfaces who's actually proposing.
  const validatorSlices = useMemo<DonutSlice[]>(() => {
    if (!blocks?.length) return [];
    const counts = new Map<string, number>();
    for (const b of blocks) {
      const m = b.miner ?? "unknown";
      // Render as a short hash-like label so the legend stays narrow.
      const label = m === "unknown" ? "unknown" : `${m.slice(0, 6)}…${m.slice(-4)}`;
      counts.set(label, (counts.get(label) ?? 0) + 1);
    }
    return Array.from(counts, ([label, value]) => ({ label, value }));
  }, [blocks]);

  // Inter-block deltas (ms) computed from consecutive block timestamps,
  // walking blocks oldest → newest. Stats summary (p50/p95/p99) and
  // distribution histogram both derive from this. Tolerates malformed
  // timestamps by skipping the offending pair.
  const blockDeltas = useMemo<number[]>(() => {
    if (!blocks || blocks.length < 2) return [];
    const ordered = [...blocks].reverse();
    const out: number[] = [];
    for (let i = 1; i < ordered.length; i++) {
      const prev = Date.parse(ordered[i - 1].timestamp);
      const curr = Date.parse(ordered[i].timestamp);
      if (Number.isFinite(prev) && Number.isFinite(curr) && curr > prev) {
        out.push(curr - prev);
      }
    }
    return out;
  }, [blocks]);

  const blockTimeStats = useMemo(() => {
    if (blockDeltas.length === 0) return null;
    const sorted = [...blockDeltas].sort((a, b) => a - b);
    const at = (q: number) => sorted[Math.min(sorted.length - 1, Math.floor(q * sorted.length))];
    return {
      p50: at(0.5),
      p95: at(0.95),
      p99: at(0.99),
    };
  }, [blockDeltas]);

  // Block-time distribution histogram. Buckets chosen to read like
  // operator-eye perspective: most chains cluster around their target
  // block rate, so the middle bins are the interesting ones. <1.5s and
  // >6s are tail bins so a long-tail event (network blip, validator
  // pause) is visible without dominating the y-axis.
  const blockTimeBuckets = useMemo<Bar[]>(() => {
    if (blockDeltas.length === 0) return [];
    const bins = [
      { label: "<1.5s", lo: 0, hi: 1500 },
      { label: "1.5–2s", lo: 1500, hi: 2000 },
      { label: "2–2.5s", lo: 2000, hi: 2500 },
      { label: "2.5–3s", lo: 2500, hi: 3000 },
      { label: "3–4s", lo: 3000, hi: 4000 },
      { label: "4–6s", lo: 4000, hi: 6000 },
      { label: ">6s", lo: 6000, hi: Number.POSITIVE_INFINITY },
    ];
    const counts = bins.map(() => 0);
    for (const d of blockDeltas) {
      for (let i = 0; i < bins.length; i++) {
        if (d >= bins[i].lo && d < bins[i].hi) {
          counts[i]++;
          break;
        }
      }
    }
    return bins.map((b, i) => ({ label: b.label, value: counts[i] }));
  }, [blockDeltas]);

  // Distinct producer count from the visible page sample. On a real
  // network this proxies "active producer count over recent activity",
  // which is what operators want to see at a glance.
  const distinctProducers = useMemo(() => {
    if (!blocks?.length) return null;
    const seen = new Set<string>();
    for (const b of blocks) {
      if (b.miner) seen.add(b.miner);
    }
    return seen.size;
  }, [blocks]);

  // Estimated 24h block count derived from rolling avg block time. If
  // the chain settles at 2s blocks, that's ~43,200 blocks/day. This is
  // an estimate — real backend tracking would be exact.
  const blocks24hEstimate = useMemo(() => {
    const ms = stats?.averageBlockTimeMs;
    if (!ms || ms <= 0) return null;
    return Math.round(86400000 / ms);
  }, [stats?.averageBlockTimeMs]);

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

  const headBlock = blocks?.[0];

  return (
    <div className="px-4 sm:px-6 lg:px-10 py-6 sm:py-8 pb-12">
      <div className="eyebrow mb-2.5">Blocks{chain?.name ? ` · ${chain.name}` : ""}</div>

      {/* Hero — at-the-head block number is the headline; tells operators
          "this is what the chain is doing right now" rather than the
          stale all-time count. Producers active count is page-scoped
          since 24h tracking would need a backend aggregate. */}
      <div className="flex items-baseline flex-wrap gap-3 mb-2">
        {headBlock ? (
          <span className="h-display" style={{ fontSize: 64, lineHeight: 1 }}>
            #<AnimatedNumber value={headBlock.number} />
          </span>
        ) : (
          <Skeleton className="h-[64px] w-[320px]" />
        )}
        <span style={{ fontSize: 17, color: "var(--ink-3)" }}>
          at the head
          {distinctProducers != null
            ? ` · ${formatNumber(distinctProducers)} producer${distinctProducers === 1 ? "" : "s"} active`
            : ""}
        </span>
        <PauseButton feed="blocks" />
      </div>
      <div
        className="mono mb-9 flex flex-wrap items-baseline"
        style={{ fontSize: 12.5, color: "var(--ink-3)", gap: "6px 18px" }}
      >
        {stats?.averageBlockTimeMs ? (
          <span style={{ display: "inline-flex", alignItems: "center", gap: 6 }}>
            <span className="live-dot" />
            <span>
              Producing every{" "}
              <span style={{ color: "var(--good)" }}>
                {(stats.averageBlockTimeMs / 1000).toFixed(2)}s
              </span>
            </span>
          </span>
        ) : null}
        {blocks24hEstimate != null ? (
          <span>
            <span style={{ color: "var(--ink-2)" }}>{formatNumber(blocks24hEstimate)}</span> blocks
            / 24h <span style={{ color: "var(--ink-4)" }}>(est.)</span>
          </span>
        ) : null}
        {stats ? (
          <span style={{ color: "var(--ink-4)" }}>
            · {formatNumber(stats.totalBlocks)} all-time
          </span>
        ) : null}
      </div>

      {/* Top dashboard row: live-blocks list on the left, 2x2 KPI grid
          on the right. Mirrors the mockup composition. */}
      <div className="grid grid-cols-1 lg:grid-cols-[1.4fr_1fr] gap-6 mb-8">
        <LiveBlocksList
          blocks={blocks?.slice(0, 5)}
          freshHashes={freshBlocks}
          symbol={symbol}
          onClick={(num) => router.push(`/blocks/${num}`)}
        />
        <div className="grid grid-cols-2 gap-6">
          <MiniKpi
            label="Avg block time"
            value={
              stats?.averageBlockTimeMs ? `${(stats.averageBlockTimeMs / 1000).toFixed(2)}s` : null
            }
            sub={
              blockTimeStats ? (
                <span style={{ color: "var(--good)" }}>
                  p50 {(blockTimeStats.p50 / 1000).toFixed(2)}s · p95{" "}
                  {(blockTimeStats.p95 / 1000).toFixed(2)}s
                </span>
              ) : (
                ""
              )
            }
          />
          <MiniKpi
            label="Avg gas / block"
            value={pageStats ? `${pageStats.avgGasPct.toFixed(1)}%` : null}
            sub={
              headBlock ? `of ${(Number(headBlock.gas.limit) / 1_000_000).toFixed(0)}M target` : ""
            }
          />
          <MiniKpi
            label="Avg txs / block"
            value={pageStats ? formatNumber(Math.round(pageStats.avgTxns)) : null}
            sub={pageStats ? `${formatBlockSize(Math.round(pageStats.avgSize))} avg size` : ""}
          />
          <MiniKpi
            label="Empty %"
            value={pageStats ? `${pageStats.emptyPct.toFixed(1)}%` : null}
            sub={view ? `${formatNumber(view.length)} sampled` : ""}
          />
        </div>
      </div>

      {/* Middle row: gas % chart · block time distribution · producer
          share. Each carries honest sample-window labelling. */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6 mb-9">
        <div className="card border border-line rounded-[10px] bg-bg-elev" style={{ padding: 18 }}>
          <div className="flex items-baseline justify-between mb-3">
            <div className="eyebrow">Gas used %</div>
            <div className="mono" style={{ fontSize: 10.5, color: "var(--ink-4)" }}>
              last 50 blocks
            </div>
          </div>
          {gasSeries && gasSeries.length >= 2 ? (
            <div style={{ position: "relative" }}>
              <Sparkline
                fluid
                height={120}
                data={gasSeries}
                yMax={100}
                color={gasUtilTone(gasSeries[gasSeries.length - 1])}
              />
              {/* Target reference line at 50% — operator's eye reaches
                  for "is this chain healthy" first. Drawn as an HTML
                  overlay rather than inside the SVG so it doesn't
                  stretch with preserveAspectRatio=none. */}
              <div
                style={{
                  position: "absolute",
                  left: 0,
                  right: 0,
                  top: 60,
                  borderTop: "1px dashed var(--ink-5)",
                  pointerEvents: "none",
                }}
              />
              <div
                className="mono"
                style={{
                  position: "absolute",
                  right: 0,
                  top: 64,
                  fontSize: 10,
                  color: "var(--ink-4)",
                }}
              >
                target 50%
              </div>
            </div>
          ) : (
            <Skeleton className="h-[120px] w-full" />
          )}
          <div
            className="mono mt-1.5 flex items-baseline justify-between"
            style={{ fontSize: 10.5, color: "var(--ink-4)" }}
          >
            <span>50 blk ago</span>
            <span style={{ color: "var(--ink-3)" }}>
              now ·{" "}
              {gasSeries && gasSeries.length > 0
                ? `${Math.round(gasSeries[gasSeries.length - 1])}%`
                : "—"}
            </span>
          </div>
        </div>

        <div className="card border border-line rounded-[10px] bg-bg-elev" style={{ padding: 18 }}>
          <div className="eyebrow mb-3">Block time distribution</div>
          {blockTimeBuckets.length ? (
            <BarChart
              fluid
              bars={blockTimeBuckets}
              height={120}
              tone="var(--ink-4)"
              peakTone="var(--accent)"
            />
          ) : (
            <Skeleton className="h-[120px] w-full" />
          )}
          <div
            className="mono mt-2 flex items-baseline justify-between"
            style={{ fontSize: 10.5, color: "var(--ink-4)" }}
          >
            <span>{blockTimeBuckets[0]?.label ?? ""}</span>
            <span style={{ color: "var(--ink-3)" }}>
              {blockTimeStats
                ? `p50 ${(blockTimeStats.p50 / 1000).toFixed(2)}s · p95 ${(blockTimeStats.p95 / 1000).toFixed(2)}s`
                : "—"}
            </span>
            <span>{blockTimeBuckets[blockTimeBuckets.length - 1]?.label ?? ""}</span>
          </div>
        </div>

        <div className="card border border-line rounded-[10px] bg-bg-elev" style={{ padding: 18 }}>
          <div className="flex items-baseline justify-between mb-3">
            <div className="eyebrow">Producer share</div>
            <div className="mono" style={{ fontSize: 10.5, color: "var(--ink-4)" }}>
              last {blocks?.length ?? "—"}
            </div>
          </div>
          {validatorSlices.length ? (
            <Donut slices={validatorSlices} size={120} thickness={14} />
          ) : (
            <Skeleton className="h-[120px] w-full" />
          )}
        </div>
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

/**
 * Card that lists the last few blocks vertically with the latest one
 * highlighted. Replaces a chart in the dashboard hero row because for
 * blocks specifically, "what's happening right now" reads better as a
 * tape of the last 5 events than as an aggregate trend.
 *
 * The latest row gets a soft accent-soft background so the eye finds
 * it instantly; freshHashes (set by useFreshHashes) carries the
 * row-arrived flash on top of that.
 */
function LiveBlocksList({
  blocks,
  freshHashes,
  symbol,
  onClick,
}: {
  blocks:
    | Array<{
        number: number;
        hash: string;
        timestamp: string;
        miner?: string;
        transactionsCount: number;
        gas: { used: string; limit: string };
      }>
    | undefined;
  freshHashes: ReadonlySet<string>;
  symbol: string;
  onClick: (num: number) => void;
}) {
  void symbol; // reserved for a future per-row reward column
  return (
    <div
      className="card overflow-hidden border border-line rounded-[10px] bg-bg-elev"
      style={{ padding: 0 }}
    >
      <div
        className="flex items-center justify-between border-b border-line"
        style={{ padding: "14px 18px" }}
      >
        <div className="flex items-center gap-2">
          <span className="live-dot" />
          <span style={{ fontSize: 12, fontWeight: 500 }}>Live blocks</span>
        </div>
        <span className="mono" style={{ fontSize: 11, color: "var(--ink-4)" }}>
          auto-refreshing
        </span>
      </div>
      <div>
        {!blocks ? (
          Array.from({ length: 5 }).map((_, i) => (
            <div key={i} className="px-[18px] py-3.5">
              <Skeleton className="h-4 w-full" />
            </div>
          ))
        ) : blocks.length === 0 ? (
          <div className="text-center py-12" style={{ color: "var(--ink-4)", fontSize: 13 }}>
            Waiting for first block…
          </div>
        ) : (
          blocks.map((b, i) => {
            const pct = gasUsedPctNum(b.gas.used, b.gas.limit);
            const isHead = i === 0;
            return (
              <button
                key={b.hash}
                type="button"
                onClick={() => onClick(b.number)}
                className={`grid items-center w-full text-left ${freshHashes.has(b.hash) ? "fresh-row" : ""}`}
                style={{
                  // Individual border sides instead of the `border` shorthand —
                  // mixing shorthand and a non-shorthand `borderBottom` on the
                  // same element triggers a React shorthand-collision warning,
                  // and which one wins becomes order-dependent on re-render.
                  borderTop: "none",
                  borderRight: "none",
                  borderLeft: "none",
                  borderBottom: i < blocks.length - 1 ? "1px solid var(--line-soft)" : "none",
                  borderRadius: 0,
                  gridTemplateColumns: "120px 1fr 80px",
                  padding: "14px 18px",
                  background: isHead ? "var(--good-soft)" : "transparent",
                  color: isHead ? "var(--good)" : "inherit",
                  cursor: "pointer",
                }}
              >
                <div>
                  <div
                    className="mono"
                    style={{
                      fontSize: 13,
                      color: isHead ? "var(--good)" : "var(--ink)",
                      fontVariantNumeric: "tabular-nums",
                    }}
                  >
                    #{formatNumber(b.number)}
                  </div>
                  <div
                    className="mono"
                    style={{
                      fontSize: 11,
                      color: isHead ? "var(--good)" : "var(--ink-4)",
                      fontVariantNumeric: "tabular-nums",
                      opacity: 0.85,
                    }}
                  >
                    <span style={{ display: "inline-block", minWidth: 56 }}>
                      {formatRelativeTime(b.timestamp)}
                    </span>
                  </div>
                </div>
                <div>
                  <div
                    style={{
                      fontSize: 12.5,
                      color: isHead ? "var(--good)" : "var(--ink-2)",
                      fontVariantNumeric: "tabular-nums",
                    }}
                  >
                    {formatNumber(b.transactionsCount)}{" "}
                    <span style={{ color: isHead ? "var(--good)" : "var(--ink-4)" }}>txns</span>
                  </div>
                  <div
                    className="mono"
                    style={{
                      fontSize: 10.5,
                      color: isHead ? "var(--good)" : "var(--ink-4)",
                      opacity: 0.85,
                      overflow: "hidden",
                      textOverflow: "ellipsis",
                      whiteSpace: "nowrap",
                    }}
                    title={b.miner || ""}
                  >
                    {b.miner ? `by ${b.miner.slice(0, 6)}…${b.miner.slice(-4)}` : ""}
                  </div>
                </div>
                <div
                  className="mono"
                  style={{
                    fontSize: 12,
                    color: isHead ? "var(--good)" : "var(--ink-2)",
                    textAlign: "right",
                    fontVariantNumeric: "tabular-nums",
                  }}
                >
                  {gasUsedPct(b.gas.used, b.gas.limit)}
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
                        background: isHead ? "var(--good)" : gasUtilTone(pct),
                      }}
                    />
                  </div>
                </div>
              </button>
            );
          })
        )}
      </div>
    </div>
  );
}

/**
 * Compact KPI card for the right-hand 2x2 grid in the dashboard hero
 * row. Mirrors /transactions/page.tsx's MiniKpi — kept duplicated
 * rather than extracted because the two pages will likely diverge as
 * each grows page-specific affordances; pre-extracting now would
 * just be premature abstraction.
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
