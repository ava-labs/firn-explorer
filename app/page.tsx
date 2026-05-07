"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Hash } from "@/components/lattice/hash";
import { Chip } from "@/components/lattice/chip";
import { GenesisChip } from "@/components/lattice/genesis-chip";
import { MethodChip } from "@/components/lattice/method-chip";
import { isGenesisTx } from "@/lib/genesis";
import { AnimatedNumber } from "@/components/lattice/animated-number";
import { Sparkline } from "@/components/lattice/sparkline";
import { Skeleton } from "@/components/ui/skeleton";
import { KpiCell } from "@/components/page/kpi-cell";
import { useFreshHashes, useFreshKeys, useNowTick } from "@/lib/use-fresh";
import { useExplorerBootstrap } from "@/lib/api/explorer";
import { useLivePause, type LiveFeed } from "@/lib/api/live-pause";
import {
  isBootstrappingError,
  useL1Uptime,
  useTokens,
  useValidators,
  type ICMMessage,
  type L1UptimeEntry,
  type Validator,
} from "@/lib/api/queries";
import {
  formatBlockSize,
  formatNativeAmount,
  formatNumber,
  formatRelativeTime,
  formatTxFee,
  gasUsedPct,
  gasUsedPctNum,
  gasUtilTone,
  truncateHash,
} from "@/lib/format";

// On hyperscale L1s the ticker churns fast; show fewer rows so the user
// can read individual entries instead of watching them blur past.
const HOME_LIVE_BLOCKS = 6;
const HOME_LIVE_TXS = 5;

// Grace period before un-pausing a list after the cursor leaves. Without
// this, micro-jitter (cursor briefly grazing the edge of a row that just
// got prepended) toggles pause off→on→off, defeating the click-stability
// the pause exists for. 300ms is short enough that intentional cursor
// exits feel snappy and long enough to absorb sub-frame jitter.
const HOVER_PAUSE_GRACE_MS = 300;

/**
 * Wire the live-pause infrastructure to mouse hover. Returns the props
 * to spread on a container — hovering pauses the named feed; leaving
 * resumes after a short grace window. Existing in-flight grace timers
 * are cancelled when the mouse re-enters mid-grace, so a hover stays
 * "stuck" for the entire visit.
 *
 * Why on the home page specifically: at sub-second block times the live
 * blocks panel and transactions table prepend rows faster than a click
 * can register. Pause-on-hover lets the user actually click a row while
 * the feed continues underneath; the next tick after they leave repaints
 * with whatever they missed.
 */
function useHoverPause(feed: LiveFeed) {
  const { setPaused } = useLivePause();
  const graceTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const onMouseEnter = () => {
    if (graceTimer.current) {
      clearTimeout(graceTimer.current);
      graceTimer.current = null;
    }
    setPaused(feed, true);
  };
  const onMouseLeave = () => {
    if (graceTimer.current) clearTimeout(graceTimer.current);
    graceTimer.current = setTimeout(() => {
      setPaused(feed, false);
      graceTimer.current = null;
    }, HOVER_PAUSE_GRACE_MS);
  };
  // Tab/keyboard users — focus also pauses, blur resumes after grace.
  // Important for accessibility and for cmd-clicking via keyboard nav.
  useEffect(() => {
    return () => {
      if (graceTimer.current) clearTimeout(graceTimer.current);
      setPaused(feed, false);
    };
  }, [feed, setPaused]);
  return { onMouseEnter, onMouseLeave, onFocus: onMouseEnter, onBlur: onMouseLeave };
}

export default function Home() {
  const router = useRouter();
  // Single bootstrap fetch + SSE feed bridge (mounted in providers.tsx)
  // replace the old fan-out of useChain/useStats/useBlocks/useTransactions/
  // useICMMessages. One round-trip cold paint, no skeleton flicker on
  // network swap, no client-side merge buffer fighting cross-network
  // pollution.
  const { data: bootstrap } = useExplorerBootstrap();
  const chain = bootstrap?.chain;
  const stats = bootstrap?.stats;
  const blocks = bootstrap?.blocks;
  const txs = bootstrap?.transactions;
  const icmMessages = bootstrap?.icmMessages;
  const tpsSeries = bootstrap?.stats.tps.points;
  const gasSeries = bootstrap?.stats.gasUtilization.points;

  const localChainId = chain?.blockchainId;
  const freshIcm = useFreshKeys(icmMessages, (m) => `${m.transactionHash}-${m.logIndex}`, 1600);
  const symbol = chain?.nativeToken.symbol ?? "—";

  // Token catalog for ICTT row formatting. One bulk request feeds every
  // row's symbol+decimals lookup so we can render "0.3 HERESY" instead
  // of bare scientific. Limit 50 = the top tokens by transfer count
  // (firn already orders that way), which covers every chain we ship
  // today; any contract not in the top 50 falls back to "ICTT" + the
  // recipient with no amount, which is honest and not misleading.
  const { data: tokenPage } = useTokens({ limit: 50 }, { enabled: !!icmMessages });
  const tokensByAddress = useMemo(() => {
    const m = new Map<string, { symbol?: string; name?: string; decimals: number }>();
    for (const t of tokenPage?.data ?? []) {
      if (!t.address) continue;
      m.set(t.address.toLowerCase(), {
        symbol: t.symbol,
        name: t.name,
        decimals: t.decimals ?? 0,
      });
    }
    return m;
  }, [tokenPage]);
  const blockTimeMs = stats?.averageBlockTimeMs ?? null;
  // Server-computed instantaneous TPS — last point of the series. No
  // client-side division, no per-render numerical jitter.
  const tps =
    tpsSeries && tpsSeries.length > 0 ? Math.round(tpsSeries[tpsSeries.length - 1]) : null;

  // Track which hashes "just arrived" so each row briefly flashes via the
  // CSS .fresh-row keyframe. Both lists use this — AnimatePresence with
  // popLayout mode stacked exiting items in absolute coordinates at high
  // block rates (visible overlap glitch on the live blocks panel), and
  // motion transforms on <tr> fight table column-width layout. The CSS
  // keyframe is just background-color + a tiny vertical settle, no
  // transforms involved, so it stays clean at any TPS.
  const freshBlocks = useFreshHashes(blocks);
  const freshTxs = useFreshHashes(txs);
  // Pause-on-hover: at sub-second block times rows shuffle faster than
  // a user can click. Hovering the panel freezes the visible rows while
  // the feed keeps running; leaving repaints from the latest tick.
  const blocksHover = useHoverPause("blocks");
  const txsHover = useHoverPause("transactions");
  const { paused } = useLivePause();
  // Re-render at 10Hz so the "Xms ago" labels animate smoothly for the first
  // second after a row appears, then settle into 1Hz-ish "Xs ago" updates.
  useNowTick(100);

  // Address-count delta vs the value seen 60s ago. We hold a small ring
  // of {at, count} entries and pick the oldest one that's still within
  // the window; if the window isn't fully filled yet, we fall back to
  // the earliest sample we have. Reset cleanly across logo reloads.
  const addrDelta = useAddressDelta(stats?.totalAddresses, 60_000);

  return (
    <div className="px-4 sm:px-6 lg:px-10 py-6 sm:py-8 pb-12">
      {/* Hero row: headline stat + live block ticker. Stacks on mobile so
          the giant block-count number gets the full width and the ticker
          falls below; switches to the original 1.4fr / 1fr split at lg. */}
      <div className="grid grid-cols-1 lg:grid-cols-[1.4fr_1fr] gap-8 lg:gap-12 items-start mb-10 lg:mb-14">
        <div>
          <div className="h-display" style={{ fontSize: 88 }}>
            {stats ? (
              <AnimatedNumber value={stats.totalBlocks} duration={0.7} />
            ) : (
              <Skeleton className="h-[88px] w-[360px]" />
            )}
          </div>
          <div className="flex items-baseline gap-3 mt-1.5 mb-9">
            <span style={{ fontSize: 16, color: "var(--ink-3)" }}>blocks produced</span>
            {tps != null ? (
              <Chip tone="good">
                <span
                  style={{ width: 5, height: 5, borderRadius: 99, background: "currentColor" }}
                />
                <AnimatedNumber value={tps} duration={0.4} /> tx/s
              </Chip>
            ) : null}
          </div>

          {/* KPI strip — 2-up on phones, 4-up at sm and above. */}
          <div
            className="grid grid-cols-2 sm:grid-cols-4"
            style={{
              borderTop: "1px solid var(--line)",
            }}
          >
            <KpiCell
              valueSize={28}
              first
              label="Transactions"
              value={stats ? <AnimatedNumber value={stats.totalTransactions} /> : null}
              sub={stats ? `${formatNumber(stats.transactionsLast24h)} last 24h` : ""}
            />
            <KpiCell
              valueSize={28}
              first
              label="Avg gas price"
              value={stats ? formatGwei(stats.gasPrice.average) : null}
              sub="median, 60s"
            />
            <KpiCell
              valueSize={28}
              first
              label="Addresses"
              value={stats ? <AnimatedNumber value={stats.totalAddresses} /> : null}
              sub={<AddressDeltaSub delta={addrDelta} />}
            />
            <KpiCell
              valueSize={28}
              first
              label="Block time"
              value={blockTimeMs ? `${(blockTimeMs / 1000).toFixed(2)}s` : null}
              sub="rolling avg"
            />
          </div>

          {/* Gas utilization sparkline — server-computed series of
              rolling-average gas % per block, oldest → newest. Honest
              saturation signal: survives ACP-226 dynamic block cadence
              and isn't gameable by spam (TPS is). The ceiling reads as
              "approaching block gas limit" rather than "spam workload
              looks like real workload". */}
          <div style={{ marginTop: 28 }}>
            {gasSeries && gasSeries.length >= 2 ? (
              <Sparkline
                fluid
                width={620}
                height={68}
                data={gasSeries}
                yMax={100}
                color={gasUtilTone(gasSeries[gasSeries.length - 1])}
              />
            ) : (
              <Skeleton className="h-[68px] w-full" />
            )}
            <div
              className="grid items-baseline mt-1.5"
              style={{ gridTemplateColumns: "1fr auto 1fr" }}
            >
              <span className="eyebrow" style={{ textAlign: "left" }}>
                {gasSeries?.length ? `Last ${gasSeries.length} blocks` : "—"}
              </span>
              <span className="eyebrow" style={{ textAlign: "center" }}>
                Block gas utilization
              </span>
              <span className="eyebrow" style={{ textAlign: "right", color: "var(--ink-3)" }}>
                Now ·{" "}
                {gasSeries && gasSeries.length > 0
                  ? `${Math.round(gasSeries[gasSeries.length - 1])}%`
                  : "—"}
              </span>
            </div>
          </div>
        </div>

        {/* Live ticker */}
        <div
          className="card overflow-hidden border border-line rounded-[10px] bg-bg-elev"
          {...blocksHover}
        >
          <div
            className="flex items-center justify-between border-b border-line"
            style={{ padding: "14px 18px" }}
          >
            <div className="flex items-center gap-2">
              <span className={paused.blocks ? undefined : "live-dot"} />
              <span style={{ fontSize: 12, fontWeight: 500 }}>
                {paused.blocks ? "Paused on hover" : "Live blocks"}
              </span>
            </div>
            <span className="mono" style={{ fontSize: 11, color: "var(--ink-4)" }}>
              {paused.blocks ? "click to inspect" : "live"}
            </span>
          </div>
          <div>
            {!blocks ? (
              Array.from({ length: HOME_LIVE_BLOCKS }).map((_, i) => (
                <div key={i} className="px-[18px] py-3.5">
                  <Skeleton className="h-4 w-full" />
                </div>
              ))
            ) : blocks.length === 0 ? (
              <div className="text-center py-12" style={{ color: "var(--ink-4)", fontSize: 13 }}>
                Waiting for first block…
              </div>
            ) : (
              // Plain links + the existing `fresh-row` CSS keyframe.
              // AnimatePresence with mode="popLayout" stacked exiting items
              // in absolute coordinates at high block rates, producing the
              // visible row-overlap glitch. The CSS keyframe is pure
              // background-color + a tiny vertical settle, never a
              // transform — clean even when 3 blocks land per merge-flush.
              blocks.slice(0, HOME_LIVE_BLOCKS).map((b, i, arr) => {
                const pct = gasUsedPctNum(b.gas.used, b.gas.limit);
                const tone = gasUtilTone(pct);
                return (
                  <Link
                    key={b.hash}
                    href={`/blocks/${b.number}`}
                    className={`grid items-center gap-3.5 ${freshBlocks.has(b.hash) ? "fresh-row" : ""}`}
                    style={{
                      // 3-column grid: block#/age | txs/size·miner | gas%/bar.
                      // Fixed column widths (rather than 1fr) keep the live
                      // ticker stable as the relative-time string ticks
                      // through "just now → 5s ago → 1m ago" — neighbours
                      // never reflow.
                      gridTemplateColumns: "108px 1fr 96px",
                      padding: "14px 18px",
                      borderBottom: i < arr.length - 1 ? "1px solid var(--line-soft)" : 0,
                      textDecoration: "none",
                      color: "inherit",
                    }}
                  >
                    <div>
                      <div
                        className="mono"
                        style={{
                          fontSize: 13,
                          color: "var(--ink)",
                          fontVariantNumeric: "tabular-nums",
                        }}
                      >
                        #{formatNumber(b.number)}
                      </div>
                      <div
                        className="mono"
                        style={{
                          fontSize: 11,
                          color: "var(--ink-4)",
                          fontVariantNumeric: "tabular-nums",
                        }}
                      >
                        {/* inline-block + minWidth keeps the time ticker
                            from nudging anything when the string length
                            crosses a unit boundary. */}
                        <span style={{ display: "inline-block", minWidth: 56 }}>
                          {formatRelativeTime(b.timestamp)}
                        </span>
                      </div>
                    </div>
                    <div>
                      <div
                        style={{
                          fontSize: 12.5,
                          color: "var(--ink-2)",
                          fontVariantNumeric: "tabular-nums",
                        }}
                      >
                        {formatNumber(b.transactionsCount)}{" "}
                        <span style={{ color: "var(--ink-4)" }}>txns</span>
                      </div>
                      <div
                        className="mono"
                        style={{
                          fontSize: 10.5,
                          color: "var(--ink-4)",
                          fontVariantNumeric: "tabular-nums",
                          overflow: "hidden",
                          textOverflow: "ellipsis",
                          whiteSpace: "nowrap",
                        }}
                        title={b.miner || ""}
                      >
                        {formatBlockSize(b.size)}
                        {b.miner ? (
                          <>
                            <span style={{ color: "var(--ink-5)" }}> · by </span>
                            {truncateHash(b.miner, 4, 4)}
                          </>
                        ) : null}
                      </div>
                    </div>
                    <div>
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
                    </div>
                  </Link>
                );
              })
            )}
          </div>
        </div>
      </div>

      {/* ICM lane — distinctive cross-chain visualization. Only renders when
          firn has at least one decoded ICM event for this L1; otherwise the
          slot stays out of the layout entirely. Events are grouped by
          messageId so a single cross-chain message that produced both a
          ReceiveCrossChainMessage and a MessageExecuted log shows up
          once with both pieces of state collapsed into the same row. */}
      {icmMessages && icmMessages.length > 0 ? (
        <div style={{ marginBottom: 48 }}>
          <div className="flex items-baseline justify-between mb-[18px]">
            <div>
              <div className="eyebrow mb-1.5">Cross-chain · ICM</div>
              <div className="h-display" style={{ fontSize: 26 }}>
                Inbound &amp; outbound messages
              </div>
            </div>
            <Link
              href="/icm"
              style={{
                fontSize: 12.5,
                color: "var(--ink-3)",
                textDecoration: "none",
              }}
            >
              View all →
            </Link>
          </div>
          <div
            className="card border border-line rounded-[10px] bg-bg-elev overflow-x-auto"
            style={{ padding: "8px 0" }}
          >
            {groupICM(icmMessages).map((g, i, arr) => (
              <ICMRow
                key={g.key}
                group={g}
                fresh={freshIcm.has(`${g.primary.transactionHash}-${g.primary.logIndex}`)}
                localChainId={localChainId}
                tokensByAddress={tokensByAddress}
                isLast={i === arr.length - 1}
              />
            ))}
          </div>
        </div>
      ) : null}

      {/* Latest transactions */}
      <div>
        <div className="flex items-baseline justify-between mb-[18px]">
          <div>
            <div className="eyebrow mb-1.5">Latest activity</div>
            <div className="h-display" style={{ fontSize: 26 }}>
              Transactions
            </div>
          </div>
          <Link
            href="/transactions"
            style={{
              fontSize: 12.5,
              color: "var(--ink-3)",
              textDecoration: "none",
            }}
          >
            View all →
          </Link>
        </div>
        <div
          className="card border border-line rounded-[10px] bg-bg-elev overflow-x-auto"
          {...txsHover}
        >
          <table className="lat-tbl">
            <thead>
              <tr>
                <th style={{ width: 64 }}>Status</th>
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
                <th className="hidden lg:table-cell" style={{ textAlign: "right", width: 100 }}>
                  Fee
                </th>
                <th style={{ textAlign: "right", width: 130 }}>Value</th>
                <th style={{ textAlign: "right", width: 110 }}>Block · Age</th>
              </tr>
            </thead>
            <tbody>
              {!txs
                ? Array.from({ length: HOME_LIVE_TXS }).map((_, i) => (
                    <tr key={i}>
                      <td colSpan={9}>
                        <Skeleton className="h-4 w-full" />
                      </td>
                    </tr>
                  ))
                : txs.slice(0, HOME_LIVE_TXS).map((t) => (
                    // Plain <tr> + the existing `fresh-row` CSS keyframe.
                    // motion's layout/AnimatePresence inside a <table> tends
                    // to glitch — `display: table-row` doesn't cooperate
                    // with the transforms motion applies for layout
                    // measurement, and at high TPS the per-row re-measure
                    // fights the natural column-width layout. The CSS
                    // keyframe is purely background-color + a tiny vertical
                    // settle, never a transform — table-safe and reads as
                    // "this row just arrived."
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
                        <Hash
                          value={t.hash}
                          tone="link"
                          length={10}
                          href={`/transactions/${t.hash}`}
                        />
                      </td>
                      <td className="hidden md:table-cell">
                        <MethodChip
                          selector={t.method.selector}
                          to={t.to}
                          firnName={t.method.name}
                        />
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
                        ) : (
                          <span className="mono" style={{ fontSize: 11.5, color: "var(--ink-4)" }}>
                            contract creation
                          </span>
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
                        style={{ textAlign: "right", color: "var(--ink-4)" }}
                      >
                        {formatTxFee(t.gas.used, t.gas.price, symbol)}
                      </td>
                      <td className="mono" style={{ textAlign: "right", color: "var(--ink)" }}>
                        {formatNativeAmount(t.value, symbol)}
                      </td>
                      <td className="mono" style={{ textAlign: "right" }}>
                        {/* Two-line cell: block number on top, age below.
                            The whole cell is fixed-width on the column;
                            inside, both lines use tabular-nums + a
                            fixed-width inline-block for the age string so
                            the 1Hz re-render walking through "just now" /
                            "5s ago" / "10s ago" / "1m ago" never resizes
                            the column or shifts neighbours. */}
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
                  ))}
            </tbody>
          </table>
        </div>
      </div>

      <ValidatorsCard />
    </div>
  );
}

/**
 * Aggregated view of one cross-chain message. Multiple ICM logs that
 * share a messageId (Receive + Executed for an inbound delivery, or
 * Send + AddFeeAmount for an outbound) collapse into a single group
 * here so the home lane shows one row per message instead of one row
 * per event. The "primary" event is the most-decoded one — Receive
 * carries the full TeleporterMessage + appMessage payload, so it
 * wins when present.
 */
interface ICMGroup {
  key: string; // unique row key (messageId, or tx-logIndex for events without one)
  primary: ICMMessage; // the event we render fields off of
  events: ICMMessage[]; // every event in this group, newest-first
  // Lifecycle hint synthesized from which events were observed in the
  // group. Drives the status chip.
  lifecycle: "sent" | "delivered" | "executed" | "failed" | "settled";
}

/**
 * Collapse a flat list of recent ICM events into one row per messageId.
 * Events without a messageId (e.g. RelayerRewardsRedeemed,
 * BlockchainIDInitialized) stay as their own row — they're standalone
 * lifecycle events that don't aggregate.
 */
function groupICM(events: ICMMessage[]): ICMGroup[] {
  // Per-messageId bucket; undefined-id events bypass the bucket.
  const byId = new Map<string, ICMGroup>();
  const standalone: ICMGroup[] = [];

  // Pick the "best" event to render fields off of. ReceiveCrossChainMessage
  // carries the full payload (teleporterMessage + decoded appMessage); a
  // SendCrossChainMessage on the source side carries a similar payload
  // for outbound messages. Settlement-only events (MessageExecuted,
  // ReceiptReceived) have just the messageId in topics, so they're
  // poor "primary" candidates — fall back only when nothing better is
  // present.
  const rank = (e: ICMMessage): number => {
    switch (e.event) {
      case "ReceiveCrossChainMessage":
        return 5;
      case "SendCrossChainMessage":
        return 4;
      case "SendWarpMessage":
        return 3;
      case "MessageExecutionFailed":
        return 2;
      case "MessageExecuted":
        return 1;
      case "ReceiptReceived":
      case "AddFeeAmount":
        return 0;
      default:
        return -1;
    }
  };

  const lifecycle = (events: ICMMessage[]): ICMGroup["lifecycle"] => {
    let s: ICMGroup["lifecycle"] = "sent";
    for (const e of events) {
      switch (e.event) {
        case "ReceiptReceived":
          return "settled";
        case "MessageExecutionFailed":
          s = "failed";
          break;
        case "MessageExecuted":
          if (s !== "failed") s = "executed";
          break;
        case "ReceiveCrossChainMessage":
          if (s === "sent") s = "delivered";
          break;
      }
    }
    return s;
  };

  for (const e of events) {
    if (!e.messageId) {
      standalone.push({
        key: `${e.transactionHash}-${e.logIndex}`,
        primary: e,
        events: [e],
        lifecycle: "sent",
      });
      continue;
    }
    const id = e.messageId.toLowerCase();
    const existing = byId.get(id);
    if (!existing) {
      byId.set(id, { key: id, primary: e, events: [e], lifecycle: "sent" });
      continue;
    }
    existing.events.push(e);
    if (rank(e) > rank(existing.primary)) existing.primary = e;
  }
  // Walk groups once at the end to settle the lifecycle. Doing this
  // per-insert above would re-scan the events list O(n²) for nothing.
  for (const g of byId.values()) g.lifecycle = lifecycle(g.events);

  // Newest-first by primary event's block timestamp. The Map keeps
  // insertion order which already reflects newest-first from the
  // bootstrap call, but the primary may have been swapped in mid-walk —
  // resort defensively so a Receive event that promoted later in the
  // walk doesn't accidentally bubble to the bottom.
  const out = [...byId.values(), ...standalone];
  out.sort((a, b) => {
    const at = Date.parse(a.primary.block.timestamp);
    const bt = Date.parse(b.primary.block.timestamp);
    if (Number.isFinite(at) && Number.isFinite(bt) && at !== bt) return bt - at;
    if (a.primary.block.number !== b.primary.block.number) {
      return b.primary.block.number - a.primary.block.number;
    }
    return b.primary.logIndex - a.primary.logIndex;
  });
  return out;
}

/**
 * Find the AppMessage attached to any event in the group. Receive and
 * Send events both populate it (decoded by firn before the wire);
 * settlement-only events (MessageExecuted, ReceiptReceived) don't.
 * Returns the first hit so callers can render the protocol/kindLabel
 * preview without re-walking the events.
 */
function appMessageFor(g: ICMGroup): ICMMessage["appMessage"] | undefined {
  for (const e of g.events) if (e.appMessage) return e.appMessage;
  return undefined;
}

function ICMRow({
  group: g,
  fresh,
  localChainId,
  tokensByAddress,
  isLast,
}: {
  group: ICMGroup;
  fresh: boolean;
  localChainId: string | undefined;
  tokensByAddress: Map<string, { symbol?: string; name?: string; decimals: number }>;
  isLast: boolean;
}) {
  const m = g.primary;
  const sourceLocal =
    m.sourceBlockchainId && localChainId
      ? m.sourceBlockchainId.toLowerCase() === localChainId.toLowerCase()
      : false;
  const destLocal =
    m.destinationBlockchainId && localChainId
      ? m.destinationBlockchainId.toLowerCase() === localChainId.toLowerCase()
      : false;
  // Resolved chain names from the backend's blockchains resolver.
  // For the implicit side of every cross-chain event (we're on Echo,
  // so MessageExecuted's destination is "echo"), the backend stamps
  // the active chain name even when the bytes32 isn't on the event.
  // Fall back to truncated bytes32 only when the resolver hadn't
  // hydrated yet at index time.
  const sourceLabel =
    m.sourceBlockchainName ??
    (m.sourceBlockchainId ? briefBlockchainId(m.sourceBlockchainId) : "—");
  const destLabel =
    m.destinationBlockchainName ??
    (m.destinationBlockchainId ? briefBlockchainId(m.destinationBlockchainId) : "—");
  const sourceTitle = [m.sourceBlockchainCb58, m.sourceBlockchainId].filter(Boolean).join(" / ");
  const destTitle = [m.destinationBlockchainCb58, m.destinationBlockchainId]
    .filter(Boolean)
    .join(" / ");
  // When the resolver gave us a name, treat it like a "first-class"
  // identifier (full ink color); falls back to the muted style when
  // we're rendering raw hex.
  const sourceResolved = !!m.sourceBlockchainName;
  const destResolved = !!m.destinationBlockchainName;
  // Row click goes to the message detail page (with full event timeline +
  // decoded payload) when we have a messageId. Falls back to the raw tx
  // for events without one (RelayerRewardsRedeemed, BlockchainIDInitialized).
  // The detail page itself links to the transaction, so this isn't a
  // navigation dead-end — it's just a richer first-stop.
  const rowHref = m.messageId ? `/icm/${m.messageId}` : `/transactions/${m.transactionHash}`;
  const app = appMessageFor(g);
  // The center "preview" cell is the most informative thing in the
  // row — when we recognized the payload as ICTT we render the token
  // movement inline ("0.3 HERESY → 0x3c7a…"); otherwise we fall back
  // to the event-name pill that was always there.
  const isICTT = app?.protocol === "ICTT" && !!app.kindLabel;
  // Resolve the destination-side ICTT contract for token lookup. On a
  // ReceiveCrossChainMessage, teleporterMessage.destinationAddress is
  // the TokenRemote that minted/released funds for this transfer —
  // and on most ICTT deploys that contract IS the ERC-20 itself, so
  // looking it up in the token catalog gives us the symbol + decimals
  // we need for human formatting. Falls through to undefined when
  // we're not on a Receive-shaped event (the home lane is mostly
  // these so coverage is high in practice).
  const ictttokenAddr = (() => {
    for (const e of g.events) {
      if (e.event === "ReceiveCrossChainMessage" && e.teleporterMessage?.destinationAddress) {
        return e.teleporterMessage.destinationAddress.toLowerCase();
      }
    }
    return undefined;
  })();
  const icttToken = ictttokenAddr ? tokensByAddress.get(ictttokenAddr) : undefined;
  // Status badge collapses the per-event lifecycle into one chip so the
  // user doesn't have to interpret 4 different event names. "Settled"
  // = a ReceiptReceived round-tripped back to the source; "Executed" =
  // delivered + invoked target; "Delivered" = Receive seen but no
  // Executed yet; "Failed" = the on-chain call reverted; "Sent" = only
  // a Send (no destination state observed yet on this side).
  const statusTone = g.lifecycle === "failed" ? "bad" : g.lifecycle === "sent" ? "default" : "good";
  const statusLabel =
    g.lifecycle === "settled"
      ? "Settled"
      : g.lifecycle === "executed"
        ? "Executed"
        : g.lifecycle === "delivered"
          ? "Delivered"
          : g.lifecycle === "failed"
            ? "Failed"
            : "Sent";
  return (
    <Link
      href={rowHref}
      className={fresh ? "fresh-row" : undefined}
      style={{
        display: "grid",
        gridTemplateColumns: "100px 1fr 220px 1fr 110px 100px 70px",
        alignItems: "center",
        gap: 16,
        padding: "14px 22px",
        borderBottom: isLast ? 0 : "1px solid var(--line-soft)",
        textDecoration: "none",
        color: "inherit",
      }}
    >
      <span>
        <Chip tone={m.kind === "teleporter" ? "steel" : "default"}>
          {m.kind === "teleporter" ? "Teleporter" : "Warp"}
        </Chip>
      </span>
      <div style={{ textAlign: "right", overflow: "hidden" }}>
        <div
          className="mono"
          style={{
            fontSize: 12,
            color: sourceLocal || sourceResolved ? "var(--ink)" : "var(--ink-2)",
            fontWeight: sourceLocal ? 500 : 400,
            overflow: "hidden",
            textOverflow: "ellipsis",
            whiteSpace: "nowrap",
          }}
          title={sourceTitle}
        >
          {sourceLabel}
        </div>
        <div className="mono" style={{ fontSize: 10.5, color: "var(--ink-4)" }}>
          source
        </div>
      </div>
      <div style={{ display: "flex", alignItems: "center", gap: 8, justifyContent: "center" }}>
        <div style={{ flex: 1, height: 1, background: "var(--line)" }} />
        {isICTT ? <ICTTPreview app={app!} token={icttToken} /> : <EventPill name={m.event} />}
        <div style={{ flex: 1, height: 1, background: "var(--line)" }} />
        <svg width="10" height="10" viewBox="0 0 10 10" aria-hidden>
          <path
            d="M2 5h6m0 0L6 3m2 2L6 7"
            stroke="var(--ink-3)"
            strokeWidth="1.3"
            fill="none"
            strokeLinecap="round"
          />
        </svg>
      </div>
      <div style={{ overflow: "hidden" }}>
        <div
          className="mono"
          style={{
            fontSize: 12,
            color: destLocal || destResolved ? "var(--ink)" : "var(--ink-2)",
            fontWeight: destLocal ? 500 : 400,
            overflow: "hidden",
            textOverflow: "ellipsis",
            whiteSpace: "nowrap",
          }}
          title={destTitle}
        >
          {destLabel}
        </div>
        <div className="mono" style={{ fontSize: 10.5, color: "var(--ink-4)" }}>
          dest
        </div>
      </div>
      <div style={{ textAlign: "center", overflow: "hidden" }}>
        <Chip tone={statusTone}>{statusLabel}</Chip>
      </div>
      <div
        className="mono"
        style={{
          fontSize: 12,
          color: m.messageId ? "var(--accent, var(--ink-2))" : "var(--ink-3)",
          overflow: "hidden",
          textOverflow: "ellipsis",
          whiteSpace: "nowrap",
        }}
        title={m.messageId ?? ""}
      >
        {m.messageId ? truncateHash(m.messageId, 6, 4) : "—"}
      </div>
      <div className="mono" style={{ fontSize: 12, color: "var(--ink-4)", textAlign: "right" }}>
        {formatRelativeTime(m.block.timestamp)}
      </div>
    </Link>
  );
}

/**
 * Centerpiece preview for an ICTT-recognized message. Format precedence,
 * top to bottom, in order of "actually informative":
 *
 *   1. We have decimals  → "0.3 HERESY → 0x3c7a…fec"
 *   2. We have a symbol  → "HERESY → 0x3c7a…fec"  (decimals unknown so
 *                          we deliberately omit the amount; rendering
 *                          a raw uint256 or scientific notation is
 *                          misleading without scale context)
 *   3. Catalog miss      → "ICTT SINGLE_HOP_SEND → 0x3c7a…fec"
 *
 * Token info comes from the home page's bulk useTokens() catalog so a
 * lane of 8 rows is one request, not eight per refresh.
 */
function ICTTPreview({
  app,
  token,
}: {
  app: NonNullable<ICMMessage["appMessage"]>;
  token: { symbol?: string; name?: string; decimals: number } | undefined;
}) {
  const fields = app.fields ?? [];
  const amountRaw = fields.find((f) => f.name === "amount")?.value;
  const recipient = fields.find((f) => f.name === "recipient")?.value;
  const recipientShort = recipient ? truncateHash(recipient, 4, 4) : null;
  const isTransferShape = app.kindLabel === "SINGLE_HOP_SEND" || app.kindLabel === "MULTI_HOP_SEND";
  const haveDecimals = isTransferShape && token?.decimals != null && amountRaw;
  const haveSymbol = isTransferShape && token?.symbol;
  // "Loud" body = decimals-formatted amount + symbol; "muted" body =
  // anything we couldn't fully ground. Driving styling off this lets
  // the catalog-hit rows pop visually so the user can scan the lane
  // for material transfers without reading every line.
  const body = haveDecimals
    ? `${formatTokenAmountForRow(amountRaw!, token!.decimals)} ${token!.symbol}${recipientShort ? ` → ${recipientShort}` : ""}`
    : haveSymbol
      ? `${token!.symbol}${recipientShort ? ` → ${recipientShort}` : ""}`
      : isTransferShape
        ? recipientShort
          ? `${app.kindLabel} → ${recipientShort}`
          : app.kindLabel
        : app.kindLabel;
  const titleParts = [
    `${app.protocol} ${app.kindLabel}`,
    amountRaw && token?.decimals != null ? `${amountRaw} raw / ${token.decimals} decimals` : null,
    recipient ? `recipient ${recipient}` : null,
  ].filter(Boolean);
  return (
    <span
      style={{
        display: "inline-flex",
        alignItems: "center",
        gap: 6,
        background: "color-mix(in oklch, var(--accent) 14%, var(--bg-sunken))",
        border: "1px solid color-mix(in oklch, var(--accent) 32%, var(--line))",
        padding: "3px 9px",
        borderRadius: 99,
        whiteSpace: "nowrap",
        maxWidth: 220,
        overflow: "hidden",
        textOverflow: "ellipsis",
      }}
      title={titleParts.join(" · ")}
    >
      <span
        className="mono"
        style={{ fontSize: 10, fontWeight: 600, color: "var(--accent)", letterSpacing: 0.4 }}
      >
        ICTT
      </span>
      <span
        className="mono"
        style={{
          fontSize: 10.5,
          color: haveDecimals ? "var(--ink)" : "var(--ink-3)",
          overflow: "hidden",
          textOverflow: "ellipsis",
        }}
      >
        {body}
      </span>
    </span>
  );
}

function EventPill({ name }: { name: string }) {
  return (
    <span
      style={{
        fontFamily: "var(--font-mono)",
        fontSize: 10,
        color: "var(--ink-3)",
        background: "var(--bg-sunken)",
        border: "1px solid var(--line)",
        padding: "2px 8px",
        borderRadius: 99,
        whiteSpace: "nowrap",
      }}
    >
      {name}
    </span>
  );
}

/**
 * Format a uint256 decimal-string for inline row display, applying the
 * token's decimals and capping precision at 4 fractional digits so the
 * lane row stays compact. Returns the trimmed integer when the amount
 * is a whole token count. Caller MUST already know decimals — this
 * never invents an exponent or otherwise makes up scale.
 *
 * Used only by ICTTPreview when the token catalog gave us decimals;
 * for catalog misses we omit the amount entirely.
 */
function formatTokenAmountForRow(rawDecimal: string, decimals: number): string {
  if (!/^\d+$/.test(rawDecimal)) return rawDecimal;
  let n: bigint;
  try {
    n = BigInt(rawDecimal);
  } catch {
    return rawDecimal;
  }
  if (decimals === 0) return formatIntegerWithCommas(n.toString());
  const base = BigInt(10) ** BigInt(decimals);
  const whole = n / base;
  const frac = n % base;
  const wholeStr = formatIntegerWithCommas(whole.toString());
  if (frac === BigInt(0)) return wholeStr;
  // Pad fractional, strip trailing zeros, cap to 4 sig digits to keep
  // the row tight. Header on the detail page renders the full 6+ digit
  // version when precision matters.
  const fracStr = frac.toString().padStart(decimals, "0").replace(/0+$/, "").slice(0, 4);
  return fracStr ? `${wholeStr}.${fracStr}` : wholeStr;
}

function formatIntegerWithCommas(s: string): string {
  return s.replace(/\B(?=(\d{3})+(?!\d))/g, ",");
}

function briefBlockchainId(id: string | undefined): string {
  if (!id) return "—";
  if (id.length <= 14) return id;
  return `${id.slice(0, 8)}…${id.slice(-4)}`;
}

// Address-count delta over a rolling time window. We hold a small ring
// of {at, count} samples and compute % change vs the oldest sample
// still inside the window — falls back to the earliest sample we have
// while the window fills. Returns null until at least two samples
// exist (no useful delta from a single observation).
type AddressDelta = {
  pct: number; // signed, e.g. +1.23 / -0.45
  windowMs: number; // how stale the baseline actually is
  baseline: bigint;
  current: bigint;
} | null;

function useAddressDelta(countStr: string | undefined, windowMs: number): AddressDelta {
  const samplesRef = useRef<{ at: number; count: bigint }[]>([]);
  const latestCountRef = useRef<bigint | null>(null);
  const [, force] = useState(0);

  // Track the most recent known count from React Query.
  useEffect(() => {
    if (!countStr) return;
    try {
      latestCountRef.current = BigInt(countStr);
    } catch {
      /* ignore */
    }
  }, [countStr]);

  // Push a sample on a 2s heartbeat regardless of whether the count
  // changed. A purely "push on change" approach gets stuck on chains
  // with a flat address count (a fixed bombard worker pool, an idle
  // L1, etc.) — only one sample ever lands and the delta calc has
  // nothing to compare against.
  useEffect(() => {
    const tick = () => {
      const c = latestCountRef.current;
      if (c === null) return;
      const now = Date.now();
      const samples = samplesRef.current;
      samples.push({ at: now, count: c });
      const cutoff = now - Math.max(windowMs, 600_000);
      while (samples.length > 1 && samples[0].at < cutoff) samples.shift();
      force((n) => n + 1);
    };
    tick(); // first sample as soon as we know a count
    const id = setInterval(tick, 2_000);
    return () => clearInterval(id);
  }, [windowMs]);

  // INTENTIONAL refs-in-render (same architectural pattern as
  // sparkline.tsx): the 2s tick effect calls force() to bump a render,
  // and this body reads samplesRef + Date.now() to compute a window
  // delta against the latest wall-clock time. Moving samples into
  // useState would re-allocate the array on every tick and break the
  // 600s retention buffer. Date.now() impurity is required to slide
  // the delta window. Refs and the impure clock read are correct here.
  /* eslint-disable react-hooks/refs, react-hooks/purity */
  const samples = samplesRef.current;
  if (samples.length < 2) return null;
  const now = Date.now();
  const cutoff = now - windowMs;
  // Pick the oldest sample still within the window — or the earliest
  // overall if every sample is more recent than the window allows.
  const baseline = samples.find((s) => s.at >= cutoff) ?? samples[0];
  const current = samples[samples.length - 1];
  if (baseline.count === BigInt(0)) return null;

  // Convert to Number for the percentage; the address count fits in
  // f64 well past any realistic L1 size.
  const b = Number(baseline.count);
  const c = Number(current.count);
  const pct = ((c - b) / b) * 100;
  return {
    pct,
    windowMs: now - baseline.at,
    baseline: baseline.count,
    current: current.count,
  };
  /* eslint-enable react-hooks/refs, react-hooks/purity */
}

function AddressDeltaSub({ delta }: { delta: AddressDelta }) {
  if (!delta) {
    return <span style={{ color: "var(--ink-4)" }}>tracking…</span>;
  }
  const flat = Math.abs(delta.pct) < 0.005;
  const arrow = flat ? "·" : delta.pct > 0 ? "↑" : "↓";
  const tone = flat ? "var(--ink-4)" : delta.pct > 0 ? "var(--ok)" : "var(--warn)";
  const pctText = flat ? "0.00%" : `${Math.abs(delta.pct).toFixed(2)}%`;
  const windowText =
    delta.windowMs >= 60_000
      ? `${Math.round(delta.windowMs / 60_000)}m`
      : `${Math.max(1, Math.round(delta.windowMs / 1_000))}s`;
  return (
    <span>
      <span style={{ color: tone, marginRight: 4 }}>
        {arrow} {pctText}
      </span>
      <span style={{ color: "var(--ink-4)" }}>· {windowText}</span>
    </span>
  );
}

// Adaptive: chains with sub-gwei base fees (benchmark / ACP-176-tuned L1s)
// look like "0 gwei" in pure-gwei display. Drop down to wei/microgwei
// when the value is too small for gwei to be informative.
function formatGwei(weiStr: string): string {
  try {
    const wei = BigInt(weiStr);
    if (wei === BigInt(0)) return "0";
    const ONE_GWEI = BigInt(10) ** BigInt(9);
    if (wei < ONE_GWEI) {
      // Below 1 gwei — show raw wei. (BENCH chains commonly mine at 1 wei.)
      return `${wei.toLocaleString()} wei`;
    }
    const gwei = Number(wei) / 1e9;
    return `${gwei.toLocaleString(undefined, { maximumFractionDigits: 2 })} gwei`;
  } catch {
    return "—";
  }
}

// Compact, ranked-by-weight validators card. Hides itself entirely when
// the P-Chain isn't reachable (bootstrapping or unreachable upstream) so
// the homepage doesn't display a permanent error region for an L1 whose
// validators endpoint is just slow.
const HOME_VALIDATORS = 5;

function ValidatorsCard() {
  const { data: vsResp, isPending, error } = useValidators();
  const { data: l1Uptime } = useL1Uptime();

  const uptimeByNode = useMemo(() => {
    const m = new Map<string, string | number>();
    for (const e of (l1Uptime?.validators ?? []) as L1UptimeEntry[]) {
      const u = e.uptimePercentage ?? e.uptimeSeconds;
      if (u !== undefined) m.set(e.nodeID, u);
    }
    return m;
  }, [l1Uptime]);

  // Stable identity: wrap in useMemo so the totalWeight + top useMemo
  // deps don't invalidate on every render when vsResp is undefined.
  const validators = useMemo(() => vsResp?.validators ?? [], [vsResp]);

  const totalWeight = useMemo(() => {
    let sum = 0n;
    for (const v of validators) {
      try {
        sum += BigInt(v.weight ?? "0");
      } catch {
        /* skip */
      }
    }
    return sum;
  }, [validators]);

  const top = useMemo(() => {
    const arr = [...validators];
    arr.sort((a, b) => cmpBig(b.weight, a.weight));
    return arr.slice(0, HOME_VALIDATORS);
  }, [validators]);

  const liveCount = validators.filter((v) => v.connected === true).length;

  // Hide the whole panel when the P-Chain is bootstrapping — the validators
  // page already explains this, and the homepage is busy enough without a
  // dedicated error tile.
  if (isBootstrappingError(error)) return null;

  return (
    <div style={{ marginTop: 48 }}>
      <div className="flex items-baseline justify-between mb-[18px]">
        <div>
          <div className="eyebrow mb-1.5">Securing this L1</div>
          <div className="h-display" style={{ fontSize: 26 }}>
            Validators
          </div>
        </div>
        <Link
          href="/validators"
          style={{
            fontSize: 12.5,
            color: "var(--ink-3)",
            textDecoration: "none",
          }}
        >
          View all →
        </Link>
      </div>
      <div className="card border border-line rounded-[10px] bg-bg-elev overflow-hidden">
        <div
          className="flex items-center justify-between border-b border-line"
          style={{ padding: "14px 18px" }}
        >
          <div className="mono" style={{ fontSize: 12, color: "var(--ink-2)" }}>
            {isPending ? (
              <Skeleton className="h-4 w-[160px]" />
            ) : (
              <>
                <span style={{ color: "var(--ink)" }}>{validators.length}</span>{" "}
                <span style={{ color: "var(--ink-3)" }}>active</span>
                {validators.length > 0 ? (
                  <>
                    {" "}
                    <span style={{ color: "var(--ink-4)" }}>·</span>{" "}
                    <span style={{ color: "var(--ink-3)" }}>
                      {liveCount}/{validators.length} live
                    </span>
                  </>
                ) : null}
              </>
            )}
          </div>
          <span className="mono" style={{ fontSize: 11, color: "var(--ink-4)" }}>
            top {Math.min(HOME_VALIDATORS, validators.length)} by weight
          </span>
        </div>
        <div>
          {isPending ? (
            Array.from({ length: HOME_VALIDATORS }).map((_, i) => (
              <div key={i} className="px-[18px] py-3.5">
                <Skeleton className="h-4 w-full" />
              </div>
            ))
          ) : top.length === 0 ? (
            <div className="text-center py-12" style={{ color: "var(--ink-4)", fontSize: 13 }}>
              No validators yet.
            </div>
          ) : (
            top.map((v, i, arr) => (
              <ValidatorRow
                key={v.txID || v.nodeID}
                v={v}
                totalWeight={totalWeight}
                uptime={uptimeByNode.get(v.nodeID) ?? v.uptime}
                isLast={i === arr.length - 1}
              />
            ))
          )}
        </div>
      </div>
    </div>
  );
}

function ValidatorRow({
  v,
  totalWeight,
  uptime,
  isLast,
}: {
  v: Validator;
  totalWeight: bigint;
  uptime: string | number | undefined;
  isLast: boolean;
}) {
  const sharePct = useMemo(() => {
    try {
      const w = BigInt(v.weight ?? "0");
      if (totalWeight === 0n) return 0;
      return Number((w * 10000n) / totalWeight) / 100;
    } catch {
      return 0;
    }
  }, [v.weight, totalWeight]);

  return (
    <Link
      href={`/validators/${encodeURIComponent(v.nodeID)}`}
      className="grid items-center gap-3.5"
      style={{
        gridTemplateColumns: "1fr 200px 90px 70px",
        padding: "14px 18px",
        borderBottom: isLast ? 0 : "1px solid var(--line-soft)",
        textDecoration: "none",
        color: "inherit",
      }}
    >
      <div
        className="mono"
        style={{
          fontSize: 12.5,
          color: "var(--accent-ink)",
          overflow: "hidden",
          textOverflow: "ellipsis",
          whiteSpace: "nowrap",
        }}
        title={v.nodeID}
      >
        {truncateHash(v.nodeID, 10, 6)}
      </div>
      <div className="flex items-center gap-2">
        <div
          style={{
            flex: 1,
            height: 4,
            borderRadius: 99,
            background: "var(--bg-sunken)",
            overflow: "hidden",
          }}
        >
          <div
            style={{
              width: `${Math.min(100, sharePct)}%`,
              height: "100%",
              background: "var(--ink)",
            }}
          />
        </div>
        <span
          className="mono"
          style={{ fontSize: 11.5, color: "var(--ink-3)", minWidth: 48, textAlign: "right" }}
        >
          {sharePct.toFixed(2)}%
        </span>
      </div>
      <div className="mono" style={{ fontSize: 12, color: "var(--ink-3)", textAlign: "right" }}>
        {formatRowUptime(uptime)}
      </div>
      <div
        className="mono"
        style={{
          fontSize: 11,
          color: v.connected ? "var(--good)" : "var(--ink-4)",
          textAlign: "right",
        }}
      >
        {v.connected === undefined ? "—" : v.connected ? "● live" : "○ off"}
      </div>
    </Link>
  );
}

function formatRowUptime(uptime: string | number | undefined): string {
  if (uptime === undefined || uptime === "") return "—";
  const n = typeof uptime === "number" ? uptime : parseFloat(uptime);
  if (!Number.isFinite(n)) return "—";
  // P-Chain returns 0..1 fractional ratio; subnet-evm /validators returns 0..100.
  const pct = n <= 1 ? n * 100 : n;
  return `${pct.toFixed(2)}%`;
}

function cmpBig(a: string | undefined, b: string | undefined): number {
  try {
    const ai = BigInt(a ?? "0");
    const bi = BigInt(b ?? "0");
    if (ai === bi) return 0;
    return ai > bi ? 1 : -1;
  } catch {
    return 0;
  }
}
