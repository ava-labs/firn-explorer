"use client";

import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { useBlocks } from "@/lib/api/queries";
import { Hash } from "@/components/lattice/hash";
import { Skeleton } from "@/components/ui/skeleton";
import { PauseButton } from "@/components/lattice/pause-button";
import { FilterBar, FilterInput, FilterPillGroup } from "@/components/lattice/filter-bar";
import {
  SortableTh,
  applyDir,
  compareBig,
  compareDate,
  compareNumeric,
  type SortState,
} from "@/components/lattice/sortable-th";
import { formatNumber, formatRelativeTime } from "@/lib/format";

type SortKey = "number" | "txns" | "gas" | "validator" | "age";
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

  const blocks = page?.data;

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
      <div className="eyebrow mb-2.5">◆ Blocks</div>
      <div className="flex items-baseline gap-3 mb-2">
        <span className="h-display" style={{ fontSize: 56 }}>
          Latest blocks
        </span>
        <PauseButton feed="blocks" />
      </div>
      <div className="mb-7" style={{ fontSize: 14, color: "var(--ink-3)" }}>
        Streamed via WebSocket directly from the indexer. Filter the visible page or pause the
        stream while you read.
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

      {error ? (
        <div
          className="border rounded-md p-4 mb-6"
          style={{
            borderColor: "var(--accent-soft)",
            background: "var(--accent-soft)",
            color: "var(--accent-ink)",
            fontSize: 13,
          }}
        >
          <div style={{ fontWeight: 500, marginBottom: 4 }}>Couldn&apos;t load blocks</div>
          <div className="mono" style={{ fontSize: 11.5, color: "var(--ink-3)" }}>
            {error.message}
          </div>
        </div>
      ) : null}

      <div className="card border border-line rounded-[10px] bg-bg-elev">
        <table className="lat-tbl">
          <thead>
            <tr>
              <SortableTh<SortKey> k="number" active={sort} onSort={setSort} width={120}>
                Number
              </SortableTh>
              <th>Hash</th>
              <SortableTh<SortKey> k="txns" active={sort} onSort={setSort} align="right" width={80}>
                Txns
              </SortableTh>
              <SortableTh<SortKey> k="gas" active={sort} onSort={setSort} align="right" width={140}>
                Gas used
              </SortableTh>
              <SortableTh<SortKey> k="validator" active={sort} onSort={setSort}>
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
                  <td colSpan={6}>
                    <Skeleton className="h-4 w-full" />
                  </td>
                </tr>
              ))
            ) : view?.length ? (
              view.map((block) => (
                <tr
                  key={block.hash}
                  onClick={() => router.push(`/blocks/${block.number}`)}
                  style={{ cursor: "pointer" }}
                  role="link"
                  aria-label={`Block ${block.number}`}
                >
                  <td className="mono" style={{ color: "var(--ink)" }}>
                    #{formatNumber(block.number)}
                  </td>
                  <td>
                    <Hash
                      value={block.hash}
                      tone="link"
                      length={14}
                      href={`/blocks/${block.number}`}
                    />
                  </td>
                  <td className="mono" style={{ textAlign: "right", color: "var(--ink-2)" }}>
                    {block.transactionsCount}
                  </td>
                  <td className="mono" style={{ textAlign: "right" }}>
                    {formatNumber(block.gas.used)}
                  </td>
                  <td>
                    {block.miner ? (
                      <Hash
                        value={block.miner}
                        tone="dim"
                        length={8}
                        href={`/address/${block.miner}`}
                      />
                    ) : (
                      <span style={{ color: "var(--ink-4)" }}>—</span>
                    )}
                  </td>
                  <td className="mono" style={{ textAlign: "right", color: "var(--ink-4)" }}>
                    {formatRelativeTime(block.timestamp)}
                  </td>
                </tr>
              ))
            ) : (
              <tr>
                <td colSpan={6} className="text-center py-10" style={{ color: "var(--ink-4)" }}>
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
