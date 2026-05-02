"use client";

import { use, useMemo, useState } from "react";
import { useSearchParams } from "next/navigation";
import {
  useAddress,
  useAddressInternalTransactions,
  useAddressLogs,
  useAddressTokenTransfers,
  useAddressTransactions,
  useChain,
  useContractSource,
} from "@/lib/api/queries";
import { Hash } from "@/components/lattice/hash";
import { Chip } from "@/components/lattice/chip";
import { MethodChip } from "@/components/lattice/method-chip";
import { Tabs, type TabItem } from "@/components/lattice/tabs";
import { Skeleton } from "@/components/ui/skeleton";
import {
  formatNativeAmount,
  formatNumber,
  formatRelativeTime,
  formatUnits,
  truncateHash,
} from "@/lib/format";
import Link from "next/link";
import type { AddressLog, InternalTransaction, TokenTransfer, Transaction } from "@/lib/api/types";
import {
  abiSignature,
  fileLanguage,
  groupAbi,
  type AbiItem,
  type SourcifyContract,
} from "@/lib/sourcify";

const PLACEHOLDER = "—";

const EOA_TABS: ReadonlyArray<TabItem> = [
  { id: "txs", label: "Transactions" },
  { id: "internal", label: "Internal txns" },
  { id: "tokens", label: "Token transfers" },
  { id: "nfts", label: "NFTs" },
  { id: "logs", label: "Logs" },
];

const CONTRACT_TABS: ReadonlyArray<TabItem> = [
  { id: "txs", label: "Transactions" },
  { id: "internal", label: "Internal txns" },
  { id: "tokens", label: "Token transfers" },
  { id: "logs", label: "Logs" },
  { id: "code", label: "Code" },
  { id: "read", label: "Read" },
  { id: "write", label: "Write" },
];

/**
 * Address detail page.
 *
 * In Next.js 16 dynamic-segment params arrive as a Promise; client components
 * unwrap it with `use()`. See node_modules/next/dist/docs/01-app/03-api-reference/03-file-conventions/dynamic-routes.md.
 */
export default function AddressPage({ params }: { params: Promise<{ hash: string }> }) {
  const { hash: rawHash } = use(params);
  const hash = rawHash.toLowerCase();
  const search = useSearchParams();

  // firn's /v1/addresses/:hash returns isContract derived from on-chain
  // eth_getCode. The ?type=contract URL override stays as a manual
  // preview path — useful for routing into the Code/Read/Write tabs
  // before the address overview has finished loading.
  const forced = search.get("type");

  const { data: addr } = useAddress(hash);
  const isContract = forced === "contract" || addr?.isContract === true;

  const [tab, setTab] = useState<string>("txs");
  const tabs = isContract ? CONTRACT_TABS : EOA_TABS;

  const { data: chain } = useChain();
  const symbol = chain?.nativeToken.symbol ?? "—";

  const {
    data: txPage,
    isPending: txPending,
    error: txError,
  } = useAddressTransactions(hash, { limit: 50 });

  // Sourcify lookup: only meaningful for contracts. Fires regardless of
  // contract-vs-EOA detection — Sourcify will return null for EOAs anyway,
  // and starting the fetch early warms the cache before the user clicks Code.
  const { data: src, isPending: srcPending } = useContractSource(chain?.chainId, hash);

  const txs = txPage?.data;
  const txCountLabel = useMemo(() => (txs ? formatNumber(txs.length) : null), [txs]);

  const verified = src?.match === "exact_match" || src?.match === "match";
  const contractName = src?.compilation?.name;

  return (
    <div className="px-10 py-8 pb-12">
      <div className="eyebrow mb-2.5">
        ◆{" "}
        {contractName
          ? `Contract · ${contractName}`
          : isContract
            ? "Address · Contract"
            : "Address · EOA"}
        {verified ? " · Verified" : ""}
      </div>

      <div className="flex items-center gap-3.5 mb-1.5 flex-wrap">
        <Hash value={hash} tone="plain" length={0} showCopy className="h-display" />
        <Chip tone="steel">{isContract ? "Contract" : "EOA"}</Chip>
        {isContract ? (
          srcPending ? (
            <Chip tone="steel">checking Sourcify…</Chip>
          ) : verified ? (
            <Chip tone="good">
              ✓ Verified · {src.compilation?.compiler ?? "solc"}{" "}
              {src.compilation?.compilerVersion ?? ""}
            </Chip>
          ) : (
            <Chip tone="steel">○ Unverified</Chip>
          )
        ) : null}
      </div>
      <div style={{ fontSize: 13, color: "var(--ink-3)", marginTop: 4, marginBottom: 28 }}>
        {isContract && verified
          ? `${src.compilation?.language ?? "Solidity"} · ${src.sources?.length ?? 0} source files · matched via ${src.match === "exact_match" ? "exact match" : "partial match"} on Sourcify`
          : addr
            ? addr.firstSeenBlock
              ? `First seen #${formatNumber(addr.firstSeenBlock)} · Last seen #${formatNumber(addr.lastSeenBlock)}`
              : "Not yet seen on this L1"
            : `First seen ${PLACEHOLDER} · Last seen ${PLACEHOLDER}`}
      </div>

      {/* Header strip — balance + tx count from /v1/addresses/:hash + */}
      {/* eth_getBalance via firn's RPC passthrough.                   */}
      <div
        className="grid mb-9"
        style={{
          gridTemplateColumns: "1.2fr 1fr 1fr",
          borderTop: "1px solid var(--line)",
          borderBottom: "1px solid var(--line)",
        }}
      >
        <HeaderCell
          label="Balance"
          value={
            addr ? (
              <>
                {formatUnits(addr.balance, chain?.nativeToken.decimals ?? 18, 4)}
                <span style={{ color: "var(--ink-4)", fontSize: 28, marginLeft: 6 }}>{symbol}</span>
              </>
            ) : (
              <Skeleton className="h-7 w-32" />
            )
          }
          sub={addr?.isContract ? "contract" : "EOA"}
          big
          first
        />
        <HeaderCell
          label="Transactions"
          value={addr ? formatNumber(addr.transactionsCount) : <Skeleton className="h-7 w-20" />}
          sub={txPage ? `showing latest ${txs?.length ?? 0}` : "—"}
        />
        <HeaderCell label="Label / tag" value={PLACEHOLDER} sub="not yet indexed" />
      </div>

      <Tabs tabs={tabs} active={tab} onChange={setTab} />

      {tab === "txs" ? (
        <TxsTab txs={txs} isPending={txPending} error={txError} symbol={symbol} selfHash={hash} />
      ) : null}

      {tab === "internal" ? <InternalTxsTab address={hash} symbol={symbol} /> : null}

      {tab === "tokens" ? <AddressTokenTransfersTab address={hash} /> : null}

      {tab === "nfts" ? (
        <EmptyTab
          title="NFTs"
          body="Requires ERC-721/1155 Transfer log decoding plus tokenURI lookups."
          gap="GET /v1/addresses/:hash/nfts (not in spec)"
        />
      ) : null}

      {tab === "logs" ? <AddressLogsTab address={hash} /> : null}

      {tab === "code" ? (
        <SourceTab src={src} pending={srcPending} chainId={chain?.chainId} address={hash} />
      ) : null}

      {tab === "read" ? <AbiFunctionsTab src={src} pending={srcPending} mode="read" /> : null}

      {tab === "write" ? <AbiFunctionsTab src={src} pending={srcPending} mode="write" /> : null}
    </div>
  );
}

function HeaderCell({
  label,
  value,
  sub,
  first = false,
  big = false,
}: {
  label: string;
  value: React.ReactNode;
  sub?: string;
  first?: boolean;
  big?: boolean;
}) {
  return (
    <div
      style={{
        padding: first ? "24px 24px 24px 0" : "24px",
        borderLeft: first ? undefined : "1px solid var(--line)",
      }}
    >
      <div className="eyebrow" style={{ marginBottom: 10 }}>
        {label}
      </div>
      <div className="h-display" style={{ fontSize: big ? 48 : 26 }}>
        {value}
      </div>
      {sub ? (
        <div className="mono" style={{ fontSize: 11.5, color: "var(--ink-4)", marginTop: 6 }}>
          {sub}
        </div>
      ) : null}
    </div>
  );
}

function TxsTab({
  txs,
  isPending,
  error,
  symbol,
  selfHash,
}: {
  txs: Transaction[] | undefined;
  isPending: boolean;
  error: Error | null;
  symbol: string;
  selfHash: string;
}) {
  const self = selfHash.toLowerCase();
  return (
    <div style={{ marginTop: 24 }}>
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
          <div style={{ fontWeight: 500, marginBottom: 4 }}>Couldn&apos;t load transactions</div>
          <div className="mono" style={{ fontSize: 11.5, color: "var(--ink-3)" }}>
            {error.message}
          </div>
        </div>
      ) : null}

      <div className="card border border-line rounded-[10px] bg-bg-elev">
        <table className="lat-tbl">
          <thead>
            <tr>
              <th style={{ width: 72 }}>Status</th>
              <th>Hash</th>
              <th style={{ width: 110 }}>Method</th>
              <th style={{ width: 60 }}>Dir</th>
              <th>Counterparty</th>
              <th style={{ textAlign: "right", width: 140 }}>Value</th>
              <th style={{ textAlign: "right", width: 130 }}>Block · Age</th>
            </tr>
          </thead>
          <tbody>
            {isPending ? (
              Array.from({ length: 8 }).map((_, i) => (
                <tr key={i}>
                  <td colSpan={7}>
                    <Skeleton className="h-4 w-full" />
                  </td>
                </tr>
              ))
            ) : txs?.length ? (
              txs.map((t) => {
                const out = t.from.toLowerCase() === self;
                const counter = out ? t.to : t.from;
                return (
                  <tr key={t.hash}>
                    <td>
                      <Chip tone={t.status === "success" ? "good" : "bad"}>
                        {t.status === "success" ? "✓ ok" : t.status}
                      </Chip>
                    </td>
                    <td>
                      <Hash
                        value={t.hash}
                        tone="link"
                        length={0}
                        href={`/transactions/${t.hash}`}
                      />
                    </td>
                    <td>
                      <MethodChip selector={t.method.selector} to={t.to} firnName={t.method.name} />
                    </td>
                    <td>
                      <Chip tone={out ? "bad" : "good"}>{out ? "OUT" : "IN"}</Chip>
                    </td>
                    <td>
                      {counter ? (
                        <Hash
                          value={counter}
                          tone={out ? "to" : "from"}
                          length={0}
                          href={`/address/${counter}`}
                        />
                      ) : (
                        <span className="mono" style={{ fontSize: 11.5, color: "var(--ink-4)" }}>
                          create
                        </span>
                      )}
                    </td>
                    <td className="mono" style={{ textAlign: "right", color: "var(--ink)" }}>
                      {formatNativeAmount(t.value, symbol)}
                    </td>
                    <td className="mono" style={{ textAlign: "right" }}>
                      <div style={{ color: "var(--ink-2)", fontSize: 12 }}>
                        #{formatNumber(t.block.number)}
                      </div>
                      <div style={{ color: "var(--ink-4)", fontSize: 11 }}>
                        {formatRelativeTime(t.block.timestamp)}
                      </div>
                    </td>
                  </tr>
                );
              })
            ) : (
              <tr>
                <td colSpan={7} className="text-center py-10" style={{ color: "var(--ink-4)" }}>
                  No transactions for this address.
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
// Address-scoped data tabs (internal txs, token transfers, logs)
// ---------------------------------------------------------------------------

function InternalTxsTab({ address, symbol }: { address: string; symbol: string }) {
  const { data, isPending, error } = useAddressInternalTransactions(address, {
    limit: 50,
  });
  const rows = data?.data ?? [];
  return (
    <DataTable
      isPending={isPending}
      error={error}
      empty="No internal transactions for this address."
      cols={[
        { label: "Tx", width: "auto" },
        { label: "Type", width: "120px" },
        { label: "From" },
        { label: "To" },
        { label: "Value", width: "200px", align: "right" },
        { label: "Block", width: "120px", align: "right" },
        { label: "Age", width: "100px", align: "right" },
      ]}
      rows={rows.map((t: InternalTransaction) => [
        <Link
          key="t"
          href={`/transactions/${t.txHash}`}
          className="mono"
          style={{ color: "var(--accent-ink)", textDecoration: "none" }}
        >
          {truncateHash(t.txHash)}
        </Link>,
        <span key="ty" className="mono" style={{ fontSize: 11, color: "var(--ink-3)" }}>
          {t.callType}
        </span>,
        <Hash key="f" value={t.from} length={20} tone="link" />,
        t.to ? (
          <Hash key="to" value={t.to} length={20} tone="link" />
        ) : (
          <span key="to" style={{ color: "var(--ink-4)" }}>
            (contract creation)
          </span>
        ),
        <span key="v" className="mono">
          {formatNativeAmount(t.value, symbol)}
        </span>,
        <Link
          key="b"
          href={`/blocks/${t.blockNumber}`}
          className="mono"
          style={{ color: "var(--accent-ink)", textDecoration: "none" }}
        >
          #{formatNumber(t.blockNumber)}
        </Link>,
        <span key="a" className="mono" style={{ color: "var(--ink-3)" }}>
          {formatRelativeTime(t.blockTime)}
        </span>,
      ])}
    />
  );
}

function AddressTokenTransfersTab({ address }: { address: string }) {
  const { data, isPending, error } = useAddressTokenTransfers(address, {
    limit: 50,
  });
  const rows = data?.data ?? [];
  return (
    <DataTable
      isPending={isPending}
      error={error}
      empty="No token transfers for this address."
      cols={[
        { label: "Tx", width: "auto" },
        { label: "From" },
        { label: "To" },
        { label: "Amount (raw)", width: "240px", align: "right" },
        { label: "Block", width: "120px", align: "right" },
        { label: "Age", width: "100px", align: "right" },
      ]}
      rows={rows.map((t: TokenTransfer) => [
        <Link
          key="t"
          href={`/transactions/${t.txHash}`}
          className="mono"
          style={{ color: "var(--accent-ink)", textDecoration: "none" }}
        >
          {truncateHash(t.txHash)}
        </Link>,
        <Hash key="f" value={t.from} length={20} tone="link" />,
        <Hash key="to" value={t.to} length={20} tone="link" />,
        <span
          key="v"
          className="mono"
          title="Raw uint256 — divide by token's decimals to display human units"
        >
          {t.value}
        </span>,
        <Link
          key="b"
          href={`/blocks/${t.blockNumber}`}
          className="mono"
          style={{ color: "var(--accent-ink)", textDecoration: "none" }}
        >
          #{formatNumber(t.blockNumber)}
        </Link>,
        <span key="a" className="mono" style={{ color: "var(--ink-3)" }}>
          {formatRelativeTime(t.blockTime)}
        </span>,
      ])}
    />
  );
}

function AddressLogsTab({ address }: { address: string }) {
  const { data, isPending, error } = useAddressLogs(address, { limit: 50 });
  const rows = data?.data ?? [];
  return (
    <DataTable
      isPending={isPending}
      error={error}
      empty="No logs emitted by this address."
      cols={[
        { label: "Tx", width: "auto" },
        { label: "Topic0 (sig)" },
        { label: "Block", width: "120px", align: "right" },
        { label: "Log idx", width: "80px", align: "right" },
        { label: "Age", width: "100px", align: "right" },
      ]}
      rows={rows.map((lg: AddressLog) => [
        <Link
          key="t"
          href={`/transactions/${lg.txHash}`}
          className="mono"
          style={{ color: "var(--accent-ink)", textDecoration: "none" }}
        >
          {truncateHash(lg.txHash)}
        </Link>,
        <span key="s" className="mono" style={{ fontSize: 11.5 }}>
          {lg.topics[0] ? truncateHash(lg.topics[0], 10, 6) : "—"}
        </span>,
        <Link
          key="b"
          href={`/blocks/${lg.blockNumber}`}
          className="mono"
          style={{ color: "var(--accent-ink)", textDecoration: "none" }}
        >
          #{formatNumber(lg.blockNumber)}
        </Link>,
        <span key="li" className="mono">
          {lg.logIndex}
        </span>,
        <span key="a" className="mono" style={{ color: "var(--ink-3)" }}>
          {formatRelativeTime(lg.blockTime)}
        </span>,
      ])}
    />
  );
}

// Generic table shell shared by the three tabs above.
function DataTable({
  cols,
  rows,
  isPending,
  error,
  empty,
}: {
  cols: { label: string; width?: string; align?: "left" | "right" }[];
  rows: React.ReactNode[][];
  isPending: boolean;
  error: Error | null;
  empty: string;
}) {
  return (
    <div className="card border border-line rounded-[10px] bg-bg-elev mt-6">
      <table className="lat-tbl">
        <thead>
          <tr>
            {cols.map((c) => (
              <th
                key={c.label}
                style={{
                  width: c.width,
                  textAlign: c.align ?? "left",
                }}
              >
                {c.label}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {error ? (
            <tr>
              <td colSpan={cols.length} style={{ padding: "20px 12px" }}>
                <div className="mono" style={{ fontSize: 12, color: "var(--ink-4)" }}>
                  Failed to load: {String(error.message)}
                </div>
              </td>
            </tr>
          ) : isPending && rows.length === 0 ? (
            Array.from({ length: 6 }).map((_, i) => (
              <tr key={`s-${i}`}>
                <td colSpan={cols.length}>
                  <Skeleton className="h-4 w-full" />
                </td>
              </tr>
            ))
          ) : rows.length === 0 ? (
            <tr>
              <td
                colSpan={cols.length}
                style={{
                  padding: "32px 12px",
                  textAlign: "center",
                  color: "var(--ink-4)",
                  fontSize: 13,
                }}
              >
                {empty}
              </td>
            </tr>
          ) : (
            rows.map((cells, i) => (
              <tr key={i}>
                {cells.map((cell, j) => (
                  <td key={j} style={{ textAlign: cols[j].align ?? "left" }}>
                    {cell}
                  </td>
                ))}
              </tr>
            ))
          )}
        </tbody>
      </table>
    </div>
  );
}

function EmptyTab({ title, body, gap }: { title: string; body: string; gap?: string }) {
  return (
    <div
      className="card border border-line rounded-[10px] bg-bg-elev"
      style={{ marginTop: 24, padding: 32 }}
    >
      <div className="eyebrow mb-2.5">{title}</div>
      <div style={{ fontSize: 13, color: "var(--ink-3)", maxWidth: 540 }}>{body}</div>
      {gap ? (
        <div className="mono mt-3" style={{ fontSize: 11.5, color: "var(--ink-4)" }}>
          firn gap: {gap}
        </div>
      ) : null}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Sourcify-backed contract tabs
// ---------------------------------------------------------------------------

function SourceTab({
  src,
  pending,
  chainId,
  address,
}: {
  src: SourcifyContract | null | undefined;
  pending: boolean;
  chainId: number | string | undefined;
  address: string;
}) {
  const [activeFile, setActiveFile] = useState(0);

  if (pending) {
    return (
      <div
        className="card border border-line rounded-[10px] bg-bg-elev mt-6"
        style={{ padding: 32 }}
      >
        <Skeleton className="h-4 w-40 mb-3" />
        <Skeleton className="h-3 w-full mb-2" />
        <Skeleton className="h-3 w-3/4" />
      </div>
    );
  }

  if (!src || !src.sources || src.sources.length === 0) {
    return (
      <div
        className="card border border-line rounded-[10px] bg-bg-elev mt-6"
        style={{ padding: 32 }}
      >
        <div className="eyebrow mb-2.5">Not verified on Sourcify</div>
        <div style={{ fontSize: 13, color: "var(--ink-3)", maxWidth: 600 }}>
          No source files indexed for this contract on{" "}
          <span className="mono">chainId {chainId ?? "?"}</span>. Verify it yourself at{" "}
          <a
            href={`https://sourcify.dev/#/lookup/${address}`}
            target="_blank"
            rel="noopener noreferrer"
            style={{ color: "var(--accent-ink)" }}
          >
            sourcify.dev
          </a>{" "}
          or upload metadata + sources to make them appear here.
        </div>
      </div>
    );
  }

  const file = src.sources[activeFile];

  return (
    <div
      className="grid border border-line overflow-hidden mt-6"
      style={{
        gridTemplateColumns: "240px 1fr",
        borderRadius: 10,
      }}
    >
      <div
        style={{
          background: "var(--bg-sunken)",
          borderRight: "1px solid var(--line)",
          padding: "12px 8px",
          fontSize: 12,
          fontFamily: "var(--font-mono), ui-monospace, monospace",
        }}
      >
        <div className="eyebrow" style={{ padding: "6px 10px 12px" }}>
          Files · {src.sources.length}
        </div>
        {src.sources.map((f, i) => (
          <button
            key={f.path}
            type="button"
            onClick={() => setActiveFile(i)}
            style={{
              display: "block",
              width: "100%",
              textAlign: "left",
              padding: "7px 10px",
              borderRadius: 5,
              background: i === activeFile ? "var(--bg-elev)" : "transparent",
              color: i === activeFile ? "var(--ink)" : "var(--ink-3)",
              border: 0,
              cursor: "pointer",
              wordBreak: "break-all",
              fontFamily: "inherit",
              fontSize: "inherit",
            }}
          >
            {f.path}
          </button>
        ))}
      </div>
      <pre
        className="mono"
        style={{
          margin: 0,
          padding: "20px 24px",
          fontSize: 12.5,
          lineHeight: 1.7,
          color: "var(--ink-2)",
          overflow: "auto",
          background: "var(--bg-elev)",
          maxHeight: 700,
        }}
        data-language={fileLanguage(file.path)}
      >
        {file.content}
      </pre>
    </div>
  );
}

function AbiFunctionsTab({
  src,
  pending,
  mode,
}: {
  src: SourcifyContract | null | undefined;
  pending: boolean;
  mode: "read" | "write";
}) {
  const [open, setOpen] = useState<string | null>(null);

  if (pending) {
    return (
      <div
        className="card border border-line rounded-[10px] bg-bg-elev mt-6"
        style={{ padding: 32 }}
      >
        <Skeleton className="h-4 w-48 mb-3" />
        <Skeleton className="h-3 w-full" />
      </div>
    );
  }
  if (!src?.abi) {
    return (
      <EmptyTab
        title={mode === "read" ? "Read contract" : "Write contract"}
        body="No ABI available — this contract isn't verified on Sourcify, so we can't list its functions."
      />
    );
  }

  const groups = groupAbi(src.abi);
  const fns = mode === "read" ? groups.read : groups.write;

  if (fns.length === 0) {
    return (
      <EmptyTab
        title={mode === "read" ? "No view functions" : "No write functions"}
        body={
          mode === "read"
            ? "This contract has no `view` or `pure` functions in its ABI."
            : "This contract has no mutating functions in its ABI."
        }
      />
    );
  }

  return (
    <div className="mt-6">
      {fns.map((fn) => {
        const sig = abiSignature(fn);
        const isOpen = open === sig;
        return (
          <div
            key={sig}
            className="card border border-line rounded-[10px] bg-bg-elev"
            style={{ marginBottom: 10 }}
          >
            <button
              type="button"
              onClick={() => setOpen(isOpen ? null : sig)}
              style={{
                display: "grid",
                gridTemplateColumns: "auto auto 1fr auto",
                alignItems: "center",
                gap: 14,
                padding: "14px 18px",
                cursor: "pointer",
                width: "100%",
                background: "transparent",
                border: 0,
                textAlign: "left",
              }}
            >
              <Chip tone="steel">{mode}</Chip>
              <span className="mono" style={{ fontSize: 13, color: "var(--ink)", fontWeight: 500 }}>
                {fn.name ?? "<unnamed>"}
              </span>
              <span
                className="mono"
                style={{
                  fontSize: 11.5,
                  color: "var(--ink-4)",
                  overflow: "hidden",
                  textOverflow: "ellipsis",
                  whiteSpace: "nowrap",
                }}
                title={sig}
              >
                {sig}
              </span>
              <svg
                width="12"
                height="12"
                viewBox="0 0 12 12"
                style={{
                  transform: isOpen ? "rotate(180deg)" : "rotate(0deg)",
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
            </button>
            {isOpen ? <FunctionForm fn={fn} mode={mode} /> : null}
          </div>
        );
      })}
    </div>
  );
}

function FunctionForm({ fn, mode }: { fn: AbiItem; mode: "read" | "write" }) {
  return (
    <div
      style={{
        padding: "4px 18px 18px 60px",
        borderTop: "1px solid var(--line-soft)",
      }}
    >
      {(fn.inputs ?? []).map((p, i) => (
        <div key={`${p.name}-${i}`} style={{ marginBottom: 10 }}>
          <div className="eyebrow" style={{ marginBottom: 4 }}>
            {p.name || `arg${i}`} <span style={{ color: "var(--ink-4)" }}>({p.type})</span>
          </div>
          <input
            style={{
              width: "100%",
              padding: "8px 12px",
              border: "1px solid var(--line)",
              borderRadius: 6,
              fontFamily: "var(--font-mono), ui-monospace, monospace",
              fontSize: 12,
              background: "var(--bg-elev)",
              color: "var(--ink)",
            }}
            placeholder={`Enter ${p.type}…`}
          />
        </div>
      ))}
      <button
        type="button"
        className="lat-btn primary"
        style={{ marginTop: 6 }}
        disabled
        title="Wallet integration not wired yet"
      >
        {mode === "write" ? "Write" : "Query"} (wallet not connected)
      </button>
      {fn.outputs && fn.outputs.length > 0 ? (
        <div
          className="mono"
          style={{
            marginTop: 10,
            fontSize: 11.5,
            color: "var(--ink-4)",
          }}
        >
          returns ({fn.outputs.map((o) => o.type).join(", ")})
        </div>
      ) : null}
    </div>
  );
}
