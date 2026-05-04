"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import {
  useChain,
  useICMMessages,
  useICMRoutes,
  useICMStats,
  useICMTimeseries,
  useICTTTokens,
  type ICMBucket,
  type ICMRoute,
  type ICMTimeseriesPoint,
  type ICTTTokenVolume,
  type ICMWindow,
} from "@/lib/api/queries";
import { Hash } from "@/components/lattice/hash";
import { Chip } from "@/components/lattice/chip";
import { Skeleton } from "@/components/ui/skeleton";
import { PauseButton } from "@/components/lattice/pause-button";
import { ErrorBanner } from "@/components/page/error-banner";
import { FilterBar, FilterInput, FilterPillGroup } from "@/components/lattice/filter-bar";
import { Sparkline } from "@/components/lattice/sparkline";
import { Donut, type DonutSlice } from "@/components/lattice/donut";
import { BarChart, type Bar } from "@/components/lattice/bar-chart";
import { AnimatedNumber } from "@/components/lattice/animated-number";
import {
  SortableTh,
  applyDir,
  compareDate,
  compareNumeric,
  compareString,
  type SortState,
} from "@/components/lattice/sortable-th";
import { useFreshKeys, useNowTick } from "@/lib/use-fresh";
import { formatNumber, formatRelativeTime } from "@/lib/format";
import { formatTokenAmount, summarizeICTT } from "@/lib/icm/decode";
import type { ICMKind, ICMMessage } from "@/lib/api/queries";

type KindFilter = "all" | "teleporter" | "warp";
type SortKey = "layer" | "event" | "block";

const KIND_OPTIONS = [
  { value: "all" as const, label: "All" },
  { value: "teleporter" as const, label: "Teleporter" },
  { value: "warp" as const, label: "Warp" },
];

const WINDOW_OPTIONS = [
  { value: "1h" as const, label: "1H" },
  { value: "6h" as const, label: "6H" },
  { value: "24h" as const, label: "24H" },
  { value: "7d" as const, label: "7D" },
  { value: "30d" as const, label: "30D" },
];

// Window → bucket mapping mirrors the backend's defaultBucketFor heuristic
// so our bar/spark series have ~24-72 points across the chart.
const BUCKET_FOR_WINDOW: Record<ICMWindow, ICMBucket> = {
  "1h": "5m",
  "6h": "15m",
  "24h": "1h",
  "7d": "1h",
  "30d": "1d",
};

export default function ICMPage() {
  const [filter, setFilter] = useState<KindFilter>("all");
  const [emitter, setEmitter] = useState("");
  const [messageId, setMessageId] = useState("");
  const [windowSel, setWindowSel] = useState<ICMWindow>("24h");
  const [sort, setSort] = useState<SortState<SortKey> | null>(null);

  const queryKind: ICMKind | undefined =
    filter === "teleporter" ? "teleporter" : filter === "warp" ? "warp" : undefined;
  const emitterParam = emitter.trim().toLowerCase() || undefined;
  const messageIdParam = messageId.trim().toLowerCase() || undefined;

  const {
    data: page,
    isPending,
    error,
  } = useICMMessages({
    limit: 50,
    kind: queryKind,
    address: emitterParam,
    messageId: messageIdParam,
  });
  const { data: chain } = useChain();
  const { data: stats, isPending: statsPending } = useICMStats({ window: windowSel });
  const { data: routes, isPending: routesPending } = useICMRoutes({
    window: windowSel,
    limit: 12,
  });
  const { data: series } = useICMTimeseries({
    window: windowSel,
    bucket: BUCKET_FOR_WINDOW[windowSel],
  });
  const { data: tokensData, isPending: tokensPending } = useICTTTokens({
    window: windowSel,
    limit: 8,
  });

  const localChainId = chain?.blockchainId;
  const messages = page?.data;
  const fresh = useFreshKeys(messages, msgKey, 1600);
  useNowTick(1000);

  const view = useMemo(() => {
    if (!messages) return messages;
    if (!sort) return messages;
    return [...messages].sort(
      applyDir((a, b) => {
        switch (sort.key) {
          case "layer":
            return compareString(a.kind, b.kind);
          case "event":
            return compareString(a.event, b.event);
          case "block": {
            const cmp = compareNumeric(a.block.number, b.block.number);
            if (cmp !== 0) return cmp;
            return compareDate(a.block.timestamp, b.block.timestamp);
          }
        }
      }, sort.dir),
    );
  }, [messages, sort]);

  const filtersActive =
    filter !== "all" || emitter.trim().length > 0 || messageId.trim().length > 0;

  function reset() {
    setFilter("all");
    setEmitter("");
    setMessageId("");
  }

  // Derived dashboard inputs. Memoize so the charts don't reflow on
  // every keystroke in the filter inputs above.
  const teleporterPct = useMemo(() => {
    if (!stats || stats.eventCount === 0) return null;
    return (stats.teleporterEventCount / stats.eventCount) * 100;
  }, [stats]);

  const sparkPoints = useMemo(() => seriesToPoints(series), [series]);
  const kindSlices = useMemo(() => {
    if (!stats) return [];
    const out: DonutSlice[] = [];
    if (stats.teleporterEventCount > 0)
      out.push({ label: "Teleporter", value: stats.teleporterEventCount });
    if (stats.warpEventCount > 0) out.push({ label: "Warp", value: stats.warpEventCount });
    return out;
  }, [stats]);

  const routeBars = useMemo<Bar[]>(() => routesToBars(routes?.routes ?? []), [routes]);
  const topRoute = (routes?.routes ?? [])[0];

  return (
    <div className="px-4 sm:px-6 lg:px-10 py-6 sm:py-8 pb-12">
      <div className="eyebrow mb-2.5">Cross-chain · ICM</div>

      {/* Hero — total messages over the window plus the live-feed pause
          badge. The headline number is event count over the selected
          window; "messages" (deduped by messageId) is the smaller number
          shown beneath. */}
      <div className="flex items-baseline flex-wrap gap-3 mb-2">
        {stats ? (
          <span className="h-display" style={{ fontSize: 64, lineHeight: 1 }}>
            <AnimatedNumber value={stats.eventCount} />
          </span>
        ) : (
          <Skeleton className="h-[64px] w-[280px]" />
        )}
        <span style={{ fontSize: 17, color: "var(--ink-3)" }}>
          ICM events {windowLabel(windowSel)}
          {stats?.messageCount
            ? ` · ${formatNumber(stats.messageCount)} unique message${stats.messageCount === 1 ? "" : "s"}`
            : ""}
        </span>
        <PauseButton feed="icm" />
      </div>

      <div
        className="mono mb-7 flex flex-wrap items-baseline"
        style={{ fontSize: 12.5, color: "var(--ink-3)", gap: "6px 18px" }}
      >
        {stats ? (
          <>
            <span style={{ display: "inline-flex", alignItems: "center", gap: 6 }}>
              <span className="live-dot" />
              <span>
                <span style={{ color: "var(--good)" }}>
                  {formatNumber(stats.teleporterEventCount)}
                </span>{" "}
                Teleporter
              </span>
            </span>
            <span>
              <span style={{ color: "var(--ink-2)" }}>{formatNumber(stats.warpEventCount)}</span>{" "}
              Warp
            </span>
            <span>
              <span style={{ color: "var(--ink-2)" }}>{formatNumber(stats.uniqueRoutes)}</span>{" "}
              active route{stats.uniqueRoutes === 1 ? "" : "s"}
            </span>
            <span style={{ color: "var(--ink-4)" }}>
              · {formatNumber(stats.uniqueSenders)} sender
              {stats.uniqueSenders === 1 ? "" : "s"} · {formatNumber(stats.uniqueContracts)}{" "}
              contract{stats.uniqueContracts === 1 ? "" : "s"}
            </span>
          </>
        ) : statsPending ? (
          <Skeleton className="h-4 w-[420px]" />
        ) : null}
      </div>

      {/* Window selector — drives all three aggregate queries. */}
      <div className="mb-7">
        <FilterPillGroup<ICMWindow>
          label="Window"
          value={windowSel}
          options={WINDOW_OPTIONS}
          onChange={setWindowSel}
        />
      </div>

      {/* Top dashboard row: 2x2 KPI grid on the left, top-route highlight
          card on the right. Same composition as /blocks. */}
      <div className="grid grid-cols-1 lg:grid-cols-[1.4fr_1fr] gap-6 mb-8">
        <div className="grid grid-cols-2 gap-6">
          <MiniKpi
            label="Teleporter share"
            value={teleporterPct != null ? `${teleporterPct.toFixed(1)}%` : null}
            sub={
              stats
                ? `${formatNumber(stats.teleporterEventCount)} / ${formatNumber(stats.eventCount)} events`
                : ""
            }
          />
          <MiniKpi
            label="Active routes"
            value={stats ? formatNumber(stats.uniqueRoutes) : null}
            sub={
              routes?.activeBlockchainName
                ? `from ${routes.activeBlockchainName}`
                : "this L1's traffic"
            }
          />
          <MiniKpi
            label="Unique messages"
            value={stats ? formatNumber(stats.messageCount) : null}
            sub="deduped by messageId · Send + Receive"
          />
          <MiniKpi
            label="Unique senders"
            value={stats ? formatNumber(stats.uniqueSenders) : null}
            sub="distinct addresses · Warp"
          />
        </div>
        <TopRouteCard
          route={topRoute}
          activeName={routes?.activeBlockchainName}
          loading={routesPending}
        />
      </div>

      {/* Middle row: activity sparkline · layer donut · top-routes bar
          chart. Each ships with honest sample-window labelling. */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6 mb-9">
        <div className="card border border-line rounded-[10px] bg-bg-elev" style={{ padding: 18 }}>
          <div className="flex items-baseline justify-between mb-3">
            <div className="eyebrow">ICM activity</div>
            <div className="mono" style={{ fontSize: 10.5, color: "var(--ink-4)" }}>
              {sparkPoints.length} buckets · {windowLabel(windowSel)}
            </div>
          </div>
          {sparkPoints.length >= 2 ? (
            <Sparkline fluid height={120} data={sparkPoints} color="var(--accent)" />
          ) : (
            <Skeleton className="h-[120px] w-full" />
          )}
          <div
            className="mono mt-1.5 flex items-baseline justify-between"
            style={{ fontSize: 10.5, color: "var(--ink-4)" }}
          >
            <span>{windowLabel(windowSel).replace("·", "").trim()} ago</span>
            <span style={{ color: "var(--ink-3)" }}>
              now ·{" "}
              {sparkPoints.length > 0
                ? `${formatNumber(sparkPoints[sparkPoints.length - 1])} events`
                : "—"}
            </span>
          </div>
        </div>

        <div className="card border border-line rounded-[10px] bg-bg-elev" style={{ padding: 18 }}>
          <div className="flex items-baseline justify-between mb-3">
            <div className="eyebrow">Layer split</div>
            <div className="mono" style={{ fontSize: 10.5, color: "var(--ink-4)" }}>
              event share
            </div>
          </div>
          {kindSlices.length ? (
            <Donut slices={kindSlices} size={120} thickness={14} />
          ) : (
            <Skeleton className="h-[120px] w-full" />
          )}
        </div>

        <div className="card border border-line rounded-[10px] bg-bg-elev" style={{ padding: 18 }}>
          <div className="flex items-baseline justify-between mb-3">
            <div className="eyebrow">Top routes</div>
            <div className="mono" style={{ fontSize: 10.5, color: "var(--ink-4)" }}>
              by event count
            </div>
          </div>
          {routeBars.length ? (
            <BarChart fluid bars={routeBars} height={120} peakTone="var(--accent)" />
          ) : (
            <Skeleton className="h-[120px] w-full" />
          )}
          <div
            className="mono mt-2"
            style={{ fontSize: 10.5, color: "var(--ink-4)", textAlign: "center" }}
          >
            {routes?.routes.length
              ? `${formatNumber(routes.routes.length)} route${routes.routes.length === 1 ? "" : "s"} · ${windowLabel(windowSel)}`
              : "—"}
          </div>
        </div>
      </div>

      {/* Tokens transferred via ICTT — answers "what moved across
          chains?" Surfaces symbol + decimals when the upstream RPC
          resolved them; falls back to the raw uint256 totals
          otherwise. Truncated flag honestly labels long-window
          sampling. */}
      <TokensSection
        tokens={tokensData?.tokens ?? []}
        truncated={tokensData?.truncated ?? false}
        sampled={tokensData?.sampledMessages}
        loading={tokensPending}
        windowSel={windowSel}
      />

      {/* Routes detail table. Drills into the chart above — every bar
          has a row here with src/dst names, direction, counts, last
          seen. Backs the user's natural follow-up: "which route lit
          up the chart?" */}
      <RoutesSection
        routes={routes?.routes ?? []}
        activeName={routes?.activeBlockchainName}
        loading={routesPending}
        windowSel={windowSel}
      />

      {/* Existing message-stream filter bar + table. Below the dashboard
          so operators landing here for the live tape still find it
          unchanged from the previous design. */}
      <FilterBar
        active={filtersActive}
        onReset={reset}
        count={view ? `${formatNumber(view.length)} message${view.length === 1 ? "" : "s"}` : null}
      >
        <FilterPillGroup<KindFilter> value={filter} options={KIND_OPTIONS} onChange={setFilter} />
        <FilterInput
          value={emitter}
          onChange={setEmitter}
          placeholder="Emitter 0x…"
          ariaLabel="Filter by emitter contract address"
          width={240}
        />
        <FilterInput
          value={messageId}
          onChange={setMessageId}
          placeholder="Message ID 0x…"
          ariaLabel="Filter by bytes32 message ID"
          width={300}
        />
      </FilterBar>

      {error ? <ErrorBanner title="Couldn't load ICM messages" message={error.message} /> : null}

      <div className="card border border-line rounded-[10px] bg-bg-elev overflow-x-auto">
        <table className="lat-tbl">
          <thead>
            <tr>
              <SortableTh<SortKey> k="layer" active={sort} onSort={setSort} width={92}>
                Layer
              </SortableTh>
              <SortableTh<SortKey> k="event" active={sort} onSort={setSort} width={220}>
                Event · Decoded
              </SortableTh>
              <th>Message ID</th>
              <th className="hidden md:table-cell" style={{ width: 240 }}>
                Source → Destination
              </th>
              <th className="hidden md:table-cell">Tx</th>
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
              Array.from({ length: 8 }).map((_, i) => (
                <tr key={i}>
                  <td colSpan={6}>
                    <Skeleton className="h-4 w-full" />
                  </td>
                </tr>
              ))
            ) : view?.length ? (
              view.map((m) => (
                <ICMRow
                  key={msgKey(m)}
                  m={m}
                  fresh={fresh.has(msgKey(m))}
                  localChainId={localChainId}
                />
              ))
            ) : (
              <tr>
                <td colSpan={6} className="text-center py-10" style={{ color: "var(--ink-4)" }}>
                  {filtersActive
                    ? "No ICM messages match these filters."
                    : "No ICM messages on this L1 yet."}
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Rows
// ---------------------------------------------------------------------------

function ICMRow({
  m,
  fresh,
  localChainId,
}: {
  m: ICMMessage;
  fresh: boolean;
  localChainId: string | undefined;
}) {
  const direction = describeDirection(m, localChainId);
  const ictt = summarizeICTT(m.appMessage);
  return (
    <tr className={fresh ? "fresh-row" : undefined}>
      <td>
        <Chip tone={m.kind === "teleporter" ? "steel" : "default"}>
          {m.kind === "teleporter" ? "Teleporter" : "Warp"}
        </Chip>
      </td>
      <td>
        <EventCell
          event={m.event}
          ictt={ictt}
          originToken={m.originToken}
          originSender={m.teleporterMessage?.originSenderAddress}
          destinationAddress={m.teleporterMessage?.destinationAddress}
        />
      </td>
      <td>
        {m.messageId ? (
          <Hash value={m.messageId} length={10} tone="link" href={`/icm/${m.messageId}`} />
        ) : (
          <span className="mono" style={{ fontSize: 11.5, color: "var(--ink-4)" }}>
            —
          </span>
        )}
      </td>
      <td className="hidden md:table-cell">
        <DirectionCell direction={direction} />
      </td>
      <td className="hidden md:table-cell">
        <Hash
          value={m.transactionHash}
          length={8}
          tone="link"
          href={`/transactions/${m.transactionHash}`}
        />
      </td>
      <td className="mono" style={{ textAlign: "right" }}>
        <Link
          href={`/blocks/${m.block.number}`}
          style={{ textDecoration: "none", color: "inherit" }}
        >
          <div style={{ color: "var(--ink-2)", fontSize: 12 }}>#{formatNumber(m.block.number)}</div>
          <div style={{ color: "var(--ink-4)", fontSize: 11 }}>
            {formatRelativeTime(m.block.timestamp)}
          </div>
        </Link>
      </td>
    </tr>
  );
}

/**
 * Event cell renders the raw event name on top, with two optional
 * lines below: the decoded ICTT summary (kind + amount + recipient)
 * and the originSender → destinationAddress hop. Both depend on
 * what the backend decoded — non-ICTT custom messages render only
 * the event name, which is honest about the inspection limit.
 */
function EventCell({
  event,
  ictt,
  originToken,
  originSender,
  destinationAddress,
}: {
  event: string;
  ictt: ReturnType<typeof summarizeICTT>;
  originToken?: import("@/lib/api/queries").TokenRef;
  originSender?: string;
  destinationAddress?: string;
}) {
  // Symbol / decimals come from `originToken` (resolved server-side
  // against the upstream RPC's name/symbol/decimals trio). Fall back
  // to bare uint256 when the token wasn't resolvable — same behavior
  // as before, just with a shot at "1,500 USDC" first.
  const symbol = originToken?.symbol;
  const decimals = originToken?.decimals;
  const formattedAmount = ictt?.amount ? formatTokenAmount(ictt.amount, decimals) : null;

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 2 }}>
      <span style={{ fontSize: 12.5, color: "var(--ink-2)", fontWeight: 500 }}>{event}</span>

      {ictt ? (
        <span
          style={{
            display: "inline-flex",
            alignItems: "center",
            gap: 6,
            fontSize: 11,
            color: "var(--ink-3)",
            flexWrap: "wrap",
          }}
        >
          <Chip tone={icttChipTone(ictt.family)}>
            {`${ictt.protocol} ${shortKindLabel(ictt.kindLabel)}`}
          </Chip>
          {formattedAmount ? (
            <span className="mono" style={{ color: "var(--ink-2)" }}>
              {formattedAmount}
              {symbol ? <span style={{ color: "var(--ink-3)" }}>{` ${symbol}`}</span> : null}
            </span>
          ) : null}
          {ictt.recipient ? (
            <span className="mono" style={{ color: "var(--ink-4)" }}>
              {ictt.recipientIsContract ? "↳ contract " : "→ "}
              {ictt.recipient.slice(0, 8)}…{ictt.recipient.slice(-4)}
            </span>
          ) : null}
        </span>
      ) : null}

      {originSender || destinationAddress ? (
        <span
          className="mono"
          style={{
            fontSize: 10.5,
            color: "var(--ink-4)",
            display: "inline-flex",
            alignItems: "center",
            gap: 6,
          }}
        >
          {originSender ? (
            <>
              <span>from</span>
              <Hash value={originSender} length={6} tone="dim" href={`/address/${originSender}`} />
            </>
          ) : null}
          {destinationAddress ? (
            <>
              <span>→</span>
              <Hash
                value={destinationAddress}
                length={6}
                tone="dim"
                href={`/address/${destinationAddress}`}
              />
            </>
          ) : null}
        </span>
      ) : null}
    </div>
  );
}

function shortKindLabel(label: string): string {
  // "SingleHopSendMessage" → "SingleHop · Send"; keeps the chip narrow.
  return label
    .replace(/Message$/, "")
    .replace(/^([A-Z])/, " $1")
    .replace(/([A-Z][a-z]+)([A-Z])/g, "$1 $2")
    .trim();
}

function icttChipTone(family: NonNullable<ReturnType<typeof summarizeICTT>>["family"]) {
  switch (family) {
    case "send":
      return "good" as const;
    case "call":
      return "steel" as const;
    case "register":
      return "bad" as const;
    default:
      return "default" as const;
  }
}

// ---------------------------------------------------------------------------
// Direction (preserved from the previous design — kept verbatim)
// ---------------------------------------------------------------------------

type ChainSide = {
  id?: string;
  name?: string;
  cb58?: string;
  isLocal: boolean;
};

type Direction = {
  source: ChainSide;
  destination: ChainSide;
};

function describeDirection(m: ICMMessage, local: string | undefined): Direction {
  const sourceLocal = !!local && !!m.sourceBlockchainId && eqHex(m.sourceBlockchainId, local);
  const destLocal =
    !!local && !!m.destinationBlockchainId && eqHex(m.destinationBlockchainId, local);
  return {
    source: {
      id: m.sourceBlockchainId,
      name: m.sourceBlockchainName,
      cb58: m.sourceBlockchainCb58,
      isLocal: sourceLocal,
    },
    destination: {
      id: m.destinationBlockchainId,
      name: m.destinationBlockchainName,
      cb58: m.destinationBlockchainCb58,
      isLocal: destLocal,
    },
  };
}

function DirectionCell({ direction }: { direction: Direction }) {
  const { source, destination } = direction;
  if (!source.id && !source.name && !destination.id && !destination.name) {
    return (
      <span className="mono" style={{ fontSize: 11.5, color: "var(--ink-4)" }}>
        —
      </span>
    );
  }
  return (
    <div
      style={{
        display: "grid",
        gridTemplateColumns: "1fr auto 1fr",
        alignItems: "center",
        gap: 8,
      }}
    >
      <ChainCell side={source} />
      <svg width="10" height="10" viewBox="0 0 10 10" aria-hidden>
        <path
          d="M2 5h6m0 0L6 3m2 2L6 7"
          stroke="var(--ink-3)"
          strokeWidth="1.3"
          fill="none"
          strokeLinecap="round"
        />
      </svg>
      <ChainCell side={destination} />
    </div>
  );
}

function ChainCell({ side }: { side: ChainSide }) {
  if (!side.id && !side.name) {
    return (
      <span className="mono" style={{ fontSize: 11, color: "var(--ink-4)" }}>
        —
      </span>
    );
  }
  const label = side.name ?? (side.id ? truncateBytes32(side.id) : "?");
  const titleParts = [side.cb58, side.id].filter(Boolean);
  return (
    <span
      className="mono"
      title={titleParts.join(" / ")}
      style={{
        fontSize: 11.5,
        color: side.isLocal || side.name ? "var(--ink)" : "var(--ink-3)",
        fontWeight: side.isLocal ? 500 : 400,
        overflow: "hidden",
        textOverflow: "ellipsis",
        whiteSpace: "nowrap",
      }}
    >
      {label}
    </span>
  );
}

function msgKey(m: ICMMessage): string {
  return `${m.transactionHash}-${m.logIndex}`;
}

function eqHex(a: string, b: string): boolean {
  return a.toLowerCase() === b.toLowerCase();
}

function truncateBytes32(id: string): string {
  if (id.length <= 14) return id;
  return `${id.slice(0, 8)}…${id.slice(-4)}`;
}

// ---------------------------------------------------------------------------
// Dashboard sub-components
// ---------------------------------------------------------------------------

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
 * Highlight card for the busiest route — paired with the KPI grid in
 * the dashboard hero row. Mirrors blocks/page.tsx's LiveBlocksList
 * placement so the visual rhythm is the same.
 */
function TopRouteCard({
  route,
  activeName,
  loading,
}: {
  route: ICMRoute | undefined;
  activeName?: string;
  loading: boolean;
}) {
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
          <span style={{ fontSize: 12, fontWeight: 500 }}>Busiest route</span>
        </div>
        <span className="mono" style={{ fontSize: 11, color: "var(--ink-4)" }}>
          rank #1
        </span>
      </div>
      <div style={{ padding: "18px 18px 20px" }}>
        {loading ? (
          <Skeleton className="h-[80px] w-full" />
        ) : !route ? (
          <div style={{ color: "var(--ink-4)", fontSize: 13, padding: "12px 0" }}>
            No route activity in this window. Try widening it, or wait for cross-chain traffic to
            land on this L1.
          </div>
        ) : (
          <>
            <div
              className="flex items-center gap-2 mb-2.5"
              style={{ fontSize: 14, color: "var(--ink)" }}
            >
              <RouteSide
                name={routeSideName(route, "source", activeName)}
                isLocal={route.direction === "outbound"}
              />
              <DirectionArrow />
              <RouteSide
                name={routeSideName(route, "destination", activeName)}
                isLocal={route.direction === "inbound"}
              />
            </div>
            <div
              className="flex items-baseline gap-3"
              style={{ fontSize: 28, color: "var(--ink)", lineHeight: 1.1 }}
            >
              <span className="h-display">
                <AnimatedNumber value={route.eventCount} />
              </span>
              <span style={{ fontSize: 12, color: "var(--ink-3)" }}>events</span>
            </div>
            <div
              className="mono mt-1.5"
              style={{ fontSize: 11, color: "var(--ink-4)", display: "flex", gap: 12 }}
            >
              <span>
                <span style={{ color: "var(--ink-3)" }}>{formatNumber(route.messageCount)}</span>{" "}
                msg
              </span>
              <span>{formatRelativeTime(route.lastMessageAt)}</span>
              <span>
                <Chip tone={route.direction === "outbound" ? "steel" : "good"}>
                  {route.direction}
                </Chip>
              </span>
            </div>
          </>
        )}
      </div>
    </div>
  );
}

function RoutesSection({
  routes,
  activeName,
  loading,
  windowSel,
}: {
  routes: ICMRoute[];
  activeName?: string;
  loading: boolean;
  windowSel: ICMWindow;
}) {
  return (
    <div className="card border border-line rounded-[10px] bg-bg-elev mb-9" style={{ padding: 0 }}>
      <div
        className="flex items-baseline justify-between border-b border-line"
        style={{ padding: "14px 18px" }}
      >
        <div className="eyebrow">Routes · {windowLabel(windowSel)}</div>
        <span className="mono" style={{ fontSize: 11, color: "var(--ink-4)" }}>
          {loading
            ? "loading…"
            : `${formatNumber(routes.length)} pair${routes.length === 1 ? "" : "s"}`}
        </span>
      </div>
      <div className="overflow-x-auto">
        <table className="lat-tbl">
          <thead>
            <tr>
              <th style={{ width: 110 }}>Direction</th>
              <th>Source → Destination</th>
              <th className="hidden md:table-cell" align="right" style={{ width: 130 }}>
                Events
              </th>
              <th className="hidden md:table-cell" align="right" style={{ width: 130 }}>
                Messages
              </th>
              <th align="right" style={{ width: 130 }}>
                Last seen
              </th>
            </tr>
          </thead>
          <tbody>
            {loading ? (
              Array.from({ length: 5 }).map((_, i) => (
                <tr key={i}>
                  <td colSpan={5}>
                    <Skeleton className="h-4 w-full" />
                  </td>
                </tr>
              ))
            ) : routes.length === 0 ? (
              <tr>
                <td colSpan={5} className="text-center py-10" style={{ color: "var(--ink-4)" }}>
                  No routes in this window.
                </td>
              </tr>
            ) : (
              routes.map((r, i) => (
                <RouteRow key={routeKey(r, i)} route={r} activeName={activeName} />
              ))
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}

/**
 * Top tokens transferred via ICTT in the selected window. Reads the
 * /v1/icm/tokens endpoint; volumes are summed in big.Int on the
 * backend so precision survives. Frontend renders with token decimals
 * (server-resolved via eth_call) and falls back to compact-bigint
 * when the upstream RPC didn't have the metadata.
 */
function TokensSection({
  tokens,
  truncated,
  sampled,
  loading,
  windowSel,
}: {
  tokens: ICTTTokenVolume[];
  truncated: boolean;
  sampled?: number;
  loading: boolean;
  windowSel: ICMWindow;
}) {
  return (
    <div className="card border border-line rounded-[10px] bg-bg-elev mb-9" style={{ padding: 0 }}>
      <div
        className="flex items-baseline justify-between border-b border-line"
        style={{ padding: "14px 18px" }}
      >
        <div className="eyebrow">Tokens transferred · {windowLabel(windowSel)}</div>
        <span className="mono" style={{ fontSize: 11, color: "var(--ink-4)" }}>
          {loading
            ? "loading…"
            : truncated && sampled
              ? `top of ${formatNumber(sampled)} sampled · truncated`
              : sampled != null
                ? `over ${formatNumber(sampled)} ICTT events`
                : `${formatNumber(tokens.length)} token${tokens.length === 1 ? "" : "s"}`}
        </span>
      </div>
      <div className="overflow-x-auto">
        <table className="lat-tbl">
          <thead>
            <tr>
              <th style={{ width: 56 }}>#</th>
              <th>Token</th>
              <th align="right" style={{ width: 220 }}>
                Volume
              </th>
              <th className="hidden md:table-cell" align="right" style={{ width: 130 }}>
                Transfers
              </th>
            </tr>
          </thead>
          <tbody>
            {loading ? (
              Array.from({ length: 4 }).map((_, i) => (
                <tr key={i}>
                  <td colSpan={4}>
                    <Skeleton className="h-4 w-full" />
                  </td>
                </tr>
              ))
            ) : tokens.length === 0 ? (
              <tr>
                <td colSpan={4} className="text-center py-10" style={{ color: "var(--ink-4)" }}>
                  No ICTT transfers in this window. Custom (non-ICTT) cross-chain calls don&apos;t
                  carry a token amount, so they aren&apos;t aggregated here.
                </td>
              </tr>
            ) : (
              tokens.map((t, i) => <TokenRow key={t.address} rank={i + 1} token={t} />)
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}

function TokenRow({ rank, token }: { rank: number; token: ICTTTokenVolume }) {
  const symbol = token.symbol || null;
  const name = token.name || null;
  const display = symbol ? `${symbol}${name && name !== symbol ? ` · ${name}` : ""}` : null;
  return (
    <tr>
      <td className="mono" style={{ color: "var(--ink-4)" }}>
        {rank}
      </td>
      <td>
        <div style={{ display: "flex", flexDirection: "column", gap: 2 }}>
          {display ? (
            <span style={{ fontSize: 12.5, color: "var(--ink-2)", fontWeight: 500 }}>
              {display}
            </span>
          ) : (
            <span className="mono" style={{ fontSize: 11.5, color: "var(--ink-3)" }}>
              unresolved
            </span>
          )}
          <Hash value={token.address} length={12} tone="dim" href={`/address/${token.address}`} />
        </div>
      </td>
      <td className="mono" style={{ textAlign: "right" }}>
        <span style={{ color: "var(--ink)" }}>
          {formatTokenAmount(token.totalAmount, token.decimals)}
        </span>
        {symbol ? (
          <span style={{ color: "var(--ink-3)", marginLeft: 6, fontSize: 11.5 }}>{symbol}</span>
        ) : null}
      </td>
      <td
        className="mono hidden md:table-cell"
        style={{ textAlign: "right", color: "var(--ink-3)" }}
      >
        {formatNumber(token.messageCount)}
      </td>
    </tr>
  );
}

function RouteRow({ route, activeName }: { route: ICMRoute; activeName?: string }) {
  return (
    <tr>
      <td>
        <Chip tone={route.direction === "outbound" ? "steel" : "good"}>{route.direction}</Chip>
      </td>
      <td>
        <div
          style={{
            display: "grid",
            gridTemplateColumns: "1fr auto 1fr",
            alignItems: "center",
            gap: 8,
            maxWidth: 420,
          }}
        >
          <RouteSide
            name={routeSideName(route, "source", activeName)}
            isLocal={route.direction === "outbound"}
          />
          <DirectionArrow />
          <RouteSide
            name={routeSideName(route, "destination", activeName)}
            isLocal={route.direction === "inbound"}
          />
        </div>
      </td>
      <td className="mono hidden md:table-cell" style={{ textAlign: "right" }}>
        {formatNumber(route.eventCount)}
      </td>
      <td
        className="mono hidden md:table-cell"
        style={{ textAlign: "right", color: "var(--ink-3)" }}
      >
        {formatNumber(route.messageCount)}
      </td>
      <td className="mono" style={{ textAlign: "right", color: "var(--ink-4)" }}>
        {formatRelativeTime(route.lastMessageAt)}
      </td>
    </tr>
  );
}

function RouteSide({ name, isLocal }: { name: string; isLocal: boolean }) {
  return (
    <span
      className="mono"
      style={{
        fontSize: 12,
        color: isLocal ? "var(--ink)" : "var(--ink-3)",
        fontWeight: isLocal ? 500 : 400,
        overflow: "hidden",
        textOverflow: "ellipsis",
        whiteSpace: "nowrap",
      }}
    >
      {name}
    </span>
  );
}

function DirectionArrow() {
  return (
    <svg width="10" height="10" viewBox="0 0 10 10" aria-hidden>
      <path
        d="M2 5h6m0 0L6 3m2 2L6 7"
        stroke="var(--ink-3)"
        strokeWidth="1.3"
        fill="none"
        strokeLinecap="round"
      />
    </svg>
  );
}

// ---------------------------------------------------------------------------
// Pure helpers
// ---------------------------------------------------------------------------

/** Resolves the display label for one side of a route entry. The active
 *  chain ships with empty `*BlockchainId`, so we fall back through
 *  Name → CB58 short → activeName when relevant. */
function routeSideName(
  route: ICMRoute,
  side: "source" | "destination",
  activeName?: string,
): string {
  const id = side === "source" ? route.sourceBlockchainId : route.destinationBlockchainId;
  const name = side === "source" ? route.sourceBlockchainName : route.destinationBlockchainName;
  const cb58 = side === "source" ? route.sourceBlockchainCb58 : route.destinationBlockchainCb58;
  if (name) return name;
  if (cb58) return shortCB58(cb58);
  if (id) return truncateBytes32(id);
  return activeName ?? "?";
}

function shortCB58(cb58: string): string {
  if (cb58.length <= 12) return cb58;
  return `${cb58.slice(0, 6)}…${cb58.slice(-4)}`;
}

function routeKey(r: ICMRoute, i: number): string {
  const a = r.sourceBlockchainId ?? r.sourceBlockchainCb58 ?? "us";
  const b = r.destinationBlockchainId ?? r.destinationBlockchainCb58 ?? "us";
  return `${r.direction}-${a}-${b}-${i}`;
}

function seriesToPoints(series: ICMTimeseriesPoint[] | undefined): number[] {
  if (!series || series.length === 0) return [];
  return series.map((p) => p.eventCount);
}

function routesToBars(routes: ICMRoute[]): Bar[] {
  // Top-N as bars; label compacted to a chain pair so it stays narrow.
  const max = 8;
  const slice = routes.slice(0, max);
  return slice.map((r) => {
    const src = r.sourceBlockchainName ?? "us";
    const dst = r.destinationBlockchainName ?? "us";
    const label = `${shortName(src)}→${shortName(dst)}`;
    return { label, value: r.eventCount };
  });
}

function shortName(s: string): string {
  if (s.length <= 6) return s;
  return s.slice(0, 5) + "…";
}

function windowLabel(w: ICMWindow): string {
  switch (w) {
    case "1h":
      return "last 1h";
    case "6h":
      return "last 6h";
    case "24h":
      return "last 24h";
    case "7d":
      return "last 7d";
    case "30d":
      return "last 30d";
  }
}
