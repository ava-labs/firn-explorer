"use client";

import { use, useMemo, useState } from "react";
import Link from "next/link";
import type { ReactNode } from "react";
import { Chip } from "@/components/lattice/chip";
import { CopyButton } from "@/components/lattice/copy-button";
import { Tabs } from "@/components/lattice/tabs";
import { Skeleton } from "@/components/ui/skeleton";
import { useChain, useL1Uptime, useL1Validator, useValidators } from "@/lib/api/queries";
import type { L1ValidatorDetails, RewardOwner, Validator } from "@/lib/api/queries";
import { useNowTick } from "@/lib/use-fresh";
import { formatNumber } from "@/lib/format";

const PRIMARY_SUBNET_ID = "11111111111111111111111111111111LpoYY";

type TabId = "overview" | "bls" | "owners" | "delegators" | "raw";

export default function ValidatorDetailPage({ params }: { params: Promise<{ nodeID: string }> }) {
  const { nodeID: rawID } = use(params);
  const nodeID = decodeURIComponent(rawID);

  const { data: chain } = useChain();
  const { data: vsResp, isPending, error } = useValidators();
  // Optional subnet-evm /validators uptime data (may be 503 if not wired).
  const { data: l1Uptime } = useL1Uptime();
  useNowTick(60_000);

  const [tab, setTab] = useState<TabId>("overview");

  const symbol = chain?.nativeToken.symbol ?? "AVAX";
  const isPrimary = chain?.subnetId === PRIMARY_SUBNET_ID;

  const v = useMemo<Validator | undefined>(
    () => vsResp?.validators.find((x) => x.nodeID === nodeID),
    [vsResp, nodeID],
  );

  const l1UpEntry = useMemo(
    () => l1Uptime?.validators.find((x) => x.nodeID === nodeID),
    [l1Uptime, nodeID],
  );
  // Resolved uptime: subnet-evm /validators wins over P-Chain `v.uptime`.
  const resolvedUptime: string | number | undefined =
    l1UpEntry?.uptimePercent ?? l1UpEntry?.uptime ?? v?.uptime;
  const uptimeSource: string | undefined = l1UpEntry
    ? "subnet-evm validators.getCurrentValidators"
    : v?.uptime
      ? "platform.getCurrentValidators"
      : undefined;

  const {
    data: l1,
    isPending: l1Loading,
    error: l1Error,
  } = useL1Validator(!isPrimary ? v?.validationID : undefined);

  const totalWeight = useMemo(() => {
    if (!vsResp?.validators) return 0n;
    let t = 0n;
    for (const x of vsResp.validators) {
      try {
        t += BigInt(x.weight ?? "0");
      } catch {
        /* skip */
      }
    }
    return t;
  }, [vsResp]);

  const sharePct = useMemo(() => {
    if (!v) return 0;
    try {
      const w = BigInt(v.weight ?? "0");
      if (totalWeight === 0n) return 0;
      return Number((w * 10000n) / totalWeight) / 100;
    } catch {
      return 0;
    }
  }, [v, totalWeight]);

  if (error) {
    return (
      <Page>
        <BackLink />
        <div className="eyebrow mb-2.5">◆ Validator</div>
        <div
          className="border rounded-md p-4 mb-6 max-w-2xl"
          style={{
            borderColor: "var(--accent-soft)",
            background: "var(--accent-soft)",
            color: "var(--accent-ink)",
            fontSize: 13,
          }}
        >
          <div style={{ fontWeight: 500, marginBottom: 4 }}>Couldn&apos;t load validators</div>
          <div className="mono" style={{ fontSize: 11.5, color: "var(--ink-3)" }}>
            {error.message}
          </div>
        </div>
      </Page>
    );
  }

  if (isPending || !vsResp) {
    return (
      <Page>
        <BackLink />
        <div className="eyebrow mb-2.5">◆ Validator</div>
        <div className="flex items-center gap-3.5 mb-[22px]">
          <Skeleton className="h-6 w-72" />
        </div>
        <div
          className="card border border-line rounded-[10px] bg-bg-elev"
          style={{ padding: "24px 28px", marginBottom: 28 }}
        >
          <Skeleton className="h-9 w-full" />
        </div>
      </Page>
    );
  }

  if (!v) {
    return (
      <Page>
        <BackLink />
        <div className="eyebrow mb-2.5">◆ Validator</div>
        <div className="h-display mb-2" style={{ fontSize: 32 }}>
          Not found
        </div>
        <div style={{ fontSize: 13.5, color: "var(--ink-3)", marginBottom: 16 }}>
          No validator with{" "}
          <code className="mono" style={{ fontSize: 12 }}>
            {nodeID}
          </code>{" "}
          in the active set for subnet{" "}
          <code className="mono" style={{ fontSize: 12 }}>
            {chain?.subnetId ?? "—"}
          </code>
          .
        </div>
        <Link href="/validators" className="lat-btn">
          ← Back to validators
        </Link>
      </Page>
    );
  }

  const blsPubkey = v.publicKey ?? v.signer?.publicKey ?? l1?.publicKey;
  const pop = v.signer?.proofOfPossession;
  const balance = !isPrimary && v.validationID ? l1?.balance : undefined;
  const ownerCount =
    (l1?.remainingBalanceOwner ? 1 : 0) +
    (l1?.deactivationOwner ? 1 : 0) +
    (v.validationRewardOwner ? 1 : 0) +
    (v.delegationRewardOwner ? 1 : 0);
  const delegatorN = v.delegators?.length ?? 0;

  const valueWeight = isPrimary
    ? formatAvax(v.stakeAmount ?? v.weight, symbol)
    : `${formatWeight(v.weight)} weight`;

  return (
    <Page>
      <BackLink />
      <div className="eyebrow mb-2.5">◆ Validator</div>

      {/* Headline */}
      <div className="flex items-start gap-3.5 mb-[22px] flex-wrap">
        <span
          className="h-display mono"
          style={{
            fontSize: 20,
            lineHeight: 1.2,
            wordBreak: "break-all",
            flex: "1 1 auto",
            minWidth: 0,
          }}
        >
          {v.nodeID}
        </span>
        <CopyButton text={v.nodeID} size={14} />
        <Chip tone={v.connected === false ? "steel" : "good"}>
          {v.connected === false ? "○ Offline" : v.connected ? "● Live" : "● Active"}
        </Chip>
        <Chip tone="steel">
          {v.validationID ? "L1 · ACP-77" : isPrimary ? "Primary Network" : "Subnet"}
        </Chip>
      </div>

      {/* Summary card */}
      <div
        className="card border border-line rounded-[10px] bg-bg-elev"
        style={{ padding: "24px 28px", marginBottom: 28 }}
      >
        <div className="eyebrow" style={{ marginBottom: 6 }}>
          Summary
        </div>
        <div
          style={{
            fontFamily: "var(--font-display), ui-sans-serif, system-ui, sans-serif",
            fontSize: 26,
            fontWeight: 500,
            lineHeight: 1.25,
            letterSpacing: "-0.015em",
          }}
        >
          <span style={{ color: "var(--ink-3)" }}>
            {isPrimary ? "Primary Network validator" : "Securing"}
          </span>{" "}
          {!isPrimary ? (
            <>
              <span>{chain?.name ?? "this L1"}</span>{" "}
              <span style={{ color: "var(--ink-3)" }}>with</span>{" "}
            </>
          ) : (
            <span style={{ color: "var(--ink-3)" }}>staking</span>
          )}{" "}
          <span style={{ color: "var(--accent-ink)" }}>{valueWeight}</span>
          <span style={{ color: "var(--ink-3)" }}> ·</span> <span>{sharePct.toFixed(2)}%</span>{" "}
          <span style={{ color: "var(--ink-3)" }}>voting share.</span>
          {balance ? (
            <>
              {" "}
              <span style={{ color: "var(--ink-3)" }}>Fee balance</span>{" "}
              <span>{formatAvax(balance, symbol)}.</span>
            </>
          ) : null}
        </div>
        <div
          style={{
            fontSize: 12.5,
            color: "var(--ink-4)",
            marginTop: 14,
            fontFamily: "var(--font-mono), ui-monospace, monospace",
          }}
        >
          {resolvedUptime !== undefined && resolvedUptime !== ""
            ? `Uptime ${formatUptime(resolvedUptime)} · `
            : ""}
          {formatPeriodRemaining(v.endTime)} remaining · ends {formatAbsoluteTime(v.endTime)}
        </div>
      </div>

      {/* Voting share bar */}
      <div className="mb-7">
        <div className="flex items-center gap-3">
          <div
            style={{
              flex: 1,
              height: 5,
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
          <div
            className="mono"
            style={{ fontSize: 11.5, color: "var(--ink-3)", minWidth: 70, textAlign: "right" }}
          >
            {sharePct.toFixed(4)}%
          </div>
        </div>
      </div>

      <Tabs
        active={tab}
        onChange={(id) => setTab(id as TabId)}
        tabs={[
          { id: "overview", label: "Overview" },
          { id: "bls", label: "BLS", disabled: !blsPubkey },
          { id: "owners", label: "Owners", count: ownerCount || null },
          {
            id: "delegators",
            label: "Delegators",
            count: delegatorN || null,
            disabled: delegatorN === 0,
          },
          { id: "raw", label: "Raw" },
        ]}
      />

      {tab === "overview" && (
        <Grid>
          <DetailRow label="Node ID">
            <FullMono value={v.nodeID} />
          </DetailRow>

          {v.validationID ? (
            <DetailRow label="Validation ID">
              <FullMono value={v.validationID} />
            </DetailRow>
          ) : null}

          <DetailRow label="Add-validator txID">
            <FullMono value={v.txID} />
          </DetailRow>

          {chain?.subnetId ? (
            <DetailRow label="Subnet">
              <FullMono value={chain.subnetId} />
            </DetailRow>
          ) : null}

          <DetailRow label={isPrimary ? "Stake" : "Weight"}>
            <span className="mono" style={{ fontSize: 13 }}>
              {isPrimary ? (
                formatAvax(v.stakeAmount ?? v.weight, symbol)
              ) : (
                <>
                  {formatWeight(v.weight)}{" "}
                  <span style={{ color: "var(--ink-4)" }}>· {v.weight}</span>
                </>
              )}
            </span>
          </DetailRow>

          <DetailRow label="Voting share">
            <span className="mono" style={{ fontSize: 13 }}>
              {sharePct.toFixed(4)}%{" "}
              <span style={{ color: "var(--ink-4)" }}>
                of {vsResp.validators.length} validator{vsResp.validators.length === 1 ? "" : "s"}
              </span>
            </span>
          </DetailRow>

          {!isPrimary ? (
            <DetailRow label="AVAX balance">
              {balanceCellLong({ isPrimary, v, l1, l1Loading, l1Error, symbol })}
            </DetailRow>
          ) : null}

          <DetailRow label="Uptime">
            {resolvedUptime !== undefined && resolvedUptime !== "" ? (
              <span className="mono" style={{ fontSize: 13 }}>
                {formatUptime(resolvedUptime)}{" "}
                {uptimeSource ? (
                  <span style={{ color: "var(--ink-4)", fontSize: 11 }}>· via {uptimeSource}</span>
                ) : null}
              </span>
            ) : (
              <span className="mono" style={{ fontSize: 12, color: "var(--ink-4)" }}>
                no uptime reported · firn must run with -rpc to enable subnet-evm /validators proxy
              </span>
            )}
          </DetailRow>

          <DetailRow label="Started">
            <span className="mono" style={{ fontSize: 12.5 }}>
              {formatAbsoluteTime(v.startTime)}{" "}
              <span style={{ color: "var(--ink-4)" }}>· unix {v.startTime}</span>
            </span>
          </DetailRow>

          <DetailRow label="Ends">
            <span className="mono" style={{ fontSize: 12.5 }}>
              {formatAbsoluteTime(v.endTime)}{" "}
              <span style={{ color: "var(--ink-4)" }}>
                · {formatPeriodRemaining(v.endTime)} remaining
              </span>
            </span>
          </DetailRow>

          {v.delegationFee ? (
            <DetailRow label="Delegation fee">
              <span className="mono" style={{ fontSize: 13 }}>
                {formatFee(v.delegationFee)}
              </span>
            </DetailRow>
          ) : null}

          {v.potentialReward ? (
            <DetailRow label="Potential reward">
              <span className="mono" style={{ fontSize: 13 }}>
                {formatAvax(v.potentialReward, symbol)}
              </span>
            </DetailRow>
          ) : null}

          {v.delegatorWeight ? (
            <DetailRow label="Delegator weight">
              <span className="mono" style={{ fontSize: 13 }}>
                {formatWeight(v.delegatorWeight)}{" "}
                <span style={{ color: "var(--ink-4)" }}>· {v.delegatorWeight}</span>
              </span>
            </DetailRow>
          ) : null}

          {l1?.minNonce ? (
            <DetailRow label="Min nonce">
              <span className="mono" style={{ fontSize: 13 }}>
                {l1.minNonce}
              </span>
            </DetailRow>
          ) : null}
        </Grid>
      )}

      {tab === "bls" && blsPubkey ? (
        <Grid>
          <DetailRow label="Public key">
            <span
              className="mono"
              style={{
                fontSize: 12,
                wordBreak: "break-all",
                display: "inline-flex",
                alignItems: "center",
                gap: 6,
              }}
            >
              {blsPubkey}
              <CopyButton text={blsPubkey} />
            </span>
          </DetailRow>
          {pop ? (
            <DetailRow label="Proof of possession">
              <span
                className="mono"
                style={{
                  fontSize: 12,
                  wordBreak: "break-all",
                  display: "inline-flex",
                  alignItems: "center",
                  gap: 6,
                }}
              >
                {pop}
                <CopyButton text={pop} />
              </span>
            </DetailRow>
          ) : null}
          <DetailRow label="Source">
            <span style={{ fontSize: 12.5, color: "var(--ink-4)" }}>
              {v.publicKey
                ? "platform.getCurrentValidators (top-level publicKey)"
                : v.signer?.publicKey
                  ? "platform.getCurrentValidators (signer.publicKey)"
                  : "platform.getL1Validator"}
            </span>
          </DetailRow>
        </Grid>
      ) : null}

      {tab === "owners" && (
        <Grid>
          {l1?.remainingBalanceOwner ? (
            <OwnerRow
              label="Remaining balance"
              owner={l1.remainingBalanceOwner}
              hint="May withdraw the remaining AVAX fee balance"
            />
          ) : null}
          {l1?.deactivationOwner ? (
            <OwnerRow
              label="Deactivation"
              owner={l1.deactivationOwner}
              hint="May force-deactivate this L1 validator"
            />
          ) : null}
          {v.validationRewardOwner ? (
            <OwnerRow label="Validation rewards" owner={v.validationRewardOwner} />
          ) : null}
          {v.delegationRewardOwner ? (
            <OwnerRow label="Delegation rewards" owner={v.delegationRewardOwner} />
          ) : null}
          {ownerCount === 0 ? (
            <DetailRow label="">
              <span style={{ fontSize: 13, color: "var(--ink-4)" }}>
                No P-Chain owner records returned for this validator.
              </span>
            </DetailRow>
          ) : null}
        </Grid>
      )}

      {tab === "delegators" && v.delegators && v.delegators.length > 0 ? (
        <div className="card border border-line rounded-[10px] bg-bg-elev mt-7">
          <table className="lat-tbl">
            <thead>
              <tr>
                <th>Delegator txID</th>
                <th style={{ textAlign: "right", width: 140 }}>Stake</th>
                <th style={{ textAlign: "right", width: 130 }}>Potential reward</th>
                <th style={{ textAlign: "right", width: 110 }}>Period left</th>
              </tr>
            </thead>
            <tbody>
              {v.delegators.map((d) => (
                <tr key={d.txID}>
                  <td>
                    <span
                      className="mono"
                      style={{
                        fontSize: 11.5,
                        color: "var(--ink-2)",
                        wordBreak: "break-all",
                      }}
                    >
                      {d.txID}
                    </span>
                  </td>
                  <td className="mono" style={{ textAlign: "right" }}>
                    {formatAvax(d.stakeAmount, symbol)}
                  </td>
                  <td className="mono" style={{ textAlign: "right" }}>
                    {d.potentialReward ? formatAvax(d.potentialReward, symbol) : "—"}
                  </td>
                  <td className="mono" style={{ textAlign: "right" }}>
                    {formatPeriodRemaining(d.endTime)}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : null}

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
            fontFamily: "var(--font-mono), ui-monospace, monospace",
          }}
        >
          {JSON.stringify({ getCurrentValidators: v, getL1Validator: l1 ?? null }, null, 2)}
        </pre>
      )}
    </Page>
  );
}

// ---------------------------------------------------------------------------
// Layout primitives — match tx detail page
// ---------------------------------------------------------------------------

function Page({ children }: { children: ReactNode }) {
  return (
    <div className="px-4 sm:px-6 lg:px-10 py-6 sm:py-8 pb-12 max-w-[1080px] mx-auto">
      {children}
    </div>
  );
}

function BackLink() {
  return (
    <Link
      href="/validators"
      style={{
        fontSize: 12,
        color: "var(--ink-4)",
        textDecoration: "none",
        display: "inline-block",
        marginBottom: 16,
      }}
    >
      ← All validators
    </Link>
  );
}

function Grid({ children }: { children: ReactNode }) {
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
      {children}
    </div>
  );
}

function DetailRow({ label, children }: { label: ReactNode; children: ReactNode }) {
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
      <div style={{ fontSize: 13.5, minWidth: 0 }}>{children}</div>
    </>
  );
}

function OwnerRow({ label, owner, hint }: { label: string; owner: RewardOwner; hint?: string }) {
  const n = owner.addresses?.length ?? 0;
  return (
    <DetailRow label={label}>
      <div className="mono" style={{ fontSize: 11.5, color: "var(--ink-4)", marginBottom: 4 }}>
        {owner.threshold}-of-{n}
        {owner.locktime && owner.locktime !== "0" ? ` · locktime ${owner.locktime}` : ""}
      </div>
      <div className="flex flex-col gap-1">
        {owner.addresses?.map((a) => (
          <span
            key={a}
            className="mono"
            style={{
              fontSize: 12.5,
              color: "var(--ink-2)",
              wordBreak: "break-all",
              display: "inline-flex",
              alignItems: "center",
              gap: 6,
            }}
          >
            {a}
            <CopyButton text={a} />
          </span>
        ))}
        {!n ? <span style={{ fontSize: 12, color: "var(--ink-4)" }}>—</span> : null}
      </div>
      {hint ? (
        <div style={{ fontSize: 11, color: "var(--ink-4)", marginTop: 4 }}>{hint}</div>
      ) : null}
    </DetailRow>
  );
}

// ---------------------------------------------------------------------------
// Cell renderers + formatters
// ---------------------------------------------------------------------------

function balanceCellLong({
  isPrimary,
  v,
  l1,
  l1Loading,
  l1Error,
  symbol,
}: {
  isPrimary: boolean;
  v: Validator;
  l1: L1ValidatorDetails | undefined;
  l1Loading: boolean;
  l1Error: Error | null;
  symbol: string;
}): ReactNode {
  if (isPrimary) {
    return <span style={{ color: "var(--ink-4)" }}>n/a (Primary Network)</span>;
  }
  if (!v.validationID) {
    return <span style={{ color: "var(--ink-4)" }}>n/a (classic subnet validator)</span>;
  }
  if (l1Loading) return <Skeleton className="h-4 w-40 inline-block" />;
  if (l1Error) {
    return (
      <span className="mono" style={{ fontSize: 12, color: "var(--ink-4)" }}>
        platform.getL1Validator failed: {l1Error.message}
      </span>
    );
  }
  if (!l1?.balance) return <span style={{ color: "var(--ink-4)" }}>—</span>;
  return (
    <span className="mono" style={{ fontSize: 13 }}>
      {formatAvax(l1.balance, symbol)}{" "}
      <span style={{ color: "var(--ink-4)" }}>· {l1.balance} nAVAX · pays continuous fees</span>
    </span>
  );
}

/** Mono-display the full value (no truncation) with a copy button. */
function FullMono({ value }: { value: string }) {
  return (
    <span
      className="mono"
      style={{
        fontSize: 12.5,
        color: "var(--ink-2)",
        wordBreak: "break-all",
        display: "inline-flex",
        alignItems: "center",
        gap: 6,
      }}
    >
      <span style={{ minWidth: 0 }}>{value}</span>
      <CopyButton text={value} />
    </span>
  );
}

function formatAvax(nano: string | undefined, symbol: string): string {
  if (!nano) return `— ${symbol}`;
  let n: bigint;
  try {
    n = BigInt(nano);
  } catch {
    return `— ${symbol}`;
  }
  if (n === 0n) return `0 ${symbol}`;
  const NAVAX = 1_000_000_000n;
  const whole = n / NAVAX;
  const frac = (n % NAVAX) / 10_000_000n;
  const wholeNum = Number(whole);
  const compact =
    wholeNum >= 1_000_000
      ? `${(wholeNum / 1_000_000).toFixed(2)}M`
      : wholeNum >= 1_000
        ? `${(wholeNum / 1_000).toFixed(2)}K`
        : `${formatNumber(wholeNum)}.${frac.toString().padStart(2, "0")}`;
  return `${compact} ${symbol}`;
}

function formatWeight(w: string | undefined): string {
  if (!w) return "—";
  let n: bigint;
  try {
    n = BigInt(w);
  } catch {
    return w;
  }
  if (n === 0n) return "0";
  if (n < 1_000n) return n.toString();
  if (n < 1_000_000n) return `${(Number(n) / 1_000).toFixed(2)}K`;
  if (n < 1_000_000_000n) return `${(Number(n) / 1_000_000).toFixed(2)}M`;
  if (n < 1_000_000_000_000n) return `${(Number(n) / 1_000_000_000).toFixed(2)}B`;
  return `${(Number(n) / 1e12).toFixed(2)}T`;
}

function formatUptime(uptime: string | number | undefined): string {
  if (uptime === undefined || uptime === null || uptime === "") return "—";
  const n = typeof uptime === "number" ? uptime : parseFloat(uptime);
  if (Number.isNaN(n)) return "—";
  // P-Chain returns 0..1 fractional ratio; subnet-evm validators returns 0..100.
  // Detect by magnitude.
  const pct = n <= 1 ? n * 100 : n;
  return `${pct.toFixed(2)}%`;
}

function formatFee(fee: string | undefined): string {
  if (!fee) return "—";
  const n = parseFloat(fee);
  if (Number.isNaN(n)) return "—";
  return `${n.toFixed(2)}%`;
}

function parsePChainTime(s: string | undefined): number | null {
  if (!s) return null;
  const n = Number(s);
  if (Number.isFinite(n) && n > 1_000_000_000) return n * 1000;
  const t = Date.parse(s);
  return Number.isFinite(t) ? t : null;
}

function formatPeriodRemaining(end: string | undefined): string {
  const ms = parsePChainTime(end);
  if (ms == null) return "—";
  const diff = ms - Date.now();
  if (diff <= 0) return "ended";
  const sec = Math.floor(diff / 1000);
  const day = Math.floor(sec / 86_400);
  if (day >= 365) {
    const y = Math.floor(day / 365);
    const d = day % 365;
    return d ? `${y}y ${d}d` : `${y}y`;
  }
  if (day >= 1) {
    const hr = Math.floor((sec % 86_400) / 3600);
    return hr ? `${day}d ${hr}h` : `${day}d`;
  }
  const hr = Math.floor(sec / 3600);
  if (hr >= 1) {
    const min = Math.floor((sec % 3600) / 60);
    return min ? `${hr}h ${min}m` : `${hr}h`;
  }
  return `${Math.max(1, Math.floor(sec / 60))}m`;
}

function formatAbsoluteTime(s: string | undefined): string {
  const ms = parsePChainTime(s);
  if (ms == null) return "—";
  return new Date(ms).toLocaleString(undefined, {
    year: "numeric",
    month: "short",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}
