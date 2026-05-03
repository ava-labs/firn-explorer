"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { useChain, useICMMessages } from "@/lib/api/queries";
import { Hash } from "@/components/lattice/hash";
import { Chip } from "@/components/lattice/chip";
import { Skeleton } from "@/components/ui/skeleton";
import { PauseButton } from "@/components/lattice/pause-button";
import { ErrorBanner } from "@/components/page/error-banner";
import { FilterBar, FilterInput, FilterPillGroup } from "@/components/lattice/filter-bar";
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
import type { ICMKind, ICMMessage } from "@/lib/api/queries";

type KindFilter = "all" | "teleporter" | "warp";
type SortKey = "layer" | "event" | "block";

const KIND_OPTIONS = [
  { value: "all" as const, label: "All" },
  { value: "teleporter" as const, label: "Teleporter" },
  { value: "warp" as const, label: "Warp" },
];

export default function ICMPage() {
  const [filter, setFilter] = useState<KindFilter>("all");
  const [emitter, setEmitter] = useState("");
  const [messageId, setMessageId] = useState("");
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

  return (
    <div className="px-4 sm:px-6 lg:px-10 py-6 sm:py-8 pb-12">
      <div className="eyebrow mb-2.5">Cross-chain · ICM</div>
      <div className="flex items-baseline gap-3 mb-2">
        <span className="h-display" style={{ fontSize: 56 }}>
          Interchain messaging
        </span>
        <PauseButton feed="icm" />
      </div>
      <div className="mb-7" style={{ fontSize: 14, color: "var(--ink-3)", maxWidth: 720 }}>
        Avalanche Warp Messaging primitives and Teleporter application-layer messages, decoded
        straight from this L1&apos;s logs. Newest first.
      </div>

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
              <SortableTh<SortKey> k="event" active={sort} onSort={setSort} width={200}>
                Event
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
  return (
    <tr className={fresh ? "fresh-row" : undefined}>
      <td>
        <Chip tone={m.kind === "teleporter" ? "steel" : "default"}>
          {m.kind === "teleporter" ? "Teleporter" : "Warp"}
        </Chip>
      </td>
      <td>
        <span style={{ fontSize: 12.5, color: "var(--ink-2)", fontWeight: 500 }}>{m.event}</span>
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

type ChainSide = {
  /** Raw 32-byte hex from the event topic, when present. */
  id?: string;
  /** Human name from the resolver (P-Chain getBlockchains + primary
   *  network seeds). Falls back to truncated id when unknown. */
  name?: string;
  /** CB58 form (what P-Chain advertises) — same data as `id` in a
   *  different encoding; useful for tooltips + linking. */
  cb58?: string;
  /** True when this side is the active L1. The opposite side of every
   *  cross-chain message is implicit (we're on it), so the resolver
   *  stamps it with the active chain's name even when the event
   *  doesn't carry the bytes32. */
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
  // Empty when neither side has any signal — shouldn't happen post-
  // resolver but defensive.
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
  // No data at all — render an em-dash. This happens for events
  // where the implicit side wasn't resolved (rare; only when the
  // resolver hasn't yet hydrated against P-Chain).
  if (!side.id && !side.name) {
    return (
      <span className="mono" style={{ fontSize: 11, color: "var(--ink-4)" }}>
        —
      </span>
    );
  }
  // Prefer the human name when the resolver knew about the chain.
  // Fall back to the truncated bytes32 hex from the event topic.
  const label = side.name ?? (side.id ? truncateBytes32(side.id) : "?");
  // Tooltip shows the canonical CB58 form (what P-Chain advertises)
  // plus the bytes32 hex — operator-friendly for cross-referencing.
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
