"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { Hash } from "@/components/lattice/hash";
import { Skeleton } from "@/components/ui/skeleton";
import { useTokens } from "@/lib/api/queries";
import { FilterBar, FilterInput } from "@/components/lattice/filter-bar";
import {
  SortableTh,
  applyDir,
  compareNumeric,
  compareString,
  type SortState,
} from "@/components/lattice/sortable-th";
import { formatNumber } from "@/lib/format";

type SortKey = "symbol" | "transfers" | "holders" | "firstSeen" | "address";

export default function TokensIndexPage() {
  const { data, isPending, error } = useTokens({ limit: 50 });
  const [q, setQ] = useState("");
  const [sort, setSort] = useState<SortState<SortKey> | null>({
    key: "transfers",
    dir: "desc",
  });

  const rows = useMemo(() => data?.data ?? [], [data]);

  const view = useMemo(() => {
    let out = rows;
    const term = q.trim().toLowerCase();
    if (term) {
      out = out.filter((t) => {
        if (t.address.toLowerCase().includes(term)) return true;
        if (t.symbol && t.symbol.toLowerCase().includes(term)) return true;
        if (t.name && t.name.toLowerCase().includes(term)) return true;
        return false;
      });
    }
    if (sort) {
      out = [...out].sort(
        applyDir((a, b) => {
          switch (sort.key) {
            case "symbol":
              return compareString(a.symbol ?? "", b.symbol ?? "");
            case "transfers":
              return compareNumeric(a.transferCount, b.transferCount);
            case "holders":
              return compareNumeric(a.holders, b.holders);
            case "firstSeen":
              return compareNumeric(a.firstSeenBlock, b.firstSeenBlock);
            case "address":
              return compareString(a.address, b.address);
          }
        }, sort.dir),
      );
    }
    return out;
  }, [rows, q, sort]);

  return (
    <div className="px-4 sm:px-6 lg:px-10 py-6 sm:py-8 pb-12">
      <div className="eyebrow mb-2.5">Tokens</div>
      <div className="h-display" style={{ fontSize: 56, marginBottom: 6 }}>
        {isPending ? <Skeleton className="h-[56px] w-[140px]" /> : formatNumber(rows.length)}
      </div>
      <div className="mb-7" style={{ fontSize: 14, color: "var(--ink-3)" }}>
        ERC-20 contracts detected via the canonical Transfer event topic. Names &amp; symbols
        populate from on-chain <code className="mono">name() / symbol() / decimals()</code> when the
        upstream RPC has them; otherwise the contract address is shown.
      </div>

      <FilterBar
        active={q.trim().length > 0}
        onReset={() => setQ("")}
        count={view ? `${formatNumber(view.length)} token${view.length === 1 ? "" : "s"}` : null}
      >
        <FilterInput
          value={q}
          onChange={setQ}
          placeholder="Filter by symbol, name, or address"
          ariaLabel="Filter tokens"
          monospace={false}
          width={320}
        />
      </FilterBar>

      {error ? (
        <div
          className="card border border-line rounded-[10px] bg-bg-elev"
          style={{ padding: "16px 18px", color: "var(--ink-3)", fontSize: 13 }}
        >
          Failed to load tokens: {String(error.message ?? error)}
        </div>
      ) : (
        <div className="card border border-line rounded-[10px] bg-bg-elev overflow-x-auto">
          <table className="lat-tbl">
            <thead>
              <tr>
                <SortableTh<SortKey> k="address" active={sort} onSort={setSort}>
                  Address
                </SortableTh>
                <SortableTh<SortKey> k="symbol" active={sort} onSort={setSort}>
                  Symbol
                </SortableTh>
                <SortableTh<SortKey>
                  k="transfers"
                  active={sort}
                  onSort={setSort}
                  align="right"
                  width={160}
                >
                  Transfers
                </SortableTh>
                <SortableTh<SortKey>
                  k="holders"
                  active={sort}
                  onSort={setSort}
                  align="right"
                  width={140}
                  className="hidden md:table-cell"
                >
                  Holders
                </SortableTh>
                <SortableTh<SortKey>
                  k="firstSeen"
                  active={sort}
                  onSort={setSort}
                  align="right"
                  width={140}
                  className="hidden md:table-cell"
                >
                  First seen
                </SortableTh>
              </tr>
            </thead>
            <tbody>
              {isPending && rows.length === 0 ? (
                Array.from({ length: 5 }).map((_, i) => (
                  <tr key={`skel-${i}`}>
                    <td colSpan={5}>
                      <Skeleton className="h-[18px] w-full" />
                    </td>
                  </tr>
                ))
              ) : view.length === 0 ? (
                <tr>
                  <td
                    colSpan={5}
                    style={{
                      color: "var(--ink-4)",
                      textAlign: "center",
                      padding: "32px 0",
                      fontSize: 13,
                    }}
                  >
                    {q.trim().length > 0 ? (
                      "No tokens match this filter."
                    ) : (
                      <>
                        No Transfer events indexed yet — wait for the chain to produce some, or hit
                        the API directly: <code className="mono">GET /v1/tokens</code>
                      </>
                    )}
                  </td>
                </tr>
              ) : (
                view.map((token) => (
                  <tr key={token.address}>
                    <td>
                      <Link href={`/tokens/${token.address}`} style={{ textDecoration: "none" }}>
                        <Hash value={token.address} length={20} tone="link" />
                      </Link>
                    </td>
                    <td className="mono" style={{ color: "var(--ink-2)" }}>
                      {token.symbol ?? <span style={{ color: "var(--ink-4)" }}>—</span>}
                    </td>
                    <td className="mono" style={{ textAlign: "right" }}>
                      {formatNumber(token.transferCount)}
                    </td>
                    <td className="mono hidden md:table-cell" style={{ textAlign: "right" }}>
                      {formatNumber(token.holders)}
                    </td>
                    <td
                      className="mono hidden md:table-cell"
                      style={{ textAlign: "right", color: "var(--ink-3)" }}
                    >
                      #{formatNumber(token.firstSeenBlock)}
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
