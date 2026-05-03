"use client";

import { use, useState } from "react";
import Link from "next/link";
import {
  useBlock,
  useBlockTransactions,
  useChain,
  useICMMessages,
  useProposerState,
} from "@/lib/api/queries";
import { Hash } from "@/components/lattice/hash";
import { Chip } from "@/components/lattice/chip";
import { MethodChip } from "@/components/lattice/method-chip";
import { Tabs } from "@/components/lattice/tabs";
import { DetailRow } from "@/components/page/detail-row";
import { ErrorBanner } from "@/components/page/error-banner";
import { KpiCell } from "@/components/page/kpi-cell";
import { NotFoundDetail } from "@/components/page/not-found-detail";
import { Skeleton } from "@/components/ui/skeleton";
import {
  formatBlockTime,
  formatGwei,
  formatNativeAmount,
  formatNumber,
  formatRelativeTime,
  formatTxFee,
  gasUtilization,
} from "@/lib/format";
import { decodeCorethExtra } from "@/lib/coreth-extra";
import type { ICMMessage } from "@/lib/api/queries";

type TabId = "overview" | "txs" | "icm" | "consensus";

export default function BlockDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  const { data: block, isPending, error } = useBlock(id);
  const { data: chain } = useChain();
  const [tab, setTab] = useState<TabId>("overview");

  // Fetch the block's transactions only when the user opens the Transactions
  // tab — saves a request on the default Details view. firn endpoint:
  //   GET /v1/blocks/<id>/transactions?limit=50
  const {
    data: blockTxs,
    isPending: txsPending,
    error: txsError,
  } = useBlockTransactions(id, { limit: 100 }, { enabled: tab === "txs" });

  const symbol = chain?.nativeToken.symbol ?? "";

  if (error) {
    return (
      <NotFoundDetail
        kind="Block"
        indexHref="/blocks"
        indexLabel="All blocks"
        actionLabel="See latest blocks →"
        identifier={id}
        error={error}
      />
    );
  }

  return (
    <div className="px-4 sm:px-6 lg:px-10 py-6 sm:py-8 pb-12 max-w-[1080px] mx-auto">
      <div className="eyebrow mb-2.5">Block</div>

      {/* Headline */}
      <div className="flex items-center gap-3.5 mb-2">
        <span className="h-display" style={{ fontSize: 56 }}>
          {block ? `#${formatNumber(block.number)}` : <Skeleton className="h-[56px] w-[280px]" />}
        </span>
        {block ? (
          <div className="flex items-center gap-1 ml-2">
            <PrevNextLink kind="prev" number={block.number} />
            <PrevNextLink kind="next" number={block.number} />
          </div>
        ) : null}
        {block ? <Chip tone="good">✓ Finalized</Chip> : null}
      </div>
      <div style={{ fontSize: 14, color: "var(--ink-3)", marginBottom: 28 }}>
        {block ? (
          <>
            Produced by{" "}
            {block.miner ? (
              <Hash value={block.miner} tone="link" length={0} href={`/address/${block.miner}`} />
            ) : (
              <span style={{ color: "var(--ink-4)" }}>—</span>
            )}{" "}
            · {block.transactionsCount} transactions · {formatRelativeTime(block.timestamp)}
          </>
        ) : (
          <Skeleton className="h-4 w-72" />
        )}
      </div>

      {/* Stat strip — 2-up on phones, 5-up at md+. */}
      <div
        className="grid grid-cols-2 md:grid-cols-5"
        style={{
          borderTop: "1px solid var(--line)",
          borderBottom: "1px solid var(--line)",
          marginBottom: 28,
        }}
      >
        <KpiCell
          valueSize={22}
          label="Transactions"
          value={block ? String(block.transactionsCount) : null}
          sub={block ? `${gasUtilization(block.gas)} gas used` : ""}
          divider
        />
        <KpiCell
          valueSize={22}
          label="Gas used"
          value={block ? formatNumber(block.gas.used) : null}
          sub={block ? `of ${formatNumber(block.gas.limit)}` : ""}
          divider
        />
        <KpiCell
          valueSize={22}
          label="Base fee"
          value={block ? formatGwei(block.gas.baseFeePerGas) : null}
          sub="EIP-1559"
          divider
        />
        <KpiCell
          valueSize={22}
          label="Size"
          value={block ? `${(block.size / 1024).toFixed(1)} KB` : null}
          sub={block ? `${block.transactionsCount} txns` : ""}
          divider
        />
        <KpiCell
          valueSize={22}
          label="Timestamp"
          value={block ? formatRelativeTime(block.timestamp) : null}
          sub={block ? new Date(block.timestamp).toUTCString().replace("GMT", "UTC") : ""}
        />
      </div>

      {/* Tabs */}
      <Tabs
        active={tab}
        onChange={(id) => setTab(id as TabId)}
        tabs={[
          { id: "overview", label: "Details" },
          {
            id: "txs",
            label: "Transactions",
            count:
              typeof block?.transactionsCount === "number"
                ? formatNumber(block.transactionsCount)
                : null,
          },
          { id: "icm", label: "ICM" },
          { id: "consensus", label: "Consensus" },
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
            Array.from({ length: 8 }).map((_, i) => (
              <DetailRow key={i} label={<Skeleton className="h-3 w-20" />}>
                <Skeleton className="h-4 w-72" />
              </DetailRow>
            ))
          ) : block ? (
            <>
              <DetailRow label="Block height">
                <span className="mono" style={{ fontSize: 13 }}>
                  {formatNumber(block.number)}
                </span>
              </DetailRow>
              <DetailRow label="Hash">
                <Hash value={block.hash} tone="plain" length={0} showCopy />
              </DetailRow>
              <DetailRow label="Parent">
                {block.number > 0 ? (
                  <Hash
                    value={block.parentHash}
                    tone="link"
                    length={0}
                    href={`/blocks/${block.parentHash}`}
                  />
                ) : (
                  <Hash value={block.parentHash} tone="plain" length={0} />
                )}
              </DetailRow>
              <DetailRow label="Validator">
                {block.miner ? (
                  <Hash
                    value={block.miner}
                    tone="link"
                    length={0}
                    href={`/address/${block.miner}`}
                    showCopy
                  />
                ) : (
                  <span style={{ color: "var(--ink-4)" }}>—</span>
                )}
              </DetailRow>
              <DetailRow label="Timestamp">
                <span className="mono" style={{ fontSize: 12.5 }}>
                  {new Date(block.timestamp).toUTCString().replace("GMT", "UTC")}{" "}
                  <span style={{ color: "var(--ink-4)" }}>
                    · {formatRelativeTime(block.timestamp)}
                  </span>
                </span>
              </DetailRow>
              <DetailRow label="Gas limit">
                <span className="mono" style={{ fontSize: 13 }}>
                  {formatNumber(block.gas.limit)}
                </span>
              </DetailRow>
              <DetailRow label="Gas used">
                <span className="mono" style={{ fontSize: 13 }}>
                  {formatNumber(block.gas.used)}{" "}
                  <span style={{ color: "var(--ink-4)" }}>· {gasUtilization(block.gas)}</span>
                </span>
              </DetailRow>
              <DetailRow label="Base fee">
                <span className="mono" style={{ fontSize: 13 }}>
                  {formatGwei(block.gas.baseFeePerGas)}
                </span>
              </DetailRow>
              <DetailRow label="Size">
                <span className="mono" style={{ fontSize: 13 }}>
                  {formatNumber(block.size)} bytes
                </span>
              </DetailRow>
            </>
          ) : null}
        </div>
      )}

      {tab === "txs" && (
        <div className="card border border-line rounded-[10px] bg-bg-elev mt-6">
          {txsError ? (
            <div className="p-6 mono" style={{ fontSize: 12, color: "var(--ink-4)" }}>
              Couldn&apos;t load transactions: {txsError.message}
            </div>
          ) : txsPending || !blockTxs ? (
            <div className="p-6">
              <Skeleton className="h-4 w-full mb-3" />
              <Skeleton className="h-4 w-full mb-3" />
              <Skeleton className="h-4 w-full" />
            </div>
          ) : blockTxs.data.length > 0 ? (
            <table className="lat-tbl">
              <thead>
                <tr>
                  <th>Hash</th>
                  <th style={{ width: 110 }}>Method</th>
                  <th style={{ width: 160 }}>From</th>
                  <th style={{ width: 160 }}>To</th>
                  <th style={{ textAlign: "right", width: 160 }}>Value</th>
                  <th style={{ textAlign: "right", width: 120 }}>Fee</th>
                </tr>
              </thead>
              <tbody>
                {blockTxs.data.map((t) => (
                  <tr key={t.hash}>
                    <td>
                      <Hash
                        value={t.hash}
                        tone="link"
                        length={10}
                        href={`/transactions/${t.hash}`}
                      />
                    </td>
                    <td>
                      <MethodChip selector={t.method.selector} to={t.to} firnName={t.method.name} />
                    </td>
                    <td>
                      <Hash value={t.from} tone="from" length={8} href={`/address/${t.from}`} />
                    </td>
                    <td>
                      {t.to ? (
                        <Hash value={t.to} tone="to" length={8} href={`/address/${t.to}`} />
                      ) : (
                        <Link href={`/transactions/${t.hash}`} style={{ textDecoration: "none" }}>
                          <Chip tone="steel">Contract creation</Chip>
                        </Link>
                      )}
                    </td>
                    <td className="mono" style={{ textAlign: "right" }}>
                      {formatNativeAmount(t.value, symbol)}
                    </td>
                    <td className="mono" style={{ textAlign: "right", color: "var(--ink-4)" }}>
                      {formatTxFee(t.gas.used, t.gas.price, symbol)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          ) : (
            <div className="p-6" style={{ fontSize: 13, color: "var(--ink-3)" }}>
              No transactions in this block.
            </div>
          )}
        </div>
      )}

      {tab === "icm" && block ? (
        <ICMTab blockNumber={block.number} localChainId={chain?.blockchainId} />
      ) : null}

      {tab === "consensus" && block ? <ConsensusTab block={block} /> : null}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Sub-components
// ---------------------------------------------------------------------------

/**
 * Snowman++ consensus tab for a single block.
 *
 * Block-level consensus state on Avalanche is split across two layers:
 *
 *   1. The ProposerVM envelope (proposer NodeID, P-Chain reference height,
 *      VRF signature) — sits *above* the EVM in the consensus stack.
 *   2. The Coreth/subnet-evm header extras (BlockGasCost APR4, MinDelayExcess
 *      ACP-176, ExtraData / BlockExtraData) — sit *inside* the EVM block.
 *
 * firn currently exposes neither. We render layer-2 fields whenever
 * `block.consensus` is populated (the firn-side type contract is in
 * lib/api/types.ts → BlockConsensus), and we always render proposer +
 * inter-block latency since those derive from data firn already returns.
 *
 * Per-poll telemetry (vote counts, voter set, finalization rounds) lives in
 * AvalancheGo's runtime metrics rather than per-block storage; surfacing
 * those would require a separate metrics-scraping path in firn.
 */
function ConsensusTab({ block }: { block: import("@/lib/api/queries").Block }) {
  // Parent block for inter-block latency. firn caches hash-keyed lookups.
  const { data: parent } = useBlock(block.number > 0 ? block.parentHash : undefined);
  // Live ProposerVM state via firn's /v1/chain/proposer bridge. Chain-level
  // (not per-block) — the P-Chain height the proposer is currently pinning.
  const { data: proposer, error: proposerErr } = useProposerState();

  const cur = Date.parse(block.timestamp);
  const prev = parent ? Date.parse(parent.timestamp) : NaN;
  const blockTimeMs = Number.isFinite(cur) && Number.isFinite(prev) ? cur - prev : null;

  const c = block.consensus;

  // Decode the Coreth extraData header. Subnet-evm post-Etna packs:
  //   80B fee window (10 × uint64) + 6B ACP-176 min-delay excess.
  // The decoder gracefully short-circuits on shorter inputs (pre-Etna).
  const extra = decodeCorethExtra(c?.extraData);
  // ACP-176 excess: prefer firn's typed field if it ever ships it; fall
  // back to whatever we cracked out of extraData.
  const minDelayExcess =
    c?.minDelayExcess && c.minDelayExcess !== "0"
      ? BigInt(c.minDelayExcess)
      : extra?.minDelayExcess;

  return (
    <div className="mt-6 space-y-6">
      {/* Snowman++ envelope. Per-block proposer NodeID + P-Chain
          reference height aren't accessible from inside the inner VM:
          avalanchego's block indexer skips non-primary-network chains
          (indexer/indexer.go RegisterChain) and proposervm's RPC
          surface only exposes chain-level GetProposedHeight. Per-block
          values would require an upstream avalanchego patch.

          What we CAN show: the EVM coinbase (subnet-evm fee
          recipient — distinct from the proposer NodeID), per-block
          dynamic-fee state from extraData, the live chain-level
          P-Chain pinning, and acceptance time. */}
      <section
        className="card border border-line rounded-[10px] bg-bg-elev"
        style={{ padding: 24 }}
      >
        <div className="eyebrow" style={{ marginBottom: 14 }}>
          Snowman++ envelope
        </div>
        <div
          style={{
            display: "grid",
            gridTemplateColumns: "180px 1fr",
            rowGap: 14,
            columnGap: 32,
          }}
        >
          <DetailRow label="Proposer (coinbase)">
            {block.miner ? (
              <Hash
                value={block.miner}
                tone="link"
                length={0}
                href={`/address/${block.miner}`}
                showCopy
              />
            ) : (
              <span style={{ color: "var(--ink-4)" }}>—</span>
            )}
          </DetailRow>
          <DetailRow label="Block time">
            {block.number === 0 ? (
              <span style={{ color: "var(--ink-4)" }}>genesis</span>
            ) : blockTimeMs == null ? (
              <Skeleton className="h-4 w-32" />
            ) : (
              <span className="mono" style={{ fontSize: 13 }}>
                {formatBlockTime(blockTimeMs)}{" "}
                <span style={{ color: "var(--ink-4)" }}>
                  · since #{formatNumber(block.number - 1)}
                </span>
              </span>
            )}
          </DetailRow>
          <DetailRow label="Acceptance">
            <span className="mono" style={{ fontSize: 12.5 }}>
              {new Date(block.timestamp).toUTCString().replace("GMT", "UTC")}
              {c?.timestampMs ? (
                <span style={{ color: "var(--ink-4)" }}> · t={c.timestampMs}ms</span>
              ) : null}
            </span>
          </DetailRow>
          <DetailRow label="P-Chain pinned">
            {proposerErr ? (
              <span style={{ fontSize: 11.5, color: "var(--ink-4)" }}>
                proposer bridge unavailable — <code className="mono">-proposer-rpc</code> not
                configured
              </span>
            ) : proposer?.proposedHeight ? (
              <span className="mono" style={{ fontSize: 13 }}>
                #{formatNumber(proposer.proposedHeight)}{" "}
                <span style={{ color: "var(--ink-4)" }}>· live ProposerVM, chain-level</span>
              </span>
            ) : (
              <Skeleton className="h-4 w-32" />
            )}
          </DetailRow>
        </div>
      </section>

      {/* Coreth / subnet-evm dynamic-fee state */}
      <section
        className="card border border-line rounded-[10px] bg-bg-elev"
        style={{ padding: 24 }}
      >
        <div className="eyebrow" style={{ marginBottom: 14 }}>
          Dynamic-fee state
        </div>
        <div
          style={{
            display: "grid",
            gridTemplateColumns: "180px 1fr",
            rowGap: 14,
            columnGap: 32,
          }}
        >
          <DetailRow label="Base fee">
            <span className="mono" style={{ fontSize: 13 }}>
              {formatGwei(block.gas.baseFeePerGas)}
            </span>
          </DetailRow>
          <DetailRow label="Block gas cost">
            <span className="mono" style={{ fontSize: 13 }}>
              {formatNumber(c?.blockGasCost ?? "0")}{" "}
              <span style={{ color: "var(--ink-4)" }}>· APR4 producer fee</span>
            </span>
          </DetailRow>
          <DetailRow label="Min-delay excess">
            {minDelayExcess !== undefined ? (
              <span className="mono" style={{ fontSize: 13 }}>
                {minDelayExcess.toString()}{" "}
                <span style={{ color: "var(--ink-4)" }}>
                  · ACP-176 EWMA
                  {extra?.minDelayExcess === minDelayExcess ? " · decoded from extraData" : ""}
                </span>
              </span>
            ) : (
              <span className="mono" style={{ fontSize: 12.5, color: "var(--ink-4)" }}>
                — pre-ACP-176 (no excess trailer)
              </span>
            )}
          </DetailRow>
          <DetailRow label="Ext data gas">
            {c?.extDataGasUsed && c.extDataGasUsed !== "0" ? (
              <span className="mono" style={{ fontSize: 13 }}>
                {formatNumber(c.extDataGasUsed)}
              </span>
            ) : (
              <span className="mono" style={{ fontSize: 12.5, color: "var(--ink-4)" }}>
                0 · post-Cortina (no atomic txs)
              </span>
            )}
          </DetailRow>
        </div>
      </section>

      {/* Decoded fee window — shown when extraData was parseable */}
      {extra && extra.feeWindow.length > 0 ? <FeeWindowCard extra={extra} /> : null}

      {/* Pre-Cortina atomic-tx envelope, when present */}
      {c?.blockExtraData ? (
        <section
          className="card border border-line rounded-[10px] bg-bg-elev"
          style={{ padding: 24 }}
        >
          <div className="eyebrow" style={{ marginBottom: 14 }}>
            Atomic envelope (pre-Cortina)
          </div>
          <RawBlob label="blockExtraData" value={c.blockExtraData} />
        </section>
      ) : null}

      {/* Per-poll telemetry — known-out-of-scope explainer */}
      <section className="border border-dashed border-line rounded-[10px]" style={{ padding: 20 }}>
        <div className="eyebrow" style={{ marginBottom: 8, color: "var(--ink-3)" }}>
          Per-poll telemetry
        </div>
        <div style={{ fontSize: 12.5, color: "var(--ink-3)", lineHeight: 1.65 }}>
          Vote counts, voter set, and finalization rounds live in AvalancheGo&apos;s runtime metrics
          rather than per-block storage. Surfacing them would require firn to scrape{" "}
          <code className="mono" style={{ fontSize: 11.5 }}>
            /ext/metrics
          </code>{" "}
          and snapshot per-block, or hook the consensus engine&apos;s decision events directly. Same
          goes for ProposerVM NodeID + pinned P-Chain height — not in the EVM block, only in the
          AvalancheGo proposer envelope.
        </div>
      </section>
    </div>
  );
}

function FeeWindowCard({ extra }: { extra: NonNullable<ReturnType<typeof decodeCorethExtra>> }) {
  const max = extra.feeWindow.reduce((m, v) => (v > m ? v : m), 0n);
  return (
    <section className="card border border-line rounded-[10px] bg-bg-elev" style={{ padding: 24 }}>
      <div className="eyebrow" style={{ marginBottom: 14 }}>
        Dynamic-fee window
      </div>
      <div style={{ fontSize: 12, color: "var(--ink-3)", marginBottom: 14, lineHeight: 1.5 }}>
        10-sample rolling gas window from{" "}
        <code className="mono" style={{ fontSize: 11.5 }}>
          extraData[0:80]
        </code>
        . Subnet-evm consumes this to compute the next block&apos;s base fee. Sum:{" "}
        <span className="mono" style={{ color: "var(--ink-2)" }}>
          {extra.feeWindowSum?.toString() ?? "0"}
        </span>
      </div>
      <div style={{ display: "flex", alignItems: "flex-end", gap: 6, height: 64 }}>
        {extra.feeWindow.map((v, i) => {
          const pct = max > 0n ? Number((v * 100n) / max) : 0;
          return (
            <div
              key={i}
              title={`sample ${i}: ${v.toString()}`}
              style={{
                flex: 1,
                display: "flex",
                flexDirection: "column",
                justifyContent: "flex-end",
              }}
            >
              <div
                style={{
                  height: `${Math.max(2, pct)}%`,
                  background: "var(--ink-3)",
                  borderRadius: 2,
                  opacity: 0.5 + (pct / 100) * 0.5,
                }}
              />
            </div>
          );
        })}
      </div>
      <div
        style={{
          display: "flex",
          gap: 6,
          marginTop: 6,
          fontSize: 10,
          color: "var(--ink-4)",
          fontFamily: "var(--font-mono)",
        }}
      >
        {extra.feeWindow.map((_, i) => (
          <div key={i} style={{ flex: 1, textAlign: "center" }}>
            {i}
          </div>
        ))}
      </div>
    </section>
  );
}

function RawBlob({ label, value }: { label: string; value: string }) {
  const bytes = value.startsWith("0x")
    ? Math.max(0, Math.floor((value.length - 2) / 2))
    : Math.floor(value.length / 2);
  return (
    <div style={{ marginBottom: 14 }}>
      <div
        className="mono"
        style={{
          fontSize: 11,
          color: "var(--ink-4)",
          marginBottom: 6,
          textTransform: "uppercase",
          letterSpacing: "0.05em",
        }}
      >
        {label} · {formatNumber(bytes)} bytes
      </div>
      <pre
        style={{
          margin: 0,
          padding: 12,
          background: "var(--bg-sunken)",
          border: "1px solid var(--line)",
          borderRadius: 8,
          fontSize: 11.5,
          color: "var(--ink-2)",
          fontFamily: "var(--font-mono), ui-monospace, monospace",
          maxHeight: 180,
          overflow: "auto",
          whiteSpace: "pre-wrap",
          wordBreak: "break-all",
        }}
      >
        {value}
      </pre>
    </div>
  );
}

function PrevNextLink({ kind, number }: { kind: "prev" | "next"; number: number }) {
  const target = kind === "prev" ? number - 1 : number + 1;
  const disabled = kind === "prev" && target < 0;
  return (
    <Link
      href={disabled ? "#" : `/blocks/${target}`}
      aria-disabled={disabled}
      title={kind === "prev" ? "Previous block" : "Next block"}
      style={{
        display: "inline-flex",
        alignItems: "center",
        justifyContent: "center",
        width: 26,
        height: 26,
        border: "1px solid var(--line)",
        borderRadius: 6,
        color: disabled ? "var(--ink-5)" : "var(--ink-3)",
        background: "var(--bg-elev)",
        textDecoration: "none",
        pointerEvents: disabled ? "none" : "auto",
      }}
    >
      <svg width="12" height="12" viewBox="0 0 12 12">
        {kind === "prev" ? (
          <path
            d="M7.5 2.5L4 6l3.5 3.5"
            stroke="currentColor"
            fill="none"
            strokeWidth="1.4"
            strokeLinecap="round"
          />
        ) : (
          <path
            d="M4.5 2.5L8 6l-3.5 3.5"
            stroke="currentColor"
            fill="none"
            strokeWidth="1.4"
            strokeLinecap="round"
          />
        )}
      </svg>
    </Link>
  );
}

/**
 * ICM tab for the block detail page. Hits `GET /v1/icm/messages?block=N`
 * — firn's icm decoder owns the route and the SQL filter is on
 * `raw_logs.block_number`, so we pull only the events emitted in this
 * block. Mirrors the row shape from app/icm/page.tsx; the standalone
 * /icm page is the global stream over all blocks.
 */
function ICMTab({
  blockNumber,
  localChainId,
}: {
  blockNumber: number;
  localChainId: string | undefined;
}) {
  const {
    data: page,
    isPending,
    error,
  } = useICMMessages({
    block: blockNumber,
    limit: 100,
  });
  const messages = page?.data;

  if (error) {
    return (
      <ErrorBanner title="Couldn't load ICM messages" message={error.message} className="mt-6" />
    );
  }

  return (
    <div className="card border border-line rounded-[10px] bg-bg-elev mt-6">
      <table className="lat-tbl">
        <thead>
          <tr>
            <th style={{ width: 92 }}>Layer</th>
            <th style={{ width: 200 }}>Event</th>
            <th>Message ID</th>
            <th style={{ width: 240 }}>Source → Destination</th>
            <th>Tx</th>
            <th style={{ textAlign: "right", width: 80 }}>Log #</th>
          </tr>
        </thead>
        <tbody>
          {isPending ? (
            Array.from({ length: 4 }).map((_, i) => (
              <tr key={i}>
                <td colSpan={6}>
                  <Skeleton className="h-4 w-full" />
                </td>
              </tr>
            ))
          ) : messages?.length ? (
            messages.map((m) => (
              <ICMRow
                key={`${m.transactionHash}-${m.logIndex}`}
                m={m}
                localChainId={localChainId}
              />
            ))
          ) : (
            <tr>
              <td
                colSpan={6}
                className="text-center py-10"
                style={{ color: "var(--ink-4)", fontSize: 13 }}
              >
                No ICM messages in this block.
              </td>
            </tr>
          )}
        </tbody>
      </table>
    </div>
  );
}

function ICMRow({ m, localChainId }: { m: ICMMessage; localChainId: string | undefined }) {
  const src = m.sourceBlockchainId;
  const dst = m.destinationBlockchainId;
  const sourceIsLocal = !!localChainId && !!src && eqHex(src, localChainId);
  const destinationIsLocal = !!localChainId && !!dst && eqHex(dst, localChainId);
  // Resolved chain names from the backend's blockchains resolver —
  // see internal/blockchains/resolver.go. Includes the implicit side
  // for cross-chain events (we're on Echo, so MessageExecuted's
  // destination is "echo" even though the bytes32 isn't on the event).
  const noSide = !src && !dst && !m.sourceBlockchainName && !m.destinationBlockchainName;
  return (
    <tr>
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
          <Hash value={m.messageId} length={10} tone="plain" />
        ) : (
          <span className="mono" style={{ fontSize: 11.5, color: "var(--ink-4)" }}>
            —
          </span>
        )}
      </td>
      <td>
        {noSide ? (
          <span className="mono" style={{ fontSize: 11.5, color: "var(--ink-4)" }}>
            —
          </span>
        ) : (
          <div
            style={{
              display: "grid",
              gridTemplateColumns: "1fr auto 1fr",
              alignItems: "center",
              gap: 8,
            }}
          >
            <ICMChainCell
              id={src}
              name={m.sourceBlockchainName}
              cb58={m.sourceBlockchainCb58}
              isLocal={sourceIsLocal}
            />
            <svg width="10" height="10" viewBox="0 0 10 10" aria-hidden>
              <path
                d="M2 5h6m0 0L6 3m2 2L6 7"
                stroke="var(--ink-3)"
                strokeWidth="1.3"
                fill="none"
                strokeLinecap="round"
              />
            </svg>
            <ICMChainCell
              id={dst}
              name={m.destinationBlockchainName}
              cb58={m.destinationBlockchainCb58}
              isLocal={destinationIsLocal}
            />
          </div>
        )}
      </td>
      <td>
        <Hash
          value={m.transactionHash}
          length={8}
          tone="link"
          href={`/transactions/${m.transactionHash}`}
        />
      </td>
      <td className="mono" style={{ textAlign: "right", color: "var(--ink-3)" }}>
        {m.logIndex}
      </td>
    </tr>
  );
}

function ICMChainCell({
  id,
  name,
  cb58,
  isLocal,
}: {
  id: string | undefined;
  name: string | undefined;
  cb58: string | undefined;
  isLocal: boolean;
}) {
  if (!id && !name) {
    return (
      <span className="mono" style={{ fontSize: 11, color: "var(--ink-4)" }}>
        —
      </span>
    );
  }
  // Prefer the resolved name; fall back to truncated bytes32. Tooltip
  // exposes the canonical CB58 form (what P-Chain advertises) plus
  // the bytes32 hex for debugging.
  const label = name ?? (id ? truncateBytes32(id) : "?");
  const title = [cb58, id].filter(Boolean).join(" / ");
  return (
    <span
      className="mono"
      title={title}
      style={{
        fontSize: 11.5,
        color: isLocal || name ? "var(--ink)" : "var(--ink-3)",
        fontWeight: isLocal ? 500 : 400,
        overflow: "hidden",
        textOverflow: "ellipsis",
        whiteSpace: "nowrap",
      }}
    >
      {label}
    </span>
  );
}

function eqHex(a: string, b: string): boolean {
  return a.toLowerCase() === b.toLowerCase();
}

function truncateBytes32(id: string): string {
  if (id.length <= 14) return id;
  return `${id.slice(0, 8)}…${id.slice(-4)}`;
}
