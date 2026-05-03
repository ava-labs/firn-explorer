"use client";

import { useState } from "react";
import Link from "next/link";
import { useChain, useGenesis } from "@/lib/api/queries";
import type {
  GenesisAllocation,
  GenesisConfigFeeConfig,
  GenesisContract,
  GenesisERC20Balance,
  GenesisHardfork,
  GenesisPrecompile,
  GenesisResponse,
  GenesisUpgrades,
  GenesisUpgradesNetworkUpgrades,
  GenesisUpgradesPrecompileUpgradesItem,
  GenesisUpgradesRaw,
  GenesisUpgradesStateUpgradesItem,
} from "@/lib/api/queries";
import { Hash } from "@/components/lattice/hash";
import { Chip } from "@/components/lattice/chip";
import { CopyButton } from "@/components/lattice/copy-button";
import { Tabs } from "@/components/lattice/tabs";
import { DetailRow } from "@/components/page/detail-row";
import { KpiCell } from "@/components/page/kpi-cell";
import { Skeleton } from "@/components/ui/skeleton";
import { formatNativeAmount, formatNumber, formatRelativeTime } from "@/lib/format";

type TabId = "overview" | "allocations" | "contracts" | "config" | "upgrades" | "erc20" | "raw";

/**
 * /genesis — chain-lifetime, single-snapshot view of block 0.
 *
 * Backed by `GET /v1/genesis`, which firn computes once at index time
 * (header + decoded config + allocations + pre-deployed contracts +
 * heuristic ERC-20 storage decode + raw genesis JSON). The data never
 * changes, so the hook caches aggressively — tab switches are free.
 *
 * If the firn instance lacks a chdb store the endpoint 404s; that case
 * lands in the `unavailable` branch below rather than crashing the page.
 */
export default function GenesisPage() {
  const { data: chain } = useChain();
  const { data: genesis, isPending, error } = useGenesis();
  const [tab, setTab] = useState<TabId>("overview");

  const symbol = chain?.nativeToken.symbol ?? "";

  if (error) {
    return <GenesisUnavailable error={error} />;
  }

  return (
    <div className="px-4 sm:px-6 lg:px-10 py-6 sm:py-8 pb-12 max-w-[1080px] mx-auto">
      <div className="eyebrow mb-2.5">Genesis</div>

      {/* Headline */}
      <div className="flex items-baseline gap-3 mb-2 flex-wrap">
        <span className="h-display" style={{ fontSize: 56 }}>
          Block 0
        </span>
        <span style={{ fontSize: 22, color: "var(--ink-3)" }}>· Genesis state</span>
      </div>
      <div style={{ fontSize: 14, color: "var(--ink-3)", marginBottom: 28 }}>
        {genesis ? (
          <GenesisSubline genesis={genesis} />
        ) : isPending ? (
          <Skeleton className="h-4 w-96" />
        ) : null}
      </div>

      {/* KPI strip */}
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
          label="Chain ID"
          value={genesis ? formatNumber(genesis.config.chainId) : null}
          sub={chain?.name ? chain.name : "EVM L1"}
          divider
        />
        <KpiCell
          valueSize={22}
          label="Total supply"
          value={genesis ? formatNativeAmount(genesis.allocations.totalSupplyWei, symbol) : null}
          sub={genesis ? `${formatNumber(genesis.allocations.withBalance)} addrs funded` : ""}
          divider
        />
        <KpiCell
          valueSize={22}
          label="Allocations"
          value={genesis ? formatNumber(genesis.allocations.totalCount) : null}
          sub={genesis ? `${formatNumber(genesis.allocations.withCode)} with code` : ""}
          divider
        />
        <KpiCell
          valueSize={22}
          label="Contracts"
          value={genesis ? formatNumber((genesis.contracts ?? []).length) : null}
          sub={
            genesis
              ? `${formatNumber(
                  (genesis.contracts ?? []).filter((c) => c.isPrecompile).length,
                )} precompile${
                  (genesis.contracts ?? []).filter((c) => c.isPrecompile).length === 1 ? "" : "s"
                }`
              : ""
          }
          divider
        />
        <KpiCell
          valueSize={22}
          label="Timestamp"
          value={genesis ? formatRelativeTime(genesis.header.timestamp) : null}
          sub={
            genesis ? new Date(genesis.header.timestamp).toUTCString().replace("GMT", "UTC") : ""
          }
        />
      </div>

      {/* Tabs */}
      <Tabs
        active={tab}
        onChange={(id) => setTab(id as TabId)}
        tabs={[
          { id: "overview", label: "Overview" },
          {
            id: "allocations",
            label: "Allocations",
            count: genesis ? formatNumber(genesis.allocations.totalCount) : null,
          },
          {
            id: "contracts",
            label: "Contracts",
            count: genesis ? formatNumber((genesis.contracts ?? []).length) : null,
          },
          { id: "config", label: "Config" },
          { id: "upgrades", label: "Upgrades" },
          {
            id: "erc20",
            label: "ERC-20 balances",
            count: genesis ? formatNumber((genesis.erc20Balances ?? []).length) : null,
          },
          { id: "raw", label: "Raw" },
        ]}
      />

      {tab === "overview" && <OverviewTab genesis={genesis} isPending={isPending} />}
      {tab === "allocations" && (
        <AllocationsTab genesis={genesis} isPending={isPending} symbol={symbol} />
      )}
      {tab === "contracts" && (
        <ContractsTab genesis={genesis} isPending={isPending} symbol={symbol} />
      )}
      {tab === "config" && <ConfigTab genesis={genesis} isPending={isPending} />}
      {tab === "upgrades" && <UpgradesTab genesis={genesis} isPending={isPending} />}
      {tab === "erc20" && <ERC20Tab genesis={genesis} isPending={isPending} />}
      {tab === "raw" && <RawTab genesis={genesis} isPending={isPending} />}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Sub-components
// ---------------------------------------------------------------------------

function GenesisSubline({ genesis }: { genesis: GenesisResponse }) {
  const allocs = genesis.allocations.totalCount;
  const contracts = (genesis.contracts ?? []).length;
  return (
    <>
      Chain ID <span className="mono">{formatNumber(genesis.config.chainId)}</span> ·{" "}
      {new Date(genesis.header.timestamp).toUTCString().replace("GMT", "UTC")}{" "}
      <span style={{ color: "var(--ink-4)" }}>
        · {formatRelativeTime(genesis.header.timestamp)}
      </span>{" "}
      · {formatNumber(allocs)} allocation{allocs === 1 ? "" : "s"} · {formatNumber(contracts)}{" "}
      pre-deployed contract{contracts === 1 ? "" : "s"}
    </>
  );
}

function GenesisUnavailable({ error }: { error: Error }) {
  const notFound = /not[_ ]?found/i.test(error.message);
  return (
    <div className="px-4 sm:px-6 lg:px-10 py-6 sm:py-8 pb-12 max-w-[1080px] mx-auto">
      <div className="eyebrow mb-2.5">Genesis</div>
      <div className="h-display mb-2" style={{ fontSize: 32 }}>
        {notFound ? "Genesis data unavailable" : "Couldn't load genesis"}
      </div>
      <div
        className="card border border-line rounded-[10px] bg-bg-elev"
        style={{ padding: 24, marginTop: 18, maxWidth: 720 }}
      >
        <div style={{ fontSize: 13.5, color: "var(--ink-3)", lineHeight: 1.6 }}>
          {notFound ? (
            <>
              firn doesn&apos;t have a genesis snapshot for this chain. The{" "}
              <code className="mono" style={{ fontSize: 12 }}>
                /v1/genesis
              </code>{" "}
              endpoint requires an index built with a chdb store; the in-memory store skips it.
              Restart firn with{" "}
              <code className="mono" style={{ fontSize: 12 }}>
                -store=chdb
              </code>{" "}
              to populate it.
            </>
          ) : (
            <>The request failed before firn could respond.</>
          )}
        </div>
        <div
          className="mono"
          style={{
            fontSize: 11.5,
            color: "var(--ink-4)",
            marginTop: 14,
            wordBreak: "break-all",
          }}
        >
          {error.message}
        </div>
      </div>
      <div style={{ marginTop: 20 }}>
        <Link href="/blocks/0" className="lat-btn">
          View block 0 →
        </Link>
      </div>
    </div>
  );
}

function OverviewTab({
  genesis,
  isPending,
}: {
  genesis: GenesisResponse | undefined;
  isPending: boolean;
}) {
  if (isPending || !genesis) {
    return (
      <div
        style={{
          marginTop: 28,
          display: "grid",
          gridTemplateColumns: "180px 1fr",
          rowGap: 18,
          columnGap: 32,
        }}
      >
        {Array.from({ length: 8 }).map((_, i) => (
          <DetailRow key={i} label={<Skeleton className="h-3 w-20" />}>
            <Skeleton className="h-4 w-72" />
          </DetailRow>
        ))}
      </div>
    );
  }

  const h = genesis.header;
  const hardforks = genesis.config.hardforks ?? [];
  const activated = hardforks.filter((f) => f.activated);
  const pending = hardforks.filter((f) => !f.activated);

  return (
    <div style={{ marginTop: 28 }}>
      <div
        style={{
          display: "grid",
          gridTemplateColumns: "180px 1fr",
          rowGap: 18,
          columnGap: 32,
        }}
      >
        <DetailRow label="Block height">
          <span className="mono" style={{ fontSize: 13 }}>
            {formatNumber(h.number)}
          </span>
        </DetailRow>
        <DetailRow label="Hash">
          <Hash value={h.hash} tone="plain" length={0} showCopy />
        </DetailRow>
        <DetailRow label="Parent">
          <Hash value={h.parentHash} tone="plain" length={0} />
        </DetailRow>
        <DetailRow label="Coinbase">
          {h.coinbase ? (
            <Hash
              value={h.coinbase}
              tone="link"
              length={0}
              href={`/address/${h.coinbase}`}
              showCopy
            />
          ) : (
            <span style={{ color: "var(--ink-4)" }}>—</span>
          )}
        </DetailRow>
        <DetailRow label="Timestamp">
          <span className="mono" style={{ fontSize: 12.5 }}>
            {new Date(h.timestamp).toUTCString().replace("GMT", "UTC")}{" "}
            <span style={{ color: "var(--ink-4)" }}>· {formatRelativeTime(h.timestamp)}</span>
          </span>
        </DetailRow>
        <DetailRow label="Gas limit">
          <span className="mono" style={{ fontSize: 13 }}>
            {formatNumber(h.gasLimit)}
          </span>
        </DetailRow>
        <DetailRow label="Difficulty">
          <span className="mono" style={{ fontSize: 13 }}>
            {h.difficulty}
          </span>
        </DetailRow>
        <DetailRow label="Mix hash">
          <Hash value={h.mixHash} tone="plain" length={0} />
        </DetailRow>
        <DetailRow label="Nonce">
          <span className="mono" style={{ fontSize: 13 }}>
            {h.nonce}
          </span>
        </DetailRow>
        <DetailRow label="Extra data">
          <span
            className="mono"
            style={{ fontSize: 12, color: "var(--ink-2)", wordBreak: "break-all" }}
          >
            {h.extraData || <span style={{ color: "var(--ink-4)" }}>0x</span>}
          </span>
        </DetailRow>
      </div>

      <section style={{ marginTop: 36 }}>
        <div className="eyebrow mb-2.5">Hardforks at genesis</div>
        {activated.length > 0 ? (
          <div style={{ display: "flex", flexWrap: "wrap", gap: 6 }}>
            {activated.map((f) => (
              <HardforkChip key={f.name} fork={f} tone="good" />
            ))}
          </div>
        ) : (
          <div style={{ fontSize: 12.5, color: "var(--ink-4)" }}>
            No hardforks active at genesis.
          </div>
        )}
      </section>

      {pending.length > 0 ? (
        <section style={{ marginTop: 28 }}>
          <div className="eyebrow mb-2.5">Pending hardforks</div>
          <div style={{ display: "flex", flexWrap: "wrap", gap: 6 }}>
            {pending.map((f) => (
              <HardforkChip key={f.name} fork={f} tone="steel" />
            ))}
          </div>
        </section>
      ) : null}
    </div>
  );
}

function HardforkChip({ fork, tone }: { fork: GenesisHardfork; tone: "good" | "steel" }) {
  const valueLabel =
    fork.value == null
      ? null
      : fork.kind === "timestamp"
        ? new Date(fork.value * 1000).toISOString().replace(".000Z", "Z")
        : `#${formatNumber(fork.value)}`;
  return (
    <span
      title={
        valueLabel
          ? `${fork.name} · ${fork.kind === "timestamp" ? "timestamp" : "block"} ${
              fork.value ?? ""
            }`
          : fork.name
      }
    >
      <Chip tone={tone}>
        <span style={{ fontWeight: 500 }}>{fork.name}</span>
        {valueLabel ? (
          <span className="mono" style={{ marginLeft: 6, color: "var(--ink-4)", fontSize: 10.5 }}>
            {valueLabel}
          </span>
        ) : null}
      </Chip>
    </span>
  );
}

function AllocationsTab({
  genesis,
  isPending,
  symbol,
}: {
  genesis: GenesisResponse | undefined;
  isPending: boolean;
  symbol: string;
}) {
  if (isPending || !genesis) {
    return (
      <div className="card border border-line rounded-[10px] bg-bg-elev mt-6 p-6">
        <Skeleton className="h-4 w-full mb-3" />
        <Skeleton className="h-4 w-full mb-3" />
        <Skeleton className="h-4 w-full" />
      </div>
    );
  }

  const data: GenesisAllocation[] = genesis.allocations.data ?? [];
  const truncated = genesis.allocations.totalCount > data.length;

  return (
    <div style={{ marginTop: 24 }}>
      <div
        style={{
          fontSize: 12.5,
          color: "var(--ink-3)",
          marginBottom: 12,
          lineHeight: 1.55,
        }}
      >
        {truncated ? (
          <>
            Showing top {formatNumber(data.length)} of{" "}
            {formatNumber(genesis.allocations.totalCount)} by balance.
          </>
        ) : (
          <>
            {formatNumber(data.length)} address{data.length === 1 ? "" : "es"} allocated at genesis.
          </>
        )}
      </div>
      <div className="card border border-line rounded-[10px] bg-bg-elev overflow-x-auto">
        <table className="lat-tbl">
          <thead>
            <tr>
              <th>Address</th>
              <th style={{ textAlign: "right", width: 220 }}>Balance</th>
              <th style={{ textAlign: "right", width: 110 }}>Code</th>
              <th style={{ textAlign: "right", width: 100 }}>Storage</th>
              <th style={{ textAlign: "right", width: 90 }}>Nonce</th>
            </tr>
          </thead>
          <tbody>
            {data.length > 0 ? (
              data.map((a) => (
                <tr key={a.address}>
                  <td>
                    <Hash
                      value={a.address}
                      tone="link"
                      length={10}
                      href={`/address/${a.address}`}
                    />
                  </td>
                  <td className="mono" style={{ textAlign: "right", color: "var(--ink)" }}>
                    {formatNativeAmount(a.balance, symbol)}
                  </td>
                  <td className="mono" style={{ textAlign: "right", color: "var(--ink-3)" }}>
                    {a.codeSize > 0 ? `${formatNumber(a.codeSize)} B` : "—"}
                  </td>
                  <td className="mono" style={{ textAlign: "right", color: "var(--ink-3)" }}>
                    {a.storageEntries > 0 ? formatNumber(a.storageEntries) : "—"}
                  </td>
                  <td className="mono" style={{ textAlign: "right", color: "var(--ink-3)" }}>
                    {a.nonce > 0 ? formatNumber(a.nonce) : "—"}
                  </td>
                </tr>
              ))
            ) : (
              <tr>
                <td colSpan={5} className="text-center py-10" style={{ color: "var(--ink-4)" }}>
                  No allocations recorded for this chain.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}

function ContractsTab({
  genesis,
  isPending,
  symbol,
}: {
  genesis: GenesisResponse | undefined;
  isPending: boolean;
  symbol: string;
}) {
  if (isPending || !genesis) {
    return (
      <div className="card border border-line rounded-[10px] bg-bg-elev mt-6 p-6">
        <Skeleton className="h-4 w-full mb-3" />
        <Skeleton className="h-4 w-full" />
      </div>
    );
  }

  const contracts: GenesisContract[] = genesis.contracts ?? [];

  return (
    <div style={{ marginTop: 24 }}>
      <div
        style={{
          fontSize: 12.5,
          color: "var(--ink-3)",
          marginBottom: 12,
          lineHeight: 1.55,
        }}
      >
        Contracts present at genesis. Each one has a synthetic transaction record so it shows up in
        normal transaction views — click the tx hash to inspect it.
      </div>
      <div className="card border border-line rounded-[10px] bg-bg-elev overflow-x-auto">
        <table className="lat-tbl">
          <thead>
            <tr>
              <th>Address</th>
              <th style={{ width: 110, textAlign: "right" }}>Code size</th>
              <th>Code hash</th>
              <th style={{ textAlign: "right", width: 200 }}>Balance</th>
              <th style={{ width: 110 }}>Kind</th>
              <th style={{ width: 160 }}>Tx</th>
            </tr>
          </thead>
          <tbody>
            {contracts.length > 0 ? (
              contracts.map((c) => (
                <tr key={c.address}>
                  <td>
                    <Hash
                      value={c.address}
                      tone="link"
                      length={10}
                      href={`/address/${c.address}`}
                    />
                  </td>
                  <td className="mono" style={{ textAlign: "right", color: "var(--ink-2)" }}>
                    {formatNumber(c.codeSize)} B
                  </td>
                  <td>
                    <Hash value={c.codeHash} tone="plain" length={10} />
                  </td>
                  <td className="mono" style={{ textAlign: "right", color: "var(--ink)" }}>
                    {formatNativeAmount(c.balance, symbol)}
                  </td>
                  <td>
                    {c.isPrecompile ? <Chip tone="steel">Precompile</Chip> : <Chip>Contract</Chip>}
                  </td>
                  <td>
                    {c.txHash ? (
                      <Hash
                        value={c.txHash}
                        tone="link"
                        length={8}
                        href={`/transactions/${c.txHash}`}
                      />
                    ) : (
                      <span style={{ color: "var(--ink-4)" }}>—</span>
                    )}
                  </td>
                </tr>
              ))
            ) : (
              <tr>
                <td colSpan={6} className="text-center py-10" style={{ color: "var(--ink-4)" }}>
                  No pre-deployed contracts in this genesis.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}

function ConfigTab({
  genesis,
  isPending,
}: {
  genesis: GenesisResponse | undefined;
  isPending: boolean;
}) {
  if (isPending || !genesis) {
    return (
      <div className="card border border-line rounded-[10px] bg-bg-elev mt-6 p-6">
        <Skeleton className="h-4 w-full mb-3" />
        <Skeleton className="h-4 w-full" />
      </div>
    );
  }

  const precompiles: GenesisPrecompile[] = genesis.config.precompiles ?? [];
  const feeConfig: GenesisConfigFeeConfig | undefined = genesis.config.feeConfig;

  return (
    <div style={{ marginTop: 24, display: "flex", flexDirection: "column", gap: 28 }}>
      <section>
        <div className="eyebrow mb-2.5">Precompiles</div>
        {precompiles.length > 0 ? (
          <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
            {precompiles.map((p) => (
              <PrecompileCard key={`${p.key}-${p.address}`} precompile={p} />
            ))}
          </div>
        ) : (
          <div
            className="card border border-line rounded-[10px] bg-bg-elev"
            style={{ padding: 18, fontSize: 13, color: "var(--ink-3)" }}
          >
            No precompiles configured at genesis.
          </div>
        )}
      </section>

      <section>
        <div className="eyebrow mb-2.5">Fee config</div>
        {feeConfig && Object.keys(feeConfig).length > 0 ? (
          <JsonBlock value={feeConfig} />
        ) : (
          <div
            className="card border border-line rounded-[10px] bg-bg-elev"
            style={{ padding: 18, fontSize: 13, color: "var(--ink-3)" }}
          >
            No fee config — chain uses subnet-evm defaults.
          </div>
        )}
      </section>

      <section>
        <div className="eyebrow mb-2.5">Allow fee recipients</div>
        <Chip tone={genesis.config.allowFeeRecipients ? "good" : "steel"}>
          {genesis.config.allowFeeRecipients ? "Enabled" : "Disabled"}
        </Chip>
      </section>
    </div>
  );
}

function PrecompileCard({ precompile: p }: { precompile: GenesisPrecompile }) {
  const [open, setOpen] = useState(false);
  const hasConfig = p.config && Object.keys(p.config).length > 0;
  return (
    <div className="card border border-line rounded-[10px] bg-bg-elev" style={{ padding: 16 }}>
      <div
        style={{
          display: "grid",
          gridTemplateColumns: "1fr auto",
          alignItems: "center",
          gap: 14,
        }}
      >
        <div>
          <div style={{ fontSize: 14, fontWeight: 500, color: "var(--ink)" }}>
            {p.name}{" "}
            <span className="mono" style={{ fontSize: 11.5, color: "var(--ink-4)" }}>
              · {p.key}
            </span>
          </div>
          <div style={{ fontSize: 12, color: "var(--ink-3)", marginTop: 4 }}>
            <Hash value={p.address} tone="link" length={10} href={`/address/${p.address}`} />
            {p.blockTimestamp != null ? (
              <span style={{ marginLeft: 10, color: "var(--ink-4)" }}>
                · activates{" "}
                <span className="mono">
                  {new Date(p.blockTimestamp * 1000).toISOString().replace(".000Z", "Z")}
                </span>
              </span>
            ) : null}
          </div>
        </div>
        <div style={{ display: "flex", gap: 6, alignItems: "center" }}>
          {p.disable ? <Chip tone="bad">Disabled</Chip> : <Chip tone="good">Active</Chip>}
        </div>
      </div>
      {hasConfig ? (
        <div style={{ marginTop: 12 }}>
          <button
            type="button"
            onClick={() => setOpen((v) => !v)}
            className="mono"
            style={{
              fontSize: 11.5,
              color: "var(--ink-3)",
              background: "transparent",
              border: "none",
              padding: 0,
              cursor: "pointer",
              textDecoration: "underline",
              textUnderlineOffset: 3,
            }}
          >
            {open ? "Hide config" : "Show config"}
          </button>
          {open ? (
            <div style={{ marginTop: 8 }}>
              <JsonBlock value={p.config} />
            </div>
          ) : null}
        </div>
      ) : null}
    </div>
  );
}

function UpgradesTab({
  genesis,
  isPending,
}: {
  genesis: GenesisResponse | undefined;
  isPending: boolean;
}) {
  if (isPending || !genesis) {
    return (
      <div className="card border border-line rounded-[10px] bg-bg-elev mt-6 p-6">
        <Skeleton className="h-4 w-full mb-3" />
        <Skeleton className="h-4 w-full" />
      </div>
    );
  }

  const u: GenesisUpgrades = genesis.upgrades;
  const precompileUpgrades: GenesisUpgradesPrecompileUpgradesItem[] = u.precompileUpgrades ?? [];
  const stateUpgrades: GenesisUpgradesStateUpgradesItem[] = u.stateUpgrades ?? [];
  const networkUpgrades: GenesisUpgradesNetworkUpgrades | undefined = u.networkUpgrades;
  const raw: GenesisUpgradesRaw | undefined = u.raw;

  const empty =
    precompileUpgrades.length === 0 &&
    stateUpgrades.length === 0 &&
    !(networkUpgrades && Object.keys(networkUpgrades).length > 0) &&
    !(raw && Object.keys(raw).length > 0);

  if (empty) {
    return (
      <div
        className="card border border-line rounded-[10px] bg-bg-elev"
        style={{ padding: 24, marginTop: 24, fontSize: 13, color: "var(--ink-3)" }}
      >
        This chain has no scheduled upgrades.
      </div>
    );
  }

  return (
    <div style={{ marginTop: 24, display: "flex", flexDirection: "column", gap: 28 }}>
      <section>
        <div className="eyebrow mb-2.5">
          Precompile upgrades
          {precompileUpgrades.length > 0 ? (
            <span style={{ marginLeft: 6, color: "var(--ink-4)" }}>
              · {formatNumber(precompileUpgrades.length)}
            </span>
          ) : null}
        </div>
        {precompileUpgrades.length > 0 ? (
          <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
            {precompileUpgrades.map((u, i) => (
              <CollapsibleJson key={i} label={`Upgrade ${i + 1}`} value={u} />
            ))}
          </div>
        ) : (
          <EmptyHint>No scheduled precompile upgrades.</EmptyHint>
        )}
      </section>

      <section>
        <div className="eyebrow mb-2.5">
          State upgrades
          {stateUpgrades.length > 0 ? (
            <span style={{ marginLeft: 6, color: "var(--ink-4)" }}>
              · {formatNumber(stateUpgrades.length)}
            </span>
          ) : null}
        </div>
        {stateUpgrades.length > 0 ? (
          <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
            {stateUpgrades.map((u, i) => (
              <CollapsibleJson key={i} label={`Upgrade ${i + 1}`} value={u} />
            ))}
          </div>
        ) : (
          <EmptyHint>No scheduled state upgrades.</EmptyHint>
        )}
      </section>

      <section>
        <div className="eyebrow mb-2.5">Network upgrades</div>
        {networkUpgrades && Object.keys(networkUpgrades).length > 0 ? (
          <CollapsibleJson label="networkUpgrades" value={networkUpgrades} defaultOpen />
        ) : (
          <EmptyHint>No network upgrade overrides.</EmptyHint>
        )}
      </section>

      {raw && Object.keys(raw).length > 0 ? (
        <section>
          <div className="eyebrow mb-2.5">Raw upgrade payload</div>
          <CollapsibleJson label="raw" value={raw} />
        </section>
      ) : null}
    </div>
  );
}

function ERC20Tab({
  genesis,
  isPending,
}: {
  genesis: GenesisResponse | undefined;
  isPending: boolean;
}) {
  if (isPending || !genesis) {
    return (
      <div className="card border border-line rounded-[10px] bg-bg-elev mt-6 p-6">
        <Skeleton className="h-4 w-full mb-3" />
        <Skeleton className="h-4 w-full" />
      </div>
    );
  }

  const balances: GenesisERC20Balance[] = genesis.erc20Balances ?? [];

  return (
    <div style={{ marginTop: 24 }}>
      <div
        style={{
          fontSize: 12.5,
          color: "var(--ink-3)",
          marginBottom: 12,
          lineHeight: 1.55,
          maxWidth: 720,
        }}
      >
        Decoded heuristically from contract storage at genesis. Slot column may be 0 today —
        forward-compat field while the decoder learns more storage layouts.
      </div>
      <div className="card border border-line rounded-[10px] bg-bg-elev overflow-x-auto">
        <table className="lat-tbl">
          <thead>
            <tr>
              <th>Contract</th>
              <th>Holder</th>
              <th style={{ textAlign: "right" }}>Value</th>
              <th style={{ textAlign: "right", width: 90 }}>Slot</th>
            </tr>
          </thead>
          <tbody>
            {balances.length > 0 ? (
              balances.map((b, i) => (
                <tr key={`${b.contract}-${b.holder}-${i}`}>
                  <td>
                    <Hash
                      value={b.contract}
                      tone="link"
                      length={10}
                      href={`/address/${b.contract}`}
                    />
                  </td>
                  <td>
                    <Hash value={b.holder} tone="link" length={10} href={`/address/${b.holder}`} />
                  </td>
                  <td className="mono" style={{ textAlign: "right", color: "var(--ink)" }}>
                    {b.value}
                  </td>
                  <td className="mono" style={{ textAlign: "right", color: "var(--ink-3)" }}>
                    {b.slot}
                  </td>
                </tr>
              ))
            ) : (
              <tr>
                <td colSpan={4} className="text-center py-10" style={{ color: "var(--ink-4)" }}>
                  No ERC-20 balances decoded at genesis.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}

function RawTab({
  genesis,
  isPending,
}: {
  genesis: GenesisResponse | undefined;
  isPending: boolean;
}) {
  if (isPending || !genesis) {
    return (
      <div className="card border border-line rounded-[10px] bg-bg-elev mt-6 p-6">
        <Skeleton className="h-32 w-full" />
      </div>
    );
  }

  return (
    <div style={{ marginTop: 24, display: "flex", flexDirection: "column", gap: 24 }}>
      <RawJsonBlock label="genesis.json" value={genesis.raw.genesisJson} defaultOpen />
      {genesis.raw.upgradeJson && genesis.raw.upgradeJson.trim().length > 0 ? (
        <RawJsonBlock label="upgrade.json" value={genesis.raw.upgradeJson} />
      ) : null}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Shared bits
// ---------------------------------------------------------------------------

function EmptyHint({ children }: { children: React.ReactNode }) {
  return (
    <div
      className="card border border-line rounded-[10px] bg-bg-elev"
      style={{ padding: 16, fontSize: 12.5, color: "var(--ink-4)" }}
    >
      {children}
    </div>
  );
}

function JsonBlock({ value }: { value: unknown }) {
  const text = JSON.stringify(value, null, 2);
  return (
    <div style={{ position: "relative" }}>
      <div style={{ position: "absolute", top: 8, right: 8, zIndex: 1 }}>
        <CopyButton text={text} />
      </div>
      <pre
        style={{
          margin: 0,
          padding: 14,
          background: "var(--bg-sunken)",
          border: "1px solid var(--line)",
          borderRadius: 8,
          fontSize: 12,
          color: "var(--ink-2)",
          fontFamily: "var(--font-mono), ui-monospace, monospace",
          maxHeight: 360,
          overflow: "auto",
          whiteSpace: "pre-wrap",
          wordBreak: "break-all",
        }}
      >
        {text}
      </pre>
    </div>
  );
}

function CollapsibleJson({
  label,
  value,
  defaultOpen = false,
}: {
  label: string;
  value: unknown;
  defaultOpen?: boolean;
}) {
  const [open, setOpen] = useState(defaultOpen);
  return (
    <div
      className="card border border-line rounded-[10px] bg-bg-elev"
      style={{ overflow: "hidden" }}
    >
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        style={{
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          width: "100%",
          padding: "12px 16px",
          background: "transparent",
          border: "none",
          color: "var(--ink-2)",
          cursor: "pointer",
          fontFamily: "var(--font-mono), ui-monospace, monospace",
          fontSize: 12,
        }}
      >
        <span>{label}</span>
        <span style={{ color: "var(--ink-4)", fontSize: 11 }}>{open ? "Hide" : "Show"}</span>
      </button>
      {open ? (
        <div style={{ borderTop: "1px solid var(--line-soft)", padding: 12 }}>
          <JsonBlock value={value} />
        </div>
      ) : null}
    </div>
  );
}

function RawJsonBlock({
  label,
  value,
  defaultOpen = false,
}: {
  label: string;
  value: string;
  defaultOpen?: boolean;
}) {
  const [open, setOpen] = useState(defaultOpen);
  // Re-pretty when possible. firn returns the on-disk JSON verbatim, but
  // some chains store it minified; pretty-printing in the browser keeps
  // the visual diff against /v1/blocks/0 sane regardless of how the
  // operator authored the file.
  const pretty = (() => {
    try {
      return JSON.stringify(JSON.parse(value), null, 2);
    } catch {
      return value;
    }
  })();
  const sizeBytes = new Blob([value]).size;
  return (
    <div
      className="card border border-line rounded-[10px] bg-bg-elev"
      style={{ overflow: "hidden" }}
    >
      <div
        style={{
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          padding: "12px 16px",
          gap: 12,
        }}
      >
        <button
          type="button"
          onClick={() => setOpen((v) => !v)}
          style={{
            background: "transparent",
            border: "none",
            color: "var(--ink-2)",
            cursor: "pointer",
            fontFamily: "var(--font-mono), ui-monospace, monospace",
            fontSize: 12,
            padding: 0,
            display: "inline-flex",
            alignItems: "center",
            gap: 8,
          }}
        >
          <span>{label}</span>
          <span style={{ color: "var(--ink-4)", fontSize: 11 }}>
            · {formatNumber(sizeBytes)} B · {open ? "hide" : "show"}
          </span>
        </button>
        <CopyButton text={pretty} />
      </div>
      {open ? (
        <pre
          style={{
            margin: 0,
            padding: 16,
            background: "var(--bg-sunken)",
            borderTop: "1px solid var(--line-soft)",
            fontSize: 12,
            color: "var(--ink-2)",
            fontFamily: "var(--font-mono), ui-monospace, monospace",
            maxHeight: 480,
            overflow: "auto",
            whiteSpace: "pre-wrap",
            wordBreak: "break-all",
          }}
        >
          {pretty}
        </pre>
      ) : null}
    </div>
  );
}
