"use client";

import { use, useState } from "react";
import Link from "next/link";
import { useChain, useTransaction } from "@/lib/api/queries";
import type { Log, Trace, Transaction } from "@/lib/api/types";
import { Hash } from "@/components/lattice/hash";
import { Chip } from "@/components/lattice/chip";
import { MethodChip } from "@/components/lattice/method-chip";
import { Skeleton } from "@/components/ui/skeleton";
import { formatGwei, formatNativeAmount, formatNumber, formatRelativeTime } from "@/lib/format";

type TabId = "overview" | "logs" | "trace" | "raw";

export default function TransactionDetailPage({ params }: { params: Promise<{ hash: string }> }) {
  const { hash } = use(params);
  const { data: tx, isPending, error } = useTransaction(hash);
  const { data: chain } = useChain();
  const [tab, setTab] = useState<TabId>("overview");

  const symbol = chain?.nativeToken.symbol ?? "";

  if (error) {
    const notFound = /not[_ ]?found/i.test(error.message);
    return (
      <div className="px-10 py-8 pb-12 max-w-[1080px] mx-auto">
        <Link
          href="/transactions"
          style={{
            fontSize: 12,
            color: "var(--ink-4)",
            textDecoration: "none",
            display: "inline-block",
            marginBottom: 16,
          }}
        >
          ← All transactions
        </Link>
        <div className="eyebrow mb-2.5">◆ Transaction</div>
        <div className="h-display mb-2" style={{ fontSize: 32 }}>
          {notFound ? "Not found" : "Couldn't load transaction"}
        </div>
        <div
          className="mono"
          style={{
            fontSize: 12.5,
            color: "var(--ink-3)",
            wordBreak: "break-all",
            marginBottom: 16,
          }}
        >
          {hash}
        </div>
        {notFound ? (
          <div
            style={{
              fontSize: 13.5,
              color: "var(--ink-3)",
              maxWidth: 640,
              marginBottom: 20,
              lineHeight: 1.55,
            }}
          >
            firn doesn&apos;t have this transaction in its index. If you&apos;re running{" "}
            <code className="mono" style={{ fontSize: 12 }}>
              -store=mem
            </code>
            , the index resets every time firn restarts — old cached entries in your browser may
            point at transactions that no longer exist. Refreshing the page should reconcile.
          </div>
        ) : (
          <div
            className="mono"
            style={{
              fontSize: 11.5,
              color: "var(--ink-4)",
              maxWidth: 640,
              marginBottom: 20,
              wordBreak: "break-all",
            }}
          >
            {error.message}
          </div>
        )}
        <Link href="/transactions" className="lat-btn">
          See latest transactions →
        </Link>
      </div>
    );
  }

  return (
    <div className="px-10 py-8 pb-12 max-w-[1080px] mx-auto">
      <div className="eyebrow mb-2.5">◆ Transaction</div>

      {/* Headline */}
      <div className="flex items-start gap-3.5 mb-[22px] flex-wrap">
        <span
          className="h-display mono"
          style={{
            fontSize: 18,
            lineHeight: 1.2,
            wordBreak: "break-all",
            flex: "1 1 auto",
            minWidth: 0,
          }}
        >
          {tx ? tx.hash : <Skeleton className="h-6 w-48" />}
        </span>
        {tx ? (
          <Chip tone={tx.status === "success" ? "good" : "bad"}>
            {tx.status === "success" ? "✓ Success" : "✗ Failed"}
          </Chip>
        ) : null}
        {tx ? <Chip>Finalized</Chip> : null}
      </div>

      {/* Headline summary card */}
      <div
        className="card border border-line rounded-[10px] bg-bg-elev"
        style={{ padding: "24px 28px", marginBottom: 28 }}
      >
        <div className="eyebrow" style={{ marginBottom: 6 }}>
          Summary
        </div>
        {isPending ? (
          <Skeleton className="h-9 w-full" />
        ) : tx ? (
          <>
            <div
              style={{
                fontFamily: "var(--font-display), ui-sans-serif, system-ui, sans-serif",
                fontSize: 26,
                fontWeight: 500,
                lineHeight: 1.25,
                letterSpacing: "-0.015em",
              }}
            >
              <span style={{ color: "var(--ink-3)" }}>Account</span>{" "}
              <span className="mono" style={{ fontSize: 16, wordBreak: "break-all" }}>
                {tx.from}
              </span>{" "}
              <span style={{ color: "var(--ink-3)" }}>
                {tx.to ? "called" : "deployed a contract via"}
              </span>
              {tx.to ? (
                <>
                  {" "}
                  <span style={{ color: "var(--accent-ink)" }}>
                    {tx.method.name ?? tx.method.selector}
                  </span>{" "}
                  <span style={{ color: "var(--ink-3)" }}>on</span>{" "}
                  <span className="mono" style={{ fontSize: 16, wordBreak: "break-all" }}>
                    {tx.to}
                  </span>
                </>
              ) : null}
              {BigInt(tx.value || "0") > 0n ? (
                <>
                  {" "}
                  <span style={{ color: "var(--ink-3)" }}>transferring</span>{" "}
                  <span>{formatNativeAmount(tx.value, symbol)}</span>
                </>
              ) : null}
              <span style={{ color: "var(--ink-3)" }}>.</span>
            </div>
            <div
              style={{
                fontSize: 12.5,
                color: "var(--ink-4)",
                marginTop: 14,
                fontFamily: "var(--font-mono), ui-monospace, monospace",
              }}
            >
              Block{" "}
              <Link
                href={`/blocks/${tx.block.number}`}
                style={{ color: "var(--accent-ink)", textDecoration: "none" }}
              >
                {formatNumber(tx.block.number)}
              </Link>{" "}
              · {formatRelativeTime(tx.block.timestamp)} · Gas {formatGwei(tx.gas.price)}
            </div>
          </>
        ) : null}
      </div>

      {/* Tabs */}
      <Tabs
        active={tab}
        onChange={setTab}
        tabs={[
          { id: "overview", label: "Overview" },
          { id: "logs", label: "Logs", count: tx?.logsCount },
          { id: "trace", label: "Trace", count: tx?.tracesCount },
          { id: "raw", label: "Raw" },
        ]}
      />

      {tab === "overview" && (
        <div
          style={{
            marginTop: 28,
            display: "grid",
            gridTemplateColumns: "180px 1fr",
            rowGap: 18,
            columnGap: 32,
          }}
        >
          {isPending ? (
            Array.from({ length: 9 }).map((_, i) => (
              <DetailRow key={i} label={<Skeleton className="h-3 w-20" />}>
                <Skeleton className="h-4 w-72" />
              </DetailRow>
            ))
          ) : tx ? (
            <>
              <DetailRow label="Hash">
                <Hash value={tx.hash} tone="plain" length={0} showCopy />
              </DetailRow>
              <DetailRow label="Status">
                <Chip tone={tx.status === "success" ? "good" : "bad"}>
                  {tx.status === "success" ? "✓ Success" : "✗ Failed"}
                </Chip>
              </DetailRow>
              <DetailRow label="Block">
                <Link
                  href={`/blocks/${tx.block.number}`}
                  style={{
                    color: "var(--accent-ink)",
                    textDecoration: "none",
                    fontFamily: "var(--font-mono), ui-monospace, monospace",
                    fontSize: 13,
                  }}
                >
                  {formatNumber(tx.block.number)}
                </Link>
              </DetailRow>
              <DetailRow label="Timestamp">
                <span className="mono" style={{ fontSize: 12.5 }}>
                  {new Date(tx.block.timestamp).toUTCString().replace("GMT", "UTC")}{" "}
                  <span style={{ color: "var(--ink-4)" }}>
                    · {formatRelativeTime(tx.block.timestamp)}
                  </span>
                </span>
              </DetailRow>
              <DetailRow label="From">
                <Hash
                  value={tx.from}
                  tone="link"
                  length={0}
                  href={`/address/${tx.from}`}
                  showCopy
                />
              </DetailRow>
              <DetailRow label="Interaction">
                {tx.to ? (
                  <Hash value={tx.to} tone="link" length={0} href={`/address/${tx.to}`} showCopy />
                ) : (
                  <Chip tone="steel">Contract creation</Chip>
                )}
              </DetailRow>
              <DetailRow label="Value">
                <span className="mono" style={{ fontSize: 13 }}>
                  {formatNativeAmount(tx.value, symbol)}
                </span>
              </DetailRow>
              <DetailRow label="Method">
                {tx.method.selector && tx.method.selector !== "0x" ? (
                  <MethodChip selector={tx.method.selector} to={tx.to} firnName={tx.method.name} />
                ) : (
                  <span style={{ color: "var(--ink-4)" }}>—</span>
                )}
              </DetailRow>
              <DetailRow label="Gas">
                <span className="mono" style={{ fontSize: 12.5 }}>
                  {formatNumber(tx.gas.used)} / {formatNumber(tx.gas.limit)} ·{" "}
                  {formatGwei(tx.gas.price)} ·{" "}
                  <span style={{ color: "var(--ink-2)" }}>
                    {formatTxFee(tx.gas.used, tx.gas.price, symbol)}
                  </span>
                </span>
              </DetailRow>
              <DetailRow label="Nonce">
                <span className="mono" style={{ fontSize: 13 }}>
                  {tx.nonce}
                </span>
              </DetailRow>
            </>
          ) : null}
        </div>
      )}

      {tab === "logs" && (
        <div style={{ marginTop: 24 }}>
          {isPending ? (
            <Skeleton className="h-20 w-full mb-3" />
          ) : tx?.logs && tx.logs.length > 0 ? (
            tx.logs.map((log) => <LogCard key={log.logIndex} log={log} />)
          ) : (
            <div
              className="card border border-line rounded-[10px] bg-bg-elev"
              style={{ padding: 24, color: "var(--ink-3)", fontSize: 13 }}
            >
              No event logs were emitted by this transaction.
            </div>
          )}
        </div>
      )}

      {tab === "trace" && (
        <div style={{ marginTop: 24 }}>
          {isPending ? (
            <Skeleton className="h-32 w-full" />
          ) : tx?.traces && tx.traces.length > 0 ? (
            <div
              className="card border border-line rounded-[10px]"
              style={{
                padding: 24,
                fontFamily: "var(--font-mono), ui-monospace, monospace",
                fontSize: 12.5,
                lineHeight: 1.7,
                background: "var(--bg-sunken)",
                overflow: "auto",
              }}
            >
              {tx.traces.map((trace, i) => (
                <TraceLine key={i} trace={trace} />
              ))}
            </div>
          ) : (
            <div
              className="card border border-line rounded-[10px] bg-bg-elev"
              style={{ padding: 24, color: "var(--ink-3)", fontSize: 13 }}
            >
              No internal calls were recorded for this transaction.
            </div>
          )}
        </div>
      )}

      {tab === "raw" && (
        <pre
          style={{
            marginTop: 24,
            padding: 24,
            background: "var(--bg-sunken)",
            borderRadius: 10,
            fontSize: 12,
            color: "var(--ink-2)",
            overflow: "auto",
            border: "1px solid var(--line)",
            fontFamily: "var(--font-mono), ui-monospace, monospace",
          }}
        >
          {tx ? JSON.stringify(rawTx(tx), null, 2) : "Loading…"}
        </pre>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Sub-components
// ---------------------------------------------------------------------------

function LogCard({ log }: { log: Log }) {
  const [open, setOpen] = useState(false);
  const eventSig = log.topics[0] ?? "";
  const indexed = log.topics.slice(1);

  return (
    <div
      className="card border border-line rounded-[10px] bg-bg-elev"
      style={{ marginBottom: 10, overflow: "hidden" }}
    >
      <div
        onClick={() => setOpen((v) => !v)}
        style={{
          display: "grid",
          gridTemplateColumns: "40px 1fr auto",
          alignItems: "center",
          gap: 14,
          padding: "14px 18px",
          cursor: "pointer",
        }}
      >
        <div className="mono" style={{ fontSize: 12, color: "var(--ink-4)" }}>
          #{log.logIndex}
        </div>
        <div>
          <div
            className="mono"
            style={{
              fontSize: 12.5,
              color: "var(--ink-2)",
              wordBreak: "break-all",
            }}
          >
            {eventSig || <span style={{ color: "var(--ink-4)" }}>(no topic)</span>}
          </div>
          <div className="mono" style={{ fontSize: 11.5, color: "var(--ink-4)" }}>
            at <Hash value={log.address} tone="dim" length={0} />
          </div>
        </div>
        <svg
          width="12"
          height="12"
          viewBox="0 0 12 12"
          style={{
            transform: open ? "rotate(180deg)" : "",
            transition: "transform .2s",
            color: "var(--ink-4)",
          }}
        >
          <path
            d="M3 5l3 3 3-3"
            stroke="currentColor"
            strokeWidth="1.4"
            fill="none"
            strokeLinecap="round"
          />
        </svg>
      </div>
      {open && (
        <div
          style={{
            background: "var(--bg-sunken)",
            padding: "14px 18px 18px 56px",
            borderTop: "1px solid var(--line-soft)",
          }}
        >
          {indexed.length > 0
            ? indexed.map((t, i) => (
                <div
                  key={i}
                  style={{
                    display: "grid",
                    gridTemplateColumns: "120px 1fr",
                    gap: 16,
                    marginBottom: 6,
                    fontSize: 12,
                  }}
                >
                  <span
                    style={{
                      color: "var(--ink-4)",
                      fontFamily: "var(--font-mono), ui-monospace, monospace",
                    }}
                  >
                    topic[{i + 1}]
                  </span>
                  <span className="mono" style={{ color: "var(--ink-2)", wordBreak: "break-all" }}>
                    {t}
                  </span>
                </div>
              ))
            : null}
          <div
            style={{
              display: "grid",
              gridTemplateColumns: "120px 1fr",
              gap: 16,
              marginTop: indexed.length ? 10 : 0,
              fontSize: 12,
            }}
          >
            <span
              style={{
                color: "var(--ink-4)",
                fontFamily: "var(--font-mono), ui-monospace, monospace",
              }}
            >
              data
            </span>
            <span className="mono" style={{ color: "var(--ink-2)", wordBreak: "break-all" }}>
              {log.data || "0x"}
            </span>
          </div>
        </div>
      )}
    </div>
  );
}

function TraceLine({ trace }: { trace: Trace }) {
  const depth = trace.traceAddress.length;
  return (
    <div style={{ paddingLeft: depth * 24 }}>
      {depth > 0 ? <span style={{ color: "var(--ink-4)" }}>↳ </span> : null}
      <span style={{ color: "var(--ink-3)" }}>{trace.callType.toUpperCase()}</span>{" "}
      <span className="mono" style={{ color: "var(--accent-ink)", wordBreak: "break-all" }}>
        {trace.to ? trace.to : "create"}
      </span>
      <span style={{ color: "var(--ink-4)" }}> from </span>
      <span className="mono" style={{ wordBreak: "break-all" }}>
        {trace.from}
      </span>
      {BigInt(trace.value || "0") > 0n ? (
        <span style={{ color: "var(--ink-3)" }}> · value {trace.value}</span>
      ) : null}
      <span style={{ color: "var(--ink-4)" }}> // {formatNumber(trace.gasUsed)} gas</span>
    </div>
  );
}

function DetailRow({ label, children }: { label: React.ReactNode; children: React.ReactNode }) {
  return (
    <>
      <div
        style={{
          fontSize: 12,
          color: "var(--ink-4)",
          textTransform: "uppercase",
          letterSpacing: "0.05em",
          fontFamily: "var(--font-mono), ui-monospace, monospace",
        }}
      >
        {label}
      </div>
      <div style={{ fontSize: 13.5 }}>{children}</div>
    </>
  );
}

function Tabs<T extends string>({
  active,
  onChange,
  tabs,
}: {
  active: T;
  onChange: (id: T) => void;
  tabs: { id: T; label: string; count?: number }[];
}) {
  return (
    <div
      style={{
        display: "flex",
        gap: 0,
        borderBottom: "1px solid var(--line)",
      }}
    >
      {tabs.map((t) => {
        const isActive = t.id === active;
        return (
          <button
            key={t.id}
            type="button"
            onClick={() => onChange(t.id)}
            style={{
              background: "none",
              border: "none",
              padding: "12px 18px",
              fontSize: 13,
              fontWeight: 500,
              color: isActive ? "var(--ink)" : "var(--ink-4)",
              borderBottom: isActive ? "1.5px solid var(--ink)" : "1.5px solid transparent",
              marginBottom: -1,
              cursor: "pointer",
              fontFamily: "inherit",
            }}
          >
            {t.label}
            {typeof t.count === "number" ? (
              <span
                className="mono"
                style={{
                  marginLeft: 6,
                  fontSize: 11,
                  color: "var(--ink-4)",
                  fontWeight: 400,
                }}
              >
                {formatNumber(t.count)}
              </span>
            ) : null}
          </button>
        );
      })}
    </div>
  );
}

function formatTxFee(gasUsed: number, gasPriceWei: string, symbol: string): string {
  try {
    const wei = BigInt(gasPriceWei) * BigInt(gasUsed);
    return formatNativeAmount(wei.toString(), symbol);
  } catch {
    return "—";
  }
}

function rawTx(tx: Transaction) {
  // Strip the expanded-only fields so the "raw" view shows the canonical shape.
  const { logs: _logs, traces: _traces, ...rest } = tx;
  void _logs;
  void _traces;
  return rest;
}
