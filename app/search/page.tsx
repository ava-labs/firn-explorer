"use client";

import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { Suspense, useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { getBlock, getTransaction } from "@/lib/api/generated/firn";
import { firnQueryKey } from "@/lib/api/generated-query-key";
import type { Block, Transaction } from "@/lib/api/queries";
import { Hash } from "@/components/lattice/hash";
import { Skeleton } from "@/components/ui/skeleton";
import { formatNativeAmount, formatNumber, formatRelativeTime } from "@/lib/format";
import { useChain } from "@/lib/api/queries";
import { ZERO_ADDRESS, ZERO_HASH32, isGenesisRef } from "@/lib/genesis";

// ---------------------------------------------------------------------------
// Pattern detection — pure, no firn calls. Drives the dispatch fan-out below.
// ---------------------------------------------------------------------------
type Pattern = {
  raw: string;
  isHash32: boolean; // 0x + 64 hex → block or tx hash
  isAddress: boolean; // 0x + 40 hex → EVM address
  blockNumber: number | null; // pure decimal → block height
  isGenesis: boolean; // raw matched a known genesis sentinel
};

function classify(input: string): Pattern {
  const raw = input.trim();
  const lower = raw.toLowerCase();
  const isHash32 = /^0x[0-9a-f]{64}$/.test(lower);
  const isAddress = /^0x[0-9a-f]{40}$/.test(lower);
  const blockNumber =
    /^\d+$/.test(raw) && raw.length > 0 && raw.length < 16 ? Number.parseInt(raw, 10) : null;
  return { raw, isHash32, isAddress, blockNumber, isGenesis: isGenesisRef(raw) };
}

// ---------------------------------------------------------------------------
// Per-type lookups. Each returns a normalized { match | null, isPending }.
// firn's GET /v1/search?q= is spec'd but unimplemented; we fan out instead.
// ---------------------------------------------------------------------------
function useBlockMatch(p: Pattern) {
  const candidate: string | number | null = p.isHash32
    ? p.raw
    : p.blockNumber != null
      ? p.blockNumber
      : null;
  return useQuery<Block | null>({
    queryKey: firnQueryKey(
      { id: candidate },
      { url: candidate != null ? `/v1/blocks/${candidate}` : "/v1/blocks/_" },
    ),
    queryFn: async () => {
      try {
        return (await getBlock(String(candidate))) as unknown as Block;
      } catch {
        return null;
      }
    },
    enabled: candidate != null,
    staleTime: 30_000,
    retry: false,
  });
}

function useTxMatch(p: Pattern) {
  return useQuery<Transaction | null>({
    queryKey: firnQueryKey({ hash: p.raw }, { url: `/v1/transactions/${p.raw}` }),
    queryFn: async () => {
      try {
        return (await getTransaction(p.raw)) as unknown as Transaction;
      } catch {
        return null;
      }
    },
    enabled: p.isHash32,
    staleTime: 30_000,
    retry: false,
  });
}

// ---------------------------------------------------------------------------
// Page
// ---------------------------------------------------------------------------
//
// Wrap the inner component (which calls useSearchParams) in a Suspense
// boundary at the export — Next.js 16 requires this for any /search-style
// page where the params are read on the client. Without the boundary the
// static prerender bails with `useSearchParams() should be wrapped in a
// suspense boundary`. See node_modules/next/dist/docs/01-app/03-api-
// reference/04-functions/use-search-params.md.
export default function SearchPage() {
  return (
    <Suspense fallback={null}>
      <SearchPageInner />
    </Suspense>
  );
}

function SearchPageInner() {
  const params = useSearchParams();
  const q = params.get("q") ?? "";
  const pattern = useMemo(() => classify(q), [q]);
  const { data: chain } = useChain();
  const symbol = chain?.nativeToken.symbol ?? "AVAX";

  const blockQ = useBlockMatch(pattern);
  const txQ = useTxMatch(pattern);

  const block = blockQ.data ?? null;
  const tx = txQ.data ?? null;
  const address = pattern.isAddress ? pattern.raw : null;

  // Derive group counts from settled results (a hash may resolve to a block
  // OR a tx — both lookups race; show whichever returns).
  const groups: Array<{
    type: "Block" | "Transaction" | "Address";
    count: number;
    pending: boolean;
  }> = [];

  const blockPending = pattern.isHash32 || pattern.blockNumber != null ? blockQ.isPending : false;
  const txPending = pattern.isHash32 ? txQ.isPending : false;

  if (block || blockPending)
    groups.push({ type: "Block", count: block ? 1 : 0, pending: blockPending });
  if (tx || txPending)
    groups.push({
      type: "Transaction",
      count: tx ? 1 : 0,
      pending: txPending,
    });
  if (address) groups.push({ type: "Address", count: 1, pending: false });

  const totalMatches = (block ? 1 : 0) + (tx ? 1 : 0) + (address ? 1 : 0);
  const anyPending = blockPending || txPending;
  const hasInput = q.trim().length > 0;
  const recognized =
    pattern.isHash32 || pattern.isAddress || pattern.blockNumber != null || pattern.isGenesis;

  return (
    <div className="px-4 sm:px-6 lg:px-10 py-6 sm:py-8 pb-12">
      <div className="mx-auto" style={{ maxWidth: 720 }}>
        <div className="eyebrow" style={{ marginBottom: 10 }}>
          Search results
        </div>
        <div className="h-display" style={{ fontSize: 32, marginBottom: 4 }}>
          &ldquo;
          <span className="mono" style={{ fontSize: 24 }}>
            {q || "—"}
          </span>
          &rdquo;
        </div>
        <div
          style={{
            fontSize: 13,
            color: "var(--ink-3)",
            marginBottom: 32,
          }}
        >
          {!hasInput
            ? "Enter an address, transaction hash, or block number to begin."
            : !recognized
              ? "Unrecognized format. Try a 0x address, 0x tx/block hash, or block number."
              : anyPending
                ? "Searching across blocks, transactions, and addresses…"
                : `${totalMatches} ${totalMatches === 1 ? "match" : "matches"} on ${chain?.name ?? "this L1"}`}
        </div>

        {/* Empty / unrecognized state */}
        {!hasInput || (!recognized && !anyPending) ? (
          <EmptyState recognized={recognized} hasInput={hasInput} />
        ) : null}

        {/* Genesis sentinel — surface block 0 for 0x0 hash, 0 address,
            literal "genesis", or block number 0. */}
        {pattern.isGenesis ? (
          <section style={{ marginBottom: 36 }}>
            <header
              style={{
                display: "flex",
                alignItems: "baseline",
                gap: 12,
                marginBottom: 14,
                paddingBottom: 8,
                borderBottom: "1px solid var(--line)",
              }}
            >
              <span className="eyebrow">Genesis</span>
              <span className="mono" style={{ fontSize: 11, color: "var(--ink-4)" }}>
                chain initialization
              </span>
            </header>
            <Link
              href="/blocks/0"
              style={{
                display: "block",
                padding: "16px 20px",
                border: "1px solid var(--line)",
                borderRadius: 10,
                background: "var(--bg-elev)",
                textDecoration: "none",
                color: "inherit",
              }}
            >
              <div style={{ fontSize: 14, marginBottom: 4 }}>Block 0 — Genesis</div>
              <div style={{ fontSize: 12, color: "var(--ink-3)" }}>
                {pattern.raw.toLowerCase() === ZERO_HASH32 ||
                pattern.raw.toLowerCase() === ZERO_ADDRESS
                  ? "0x000…000 is the null sentinel — used in mint events and unset references. The chain's actual zero-state is the genesis block."
                  : "View the chain's initial allocations, fee config, and fork timestamps."}
              </div>
            </Link>
          </section>
        ) : null}

        {/* Result groups */}
        {groups.map((group) => (
          <section key={group.type} style={{ marginBottom: 36 }}>
            <header
              style={{
                display: "flex",
                alignItems: "baseline",
                gap: 12,
                marginBottom: 14,
                paddingBottom: 8,
                borderBottom: "1px solid var(--line)",
              }}
            >
              <span className="eyebrow">{group.type}</span>
              <span className="mono" style={{ fontSize: 11, color: "var(--ink-4)" }}>
                {group.pending
                  ? "searching…"
                  : `${group.count} ${group.count === 1 ? "match" : "matches"}`}
              </span>
            </header>

            {group.type === "Block" ? (
              group.pending && !block ? (
                <SkeletonRow />
              ) : block ? (
                <BlockRow block={block} />
              ) : (
                <NoMatchRow label="No block with this hash or number." />
              )
            ) : null}

            {group.type === "Transaction" ? (
              group.pending && !tx ? (
                <SkeletonRow />
              ) : tx ? (
                <TxRow tx={tx} symbol={symbol} />
              ) : (
                <NoMatchRow label="No transaction with this hash." />
              )
            ) : null}

            {group.type === "Address" && address ? <AddressRow hash={address} /> : null}
          </section>
        ))}

        {/* Show "no matches found" when we ran lookups but came up empty. */}
        {hasInput && recognized && !anyPending && totalMatches === 0 ? (
          <div
            style={{
              fontSize: 13,
              color: "var(--ink-4)",
              padding: "32px 0",
              textAlign: "center",
              border: "1px dashed var(--line)",
              borderRadius: 10,
            }}
          >
            No on-chain entity matches that query.
          </div>
        ) : null}
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Row primitives — match the design spec's grid: 1fr | meta | meta | chevron
// ---------------------------------------------------------------------------
function rowStyle(): React.CSSProperties {
  return {
    display: "grid",
    gridTemplateColumns: "1fr auto auto",
    alignItems: "center",
    gap: 16,
    padding: "14px 0",
    borderBottom: "1px solid var(--line-soft)",
    textDecoration: "none",
    color: "inherit",
  };
}

function Chevron() {
  return (
    <svg width="12" height="12" viewBox="0 0 12 12" style={{ color: "var(--ink-4)" }} aria-hidden>
      <path
        d="M4 2l4 4-4 4"
        stroke="currentColor"
        strokeWidth="1.4"
        fill="none"
        strokeLinecap="round"
      />
    </svg>
  );
}

function BlockRow({ block }: { block: Block }) {
  return (
    <Link href={`/blocks/${block.number}`} style={rowStyle()}>
      <div>
        <div className="mono" style={{ fontSize: 14, color: "var(--ink)" }}>
          Block #{formatNumber(block.number)}
        </div>
        <div
          style={{
            fontSize: 12,
            color: "var(--ink-4)",
            marginTop: 4,
            fontFamily: "var(--font-mono)",
          }}
        >
          <Hash value={block.hash} tone="dim" length={20} /> · {block.transactionsCount}{" "}
          {block.transactionsCount === 1 ? "tx" : "txs"}
        </div>
      </div>
      <span className="mono" style={{ fontSize: 13, color: "var(--ink-2)" }}>
        {formatRelativeTime(block.timestamp)}
      </span>
      <Chevron />
    </Link>
  );
}

function TxRow({ tx, symbol }: { tx: Transaction; symbol: string }) {
  const fromShort = shortAddr(tx.from);
  const toShort = tx.to ? shortAddr(tx.to) : "contract create";
  return (
    <Link href={`/transactions/${tx.hash}`} style={rowStyle()}>
      <div>
        <Hash value={tx.hash} length={20} />
        <div
          style={{
            fontSize: 12,
            color: "var(--ink-4)",
            marginTop: 4,
            fontFamily: "var(--font-mono)",
          }}
        >
          {tx.method.name ?? tx.method.selector ?? "transfer"} · {fromShort} → {toShort}
        </div>
      </div>
      <span className="mono" style={{ fontSize: 13 }}>
        {formatNativeAmount(tx.value, symbol)}
      </span>
      <span className="mono" style={{ fontSize: 12, color: "var(--ink-4)" }}>
        {formatRelativeTime(tx.block.timestamp)}
      </span>
    </Link>
  );
}

function AddressRow({ hash }: { hash: string }) {
  // firn has no /v1/addresses/:hash endpoint yet, so we render a routing row
  // with no metadata. The dedicated address page (/address/[hash]) will fetch
  // any data it needs once that endpoint lands.
  return (
    <Link href={`/address/${hash}`} style={rowStyle()}>
      <div>
        <Hash value={hash} length={20} />
        <div
          style={{
            fontSize: 12,
            color: "var(--ink-4)",
            marginTop: 4,
            fontFamily: "var(--font-mono)",
          }}
        >
          Address · open profile
        </div>
      </div>
      <span className="mono" style={{ fontSize: 13, color: "var(--ink-4)" }}>
        —
      </span>
      <Chevron />
    </Link>
  );
}

function SkeletonRow() {
  return (
    <div style={rowStyle()}>
      <div>
        <Skeleton className="h-4 w-64" />
        <div style={{ marginTop: 6 }}>
          <Skeleton className="h-3 w-44" />
        </div>
      </div>
      <Skeleton className="h-4 w-16" />
      <Skeleton className="h-3 w-12" />
    </div>
  );
}

function NoMatchRow({ label }: { label: string }) {
  return (
    <div
      style={{
        ...rowStyle(),
        color: "var(--ink-4)",
        fontSize: 13,
        gridTemplateColumns: "1fr",
      }}
    >
      {label}
    </div>
  );
}

function EmptyState({ recognized, hasInput }: { recognized: boolean; hasInput: boolean }) {
  return (
    <div
      style={{
        border: "1px dashed var(--line)",
        borderRadius: 10,
        padding: "32px 24px",
        marginBottom: 24,
      }}
    >
      <div className="eyebrow" style={{ marginBottom: 10, color: "var(--ink-3)" }}>
        Searchable formats
      </div>
      <ul
        style={{
          listStyle: "none",
          padding: 0,
          margin: 0,
          fontSize: 13,
          color: "var(--ink-3)",
          lineHeight: 1.9,
        }}
      >
        <li>
          <span className="mono" style={{ color: "var(--ink-2)" }}>
            0x…
          </span>{" "}
          (40 hex chars) — address
        </li>
        <li>
          <span className="mono" style={{ color: "var(--ink-2)" }}>
            0x…
          </span>{" "}
          (64 hex chars) — block hash or transaction hash
        </li>
        <li>
          <span className="mono" style={{ color: "var(--ink-2)" }}>
            123456
          </span>{" "}
          — block number
        </li>
      </ul>
      {hasInput && !recognized ? (
        <div
          style={{
            fontSize: 12,
            color: "var(--ink-4)",
            marginTop: 18,
            fontFamily: "var(--font-mono)",
          }}
        >
          Token symbol and ENS-style domain search are not yet supported by the backend.
        </div>
      ) : null}
    </div>
  );
}

function shortAddr(a: string): string {
  if (a.length < 12) return a;
  return `${a.slice(0, 6)}…${a.slice(-4)}`;
}
