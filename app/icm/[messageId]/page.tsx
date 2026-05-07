"use client";

/**
 * ICM message detail — full timeline + decoded payload for one bytes32
 * messageId.
 *
 * Why a dedicated page exists: the index page (/icm) is optimised for
 * scanning a stream of recent events, with one row per log. A single
 * cross-chain message produces 1–4 events along its lifecycle (Send →
 * Receive → Executed/Failed → ReceiptReceived) and the user wants to
 * see *all* of them at once with the deeper struct fields decoded
 * (origin sender, required gas, fee token + amount, message bytes).
 * Cramming that into the index row is impossible; routing by
 * messageId lets the index stay scannable while still letting any
 * messageId open a deep view.
 *
 * Data: reuses `GET /v1/icm/messages?messageId=...` — the existing
 * filter already returns every event for that ID (it joins on
 * topic1, which is the messageId on every Teleporter event). We sort
 * ASC for timeline order and render one card per event.
 */

import { use, useMemo, useState } from "react";
import Link from "next/link";
import { Hash } from "@/components/lattice/hash";
import { Chip } from "@/components/lattice/chip";
import { Skeleton } from "@/components/ui/skeleton";
import { CopyButton } from "@/components/lattice/copy-button";
import { VerifiedContractChip } from "@/components/lattice/verified-chip";
import { ErrorBanner } from "@/components/page/error-banner";
import { useICMMessages, useChain, useToken } from "@/lib/api/queries";
import type {
  AppMessage,
  AppMessageFieldNode,
  ICMMessage,
  TeleporterFeeInfoDecoded,
  TeleporterMessageDecoded,
} from "@/lib/api/queries";
import { formatNumber, formatRelativeTime } from "@/lib/format";
import { avaxNetworkName, shortHex } from "@/lib/icm/decode";

interface PageProps {
  params: Promise<{ messageId: string }>;
}

export default function ICMMessageDetailPage({ params }: PageProps) {
  const { messageId: rawId } = use(params);
  const messageId = normalizeBytes32(rawId);
  const { data: chain } = useChain();
  const localChainId = chain?.blockchainId;

  const {
    data: page,
    isPending,
    error,
  } = useICMMessages({ messageId: messageId ?? undefined, limit: 100 }, { enabled: !!messageId });

  const events = useMemo(() => {
    if (!page?.data) return undefined;
    // Timeline order: oldest → newest. Stable secondary sort on
    // logIndex so multiple ICM events emitted in one transaction
    // (Send + AddFeeAmount, or Receive + Executed) render in chain
    // order, not API-return order.
    return [...page.data].sort((a, b) => {
      if (a.block.number !== b.block.number) return a.block.number - b.block.number;
      return a.logIndex - b.logIndex;
    });
  }, [page]);

  const lifecycle = useMemo(() => deriveLifecycle(events), [events]);
  const sides = useMemo(() => deriveSides(events, localChainId), [events, localChainId]);
  const ictt = useMemo(() => deriveICTT(events), [events]);

  if (!messageId) {
    return (
      <div className="px-4 sm:px-6 lg:px-10 py-8 sm:py-12">
        <NotFound title="Invalid message ID" detail="Expected a 32-byte (0x…) hex string." />
      </div>
    );
  }

  return (
    <div className="px-4 sm:px-6 lg:px-10 py-6 sm:py-8 pb-12">
      <div className="eyebrow mb-2.5">
        <Link href="/icm" style={{ color: "inherit", textDecoration: "none" }}>
          {ictt ? "ICTT · INTERCHAIN TOKEN TRANSFER" : "ICM · MESSAGE"}
        </Link>
      </div>

      <div className="flex items-baseline gap-3 mb-3 flex-wrap">
        {/* Headline: short messageId next to a status badge, mirroring
            the explorer convention where the page identity sits beside
            its lifecycle state. The big bytes32 lands below for copy/
            paste; this short form is what the eye reads first. */}
        <span className="h-display" style={{ fontSize: 22, lineHeight: 1.25, color: "var(--ink)" }}>
          {`icm_${shortHex(messageId, 4)}`}
        </span>
        {lifecycle ? <LifecycleChip status={lifecycle.status} /> : null}
        {events && events.length > 0 ? (
          <Chip tone={events[0].kind === "teleporter" ? "steel" : "default"}>
            {events[0].kind === "teleporter" ? "Teleporter" : "Warp"}
          </Chip>
        ) : null}
        <CopyButton text={messageId} />
      </div>

      {/* Full messageId, monospace, no truncation. Renders below the
          headline as the canonical identifier — users came here from a
          row that showed the short form and need the whole 66-char hex
          to cross-reference. wordBreak handles narrow viewports. */}
      <div
        className="mono mb-7"
        style={{
          fontSize: 12,
          color: "var(--ink-3)",
          wordBreak: "break-all",
          lineHeight: 1.5,
        }}
      >
        {messageId}
      </div>

      {/* ICTT-specific summary + transfer flow visualization. Renders
          only when the appMessage decoded as a recognized ICTT shape.
          Falls through to the generic SidesCard for non-ICTT messages
          (raw Teleporter, custom dapps, Warp-only flows). */}
      {ictt ? (
        <>
          <ICTTSummaryCard ictt={ictt} lifecycle={lifecycle} />
          <div style={{ height: 16 }} />
          <TransferFlow ictt={ictt} />
          <div style={{ height: 24 }} />
          <ICTTOverview ictt={ictt} messageId={messageId} />
        </>
      ) : sides ? (
        <SidesCard sides={sides} />
      ) : null}

      {error ? <ErrorBanner title="Couldn't load this message." message={error.message} /> : null}

      <div className="eyebrow mb-3" style={{ marginTop: 32 }}>
        Timeline · {events ? `${events.length} event${events.length === 1 ? "" : "s"}` : "—"}
      </div>

      {isPending ? (
        <div className="space-y-3">
          {Array.from({ length: 2 }).map((_, i) => (
            <Skeleton key={i} className="h-32 w-full" />
          ))}
        </div>
      ) : events && events.length > 0 ? (
        <ol
          style={{
            display: "flex",
            flexDirection: "column",
            gap: 14,
            listStyle: "none",
            padding: 0,
          }}
        >
          {events.map((e) => (
            <li key={`${e.transactionHash}-${e.logIndex}`}>
              <EventCard event={e} />
            </li>
          ))}
        </ol>
      ) : (
        <NotFound
          title="No events yet"
          detail="This message ID hasn't been seen on this L1. If it's an outbound message, the destination chain handles delivery; if it's inbound, no Send/Receive has been indexed here yet."
        />
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Lifecycle derivation
// ---------------------------------------------------------------------------

type LifecycleStatus =
  | "sent" // Send seen, no further state
  | "delivered" // Received but not Executed yet
  | "executed" // MessageExecuted seen
  | "failed" // MessageExecutionFailed seen
  | "settled"; // ReceiptReceived seen (round trip closed)

interface Lifecycle {
  status: LifecycleStatus;
}

function deriveLifecycle(events: ICMMessage[] | undefined): Lifecycle | null {
  if (!events || events.length === 0) return null;
  // Walk newest → oldest looking for the most-advanced lifecycle event.
  // Order matters: ReceiptReceived implies Executed; Failed should beat
  // Delivered if both somehow appear (shouldn't happen, defensive).
  let status: LifecycleStatus = "sent";
  for (const e of events) {
    switch (e.event) {
      case "ReceiptReceived":
        return { status: "settled" };
      case "MessageExecutionFailed":
        status = "failed";
        break;
      case "MessageExecuted":
        if (status !== "failed") status = "executed";
        break;
      case "ReceiveCrossChainMessage":
        if (status === "sent") status = "delivered";
        break;
    }
  }
  return { status };
}

function LifecycleChip({ status }: { status: LifecycleStatus }) {
  const tone = status === "failed" ? "bad" : status === "sent" ? "default" : "good";
  const label =
    status === "sent"
      ? "Sent"
      : status === "delivered"
        ? "Delivered"
        : status === "executed"
          ? "Executed"
          : status === "failed"
            ? "Execution failed"
            : "Settled";
  return <Chip tone={tone}>{label}</Chip>;
}

// ---------------------------------------------------------------------------
// Source / destination summary
// ---------------------------------------------------------------------------

interface ChainSide {
  id?: string;
  name?: string;
  cb58?: string;
  isLocal: boolean;
}

function deriveSides(
  events: ICMMessage[] | undefined,
  localChainId: string | undefined,
): { source: ChainSide; destination: ChainSide } | null {
  if (!events || events.length === 0) return null;
  // Coalesce across events — different events fill in different sides;
  // the resolver also stamps the implicit side on each one. Take the
  // first non-empty value seen for each side.
  let source: ChainSide = { isLocal: false };
  let destination: ChainSide = { isLocal: false };
  for (const e of events) {
    if (!source.id && e.sourceBlockchainId) source = { ...source, id: e.sourceBlockchainId };
    if (!source.name && e.sourceBlockchainName)
      source = { ...source, name: e.sourceBlockchainName };
    if (!source.cb58 && e.sourceBlockchainCb58)
      source = { ...source, cb58: e.sourceBlockchainCb58 };
    if (!destination.id && e.destinationBlockchainId)
      destination = { ...destination, id: e.destinationBlockchainId };
    if (!destination.name && e.destinationBlockchainName)
      destination = { ...destination, name: e.destinationBlockchainName };
    if (!destination.cb58 && e.destinationBlockchainCb58)
      destination = { ...destination, cb58: e.destinationBlockchainCb58 };
  }
  if (localChainId) {
    if (source.id && eqHex(source.id, localChainId)) source.isLocal = true;
    if (destination.id && eqHex(destination.id, localChainId)) destination.isLocal = true;
  }
  return { source, destination };
}

function SidesCard({ sides }: { sides: { source: ChainSide; destination: ChainSide } }) {
  return (
    <div
      className="card border border-line rounded-[10px] bg-bg-elev"
      style={{
        display: "grid",
        gridTemplateColumns: "1fr auto 1fr",
        alignItems: "center",
        gap: 24,
        padding: "20px 24px",
      }}
    >
      <SideBlock label="Source" side={sides.source} align="left" />
      <svg width="20" height="20" viewBox="0 0 10 10" aria-hidden>
        <path
          d="M2 5h6m0 0L6 3m2 2L6 7"
          stroke="var(--ink-3)"
          strokeWidth="1.3"
          fill="none"
          strokeLinecap="round"
        />
      </svg>
      <SideBlock label="Destination" side={sides.destination} align="right" />
    </div>
  );
}

function SideBlock({
  label,
  side,
  align,
}: {
  label: string;
  side: ChainSide;
  align: "left" | "right";
}) {
  // Falls back to the full bytes32 chain ID when no human name was
  // resolved (rare; only when the P-Chain resolver hasn't seen this
  // subnet yet). The user wants full identifiers visible — never
  // truncate, just rely on wordBreak below to wrap the long hex.
  const display = side.name ?? side.id ?? "—";
  const isHexFallback = !side.name && !!side.id;
  return (
    <div style={{ textAlign: align, minWidth: 0 }}>
      <div className="eyebrow" style={{ marginBottom: 6 }}>
        {label} {side.isLocal ? "· this chain" : ""}
      </div>
      <div
        className={isHexFallback ? "mono" : undefined}
        style={{
          fontSize: isHexFallback ? 12 : 18,
          fontWeight: side.isLocal ? 500 : 400,
          color: side.isLocal || side.name ? "var(--ink)" : "var(--ink-2)",
          wordBreak: "break-all",
        }}
      >
        {display}
      </div>
      {side.cb58 ? (
        <div
          className="mono"
          style={{ fontSize: 11, color: "var(--ink-4)", marginTop: 4, wordBreak: "break-all" }}
          title={side.id}
        >
          {side.cb58}
        </div>
      ) : null}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Per-event card
// ---------------------------------------------------------------------------

function EventCard({ event }: { event: ICMMessage }) {
  const [showRaw, setShowRaw] = useState(false);
  return (
    <div
      className="card border border-line rounded-[10px] bg-bg-elev"
      style={{ padding: "18px 22px" }}
    >
      <div
        style={{
          display: "flex",
          alignItems: "baseline",
          justifyContent: "space-between",
          gap: 16,
          flexWrap: "wrap",
          marginBottom: 14,
        }}
      >
        <div style={{ display: "flex", alignItems: "baseline", gap: 10, flexWrap: "wrap" }}>
          <span style={{ fontSize: 16, fontWeight: 500 }}>{event.event}</span>
          <Chip tone={event.kind === "teleporter" ? "steel" : "default"}>
            {event.kind === "teleporter" ? "Teleporter" : "Warp"}
          </Chip>
          <VerifiedContractChip address={event.contractAddress} />
        </div>
        <Link
          href={`/blocks/${event.block.number}`}
          className="mono"
          style={{ fontSize: 12, color: "var(--ink-3)", textDecoration: "none" }}
        >
          #{formatNumber(event.block.number)} · {formatRelativeTime(event.block.timestamp)}
        </Link>
      </div>

      <FieldRow label="Tx">
        <Hash
          value={event.transactionHash}
          length={0}
          tone="link"
          href={`/transactions/${event.transactionHash}`}
        />
      </FieldRow>
      <FieldRow label="Emitter">
        <Hash
          value={event.contractAddress}
          length={0}
          tone="plain"
          href={`/address/${event.contractAddress}`}
        />
      </FieldRow>

      <DecodedFields event={event} />

      {event.rawData ? (
        <div style={{ marginTop: 12 }}>
          <button
            type="button"
            onClick={() => setShowRaw((v) => !v)}
            className="mono"
            style={{
              background: "transparent",
              border: "1px solid var(--line)",
              color: "var(--ink-3)",
              fontSize: 11,
              padding: "4px 10px",
              borderRadius: 6,
              cursor: "pointer",
            }}
          >
            {showRaw ? "Hide" : "Show"} raw data
          </button>
          {showRaw ? (
            <pre
              className="mono"
              style={{
                marginTop: 8,
                padding: "10px 12px",
                background: "var(--bg-sunken)",
                border: "1px solid var(--line)",
                borderRadius: 6,
                fontSize: 11,
                color: "var(--ink-3)",
                whiteSpace: "pre-wrap",
                wordBreak: "break-all",
                maxHeight: 240,
                overflow: "auto",
              }}
            >
              {event.rawData}
            </pre>
          ) : null}
        </div>
      ) : null}
    </div>
  );
}

function DecodedFields({ event }: { event: ICMMessage }) {
  // All structured decoding happens in firn's icm package using the
  // ava-labs/icm-contracts Go bindings + avalanchego's warp codec.
  // The frontend just renders whichever fields the backend produced
  // for this event type.
  switch (event.event) {
    case "SendWarpMessage": {
      const warp = event.warpEnvelope;
      const networkLabel = warp ? avaxNetworkName(warp.networkId) : undefined;
      return (
        <>
          <FieldRow label="Warp sender">
            {event.sender ? (
              <Hash
                value={event.sender}
                length={0}
                tone="plain"
                href={`/address/${event.sender}`}
              />
            ) : (
              "—"
            )}
          </FieldRow>
          <FieldRow label="Unsigned message ID">
            <span className="mono" style={{ fontSize: 12, wordBreak: "break-all" }}>
              {event.messageId ?? "—"}
            </span>
          </FieldRow>

          {warp ? (
            <>
              <FieldRow label="Avalanche network">
                {networkLabel ? `${networkLabel} (${warp.networkId})` : warp.networkId}
              </FieldRow>
              <FieldRow label="Source chain ID">
                <span className="mono" style={{ fontSize: 12, wordBreak: "break-all" }}>
                  {warp.sourceChainId}
                </span>
              </FieldRow>

              {warp.addressedCall ? (
                <>
                  <FieldRow label="AddressedCall sender">
                    <Hash
                      value={warp.addressedCall.sourceAddress}
                      length={0}
                      tone="plain"
                      href={`/address/${warp.addressedCall.sourceAddress}`}
                    />{" "}
                    <VerifiedContractChip address={warp.addressedCall.sourceAddress} />
                  </FieldRow>

                  {event.teleporterMessage ? (
                    <>
                      <DividerRow label="Embedded TeleporterMessage" />
                      <TeleporterMessageFields message={event.teleporterMessage} />
                    </>
                  ) : (
                    <FieldRow label="AddressedCall payload">
                      <span style={{ color: "var(--ink-3)", display: "block", marginBottom: 6 }}>
                        Not a TeleporterMessage. Raw inner bytes:
                      </span>
                      <BytesPreview hex={warp.addressedCall.payloadHex} />
                    </FieldRow>
                  )}
                </>
              ) : (
                <FieldRow label="Payload">
                  <span style={{ color: "var(--ink-3)" }}>
                    Raw application Warp message — no AddressedCall envelope.
                  </span>
                </FieldRow>
              )}
            </>
          ) : null}

          {event.appMessage ? <AppMessageBlock app={event.appMessage} /> : null}

          {event.unsignedMessage ? (
            <FieldRow label="Full unsigned message bytes">
              <BytesPreview hex={event.unsignedMessage} />
            </FieldRow>
          ) : null}
        </>
      );
    }
    case "SendCrossChainMessage":
      return (
        <>
          {event.teleporterMessage ? (
            <TeleporterMessageFields message={event.teleporterMessage} />
          ) : null}
          {event.feeInfo ? <FeeFields fee={event.feeInfo} label="Fee" /> : null}
          {event.appMessage ? <AppMessageBlock app={event.appMessage} /> : null}
        </>
      );

    case "ReceiveCrossChainMessage":
      return (
        <>
          {event.deliverer ? (
            <FieldRow label="Deliverer (relayer)">
              <Hash
                value={event.deliverer}
                length={0}
                tone="plain"
                href={`/address/${event.deliverer}`}
              />
            </FieldRow>
          ) : null}
          {event.rewardAddress ? (
            <FieldRow label="Reward redeemer">
              <Hash
                value={event.rewardAddress}
                length={0}
                tone="plain"
                href={`/address/${event.rewardAddress}`}
              />
            </FieldRow>
          ) : null}
          {event.teleporterMessage ? (
            <TeleporterMessageFields message={event.teleporterMessage} />
          ) : null}
          {event.appMessage ? <AppMessageBlock app={event.appMessage} /> : null}
        </>
      );

    case "MessageExecuted":
      return null;

    case "MessageExecutionFailed":
      return (
        <>
          <div
            style={{
              padding: "8px 10px",
              borderRadius: 6,
              background: "var(--bg-sunken)",
              fontSize: 12,
              color: "var(--warn, var(--ink-2))",
              marginBottom: 12,
            }}
          >
            Execution reverted on-chain. The message is still indexed and can be retried by any
            relayer; replay typically lands as a follow-up MessageExecuted event for the same
            messageId.
          </div>
          {event.teleporterMessage ? (
            <TeleporterMessageFields message={event.teleporterMessage} />
          ) : null}
          {event.appMessage ? <AppMessageBlock app={event.appMessage} /> : null}
        </>
      );

    case "ReceiptReceived":
      return (
        <>
          {event.rewardAddress ? (
            <FieldRow label="Reward to">
              <Hash
                value={event.rewardAddress}
                length={0}
                tone="plain"
                href={`/address/${event.rewardAddress}`}
              />
            </FieldRow>
          ) : null}
          {event.feeInfo ? <FeeFields fee={event.feeInfo} label="Reward" /> : null}
        </>
      );

    case "AddFeeAmount":
      return event.feeInfo ? <FeeFields fee={event.feeInfo} label="Added fee" /> : null;

    case "RelayerRewardsRedeemed":
      return (
        <>
          {event.rewardAddress ? (
            <FieldRow label="Redeemer">
              <Hash
                value={event.rewardAddress}
                length={0}
                tone="plain"
                href={`/address/${event.rewardAddress}`}
              />
            </FieldRow>
          ) : null}
          {event.asset ? (
            <FieldRow label="Asset">
              <Hash value={event.asset} length={0} tone="plain" href={`/address/${event.asset}`} />
            </FieldRow>
          ) : null}
          {event.amount ? <FieldRow label="Amount">{event.amount}</FieldRow> : null}
        </>
      );

    case "BlockchainIDInitialized":
      return event.sourceBlockchainId ? (
        <FieldRow label="Blockchain ID">
          <span className="mono" style={{ fontSize: 12, wordBreak: "break-all" }}>
            {event.sourceBlockchainId}
          </span>
        </FieldRow>
      ) : null;

    default:
      return null;
  }
}

function TeleporterMessageFields({ message }: { message: TeleporterMessageDecoded }) {
  return (
    <>
      <FieldRow label="Nonce">{message.messageNonce}</FieldRow>
      <FieldRow label="Origin sender">
        <Hash
          value={message.originSenderAddress}
          length={0}
          tone="plain"
          href={`/address/${message.originSenderAddress}`}
        />
      </FieldRow>
      <FieldRow label="Destination address">
        <Hash
          value={message.destinationAddress}
          length={0}
          tone="plain"
          href={`/address/${message.destinationAddress}`}
        />
      </FieldRow>
      <FieldRow label="Required gas limit">{message.requiredGasLimit}</FieldRow>
      {(message.allowedRelayerAddresses ?? []).length > 0 ? (
        <FieldRow label="Allowed relayers">
          <div className="flex flex-wrap gap-2">
            {(message.allowedRelayerAddresses ?? []).map((a) => (
              <Hash key={a} value={a} length={0} tone="plain" href={`/address/${a}`} />
            ))}
          </div>
        </FieldRow>
      ) : (
        <FieldRow label="Allowed relayers">
          <span style={{ color: "var(--ink-4)" }}>any</span>
        </FieldRow>
      )}
      {(message.receipts ?? []).length > 0 ? (
        <FieldRow label={`Inline receipts (${(message.receipts ?? []).length})`}>
          <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
            {(message.receipts ?? []).map((r, i) => (
              <span
                key={i}
                className="mono"
                style={{ fontSize: 11.5, color: "var(--ink-3)", wordBreak: "break-all" }}
              >
                nonce {r.receivedMessageNonce} → {r.relayerRewardAddress}
              </span>
            ))}
          </div>
        </FieldRow>
      ) : null}
    </>
  );
}

/**
 * Renders the application-defined `bytes message` payload using the
 * backend's structured AppMessage decode:
 *
 *   1. When `protocol` + `kindLabel` + `fields` are set (recognised
 *      ICTT message), render fields by name.
 *   2. Otherwise show the (uint256 messageType, bytes payload)
 *      envelope when present, and the raw bytes always.
 *
 * Server-side decoding lives in firn/internal/decoders/icm/appmessage.go
 * via the official ictt-contracts schemas — single source of truth.
 */
function AppMessageBlock({ app }: { app: AppMessage }) {
  const len = byteLengthOfHex(app.bytesHex);
  return (
    <>
      <DividerRow label={`Application message · ${len} bytes`} />

      {app.protocol && app.kindLabel ? (
        <>
          <FieldRow label="Recognized as">
            <Chip tone="good">
              {app.protocol} {app.kindLabel}
            </Chip>
          </FieldRow>
          {(app.fields ?? []).map((f, i) => (
            <FieldRow key={`r-${i}`} label={f.name}>
              <DecodedFieldValue field={f} />
            </FieldRow>
          ))}
        </>
      ) : app.envelope ? (
        <>
          <FieldRow label="Message type">
            <span className="mono" style={{ fontSize: 12.5 }}>
              {app.envelope.messageType}
            </span>
          </FieldRow>
          <FieldRow label="Inner payload bytes">
            <span className="mono" style={{ fontSize: 11.5, color: "var(--ink-3)" }}>
              {byteLengthOfHex(app.envelope.payloadHex)} bytes
            </span>
          </FieldRow>
          <FieldRow label="Inner payload">
            <BytesPreview hex={app.envelope.payloadHex} />
          </FieldRow>
        </>
      ) : (
        <FieldRow label="Decoded as">
          <span style={{ fontSize: 12.5, color: "var(--ink-3)" }}>
            Raw bytes — no recognized envelope.
          </span>
        </FieldRow>
      )}

      <FieldRow label="Raw bytes">
        <BytesPreview hex={app.bytesHex} />
      </FieldRow>
    </>
  );
}

/**
 * Renders one AppMessage field. Type tag drives semantics: addresses
 * link out, uint/bytes32/bytes render as monospace with a tiny type
 * tag.
 */
function DecodedFieldValue({ field }: { field: AppMessageFieldNode }) {
  if (field.type === "address") {
    return <Hash value={field.value} length={0} tone="plain" href={`/address/${field.value}`} />;
  }
  return (
    <span className="mono" style={{ fontSize: 12.5, wordBreak: "break-all" }}>
      {field.value}
      <span style={{ color: "var(--ink-4)", marginLeft: 8, fontSize: 11 }}>{field.type}</span>
    </span>
  );
}

function FeeFields({ fee, label }: { fee: TeleporterFeeInfoDecoded; label: string }) {
  return (
    <>
      <FieldRow label={`${label} token`}>
        <Hash
          value={fee.feeTokenAddress}
          length={0}
          tone="plain"
          href={`/address/${fee.feeTokenAddress}`}
        />
      </FieldRow>
      <FieldRow label={`${label} amount`}>
        <span className="mono" style={{ fontSize: 12.5 }}>
          {fee.amount}
        </span>
      </FieldRow>
    </>
  );
}

// ---------------------------------------------------------------------------
// UI primitives
// ---------------------------------------------------------------------------

/**
 * Section break inside an event card. Used to separate the Warp envelope
 * fields from the embedded TeleporterMessage fields so the two
 * abstraction layers read clearly.
 */
function DividerRow({ label }: { label: string }) {
  return (
    <div
      style={{
        marginTop: 14,
        marginBottom: 4,
        paddingTop: 10,
        borderTop: "1px solid var(--line)",
        display: "flex",
        alignItems: "center",
        gap: 10,
      }}
    >
      <span className="eyebrow" style={{ color: "var(--ink-3)" }}>
        {label}
      </span>
    </div>
  );
}

function FieldRow({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div
      style={{
        display: "grid",
        gridTemplateColumns: "180px 1fr",
        gap: 14,
        padding: "7px 0",
        borderTop: "1px solid var(--line-soft)",
        alignItems: "center",
        minHeight: 30,
      }}
    >
      <span className="eyebrow">{label}</span>
      {/* wordBreak: break-all so a full 42-char address or 66-char
          bytes32 wraps gracefully instead of overflowing the card. The
          user explicitly asked for full addresses with no truncation,
          so the layout has to handle long values inline. */}
      <div
        style={{
          fontSize: 12.5,
          color: "var(--ink-2)",
          wordBreak: "break-all",
          minWidth: 0,
        }}
      >
        {children}
      </div>
    </div>
  );
}

function BytesPreview({ hex }: { hex: string }) {
  const [expanded, setExpanded] = useState(false);
  if (!hex || hex === "0x") {
    return <span style={{ color: "var(--ink-4)" }}>empty</span>;
  }
  const display = expanded ? hex : shortHex(hex, 32);
  return (
    <span
      onClick={() => setExpanded((v) => !v)}
      className="mono"
      role="button"
      tabIndex={0}
      onKeyDown={(e) => {
        if (e.key === "Enter" || e.key === " ") setExpanded((v) => !v);
      }}
      style={{
        fontSize: 11.5,
        color: "var(--ink-3)",
        cursor: "pointer",
        wordBreak: "break-all",
        userSelect: "text",
      }}
      title={expanded ? "Click to collapse" : "Click to expand full bytes"}
    >
      {display}
    </span>
  );
}

function NotFound({ title, detail }: { title: string; detail: string }) {
  return (
    <div
      className="card border border-line rounded-[10px] bg-bg-elev"
      style={{ padding: "32px 24px", textAlign: "center" }}
    >
      <div className="h-display" style={{ fontSize: 22 }}>
        {title}
      </div>
      <div
        style={{
          fontSize: 13,
          color: "var(--ink-3)",
          marginTop: 6,
          maxWidth: 520,
          marginInline: "auto",
        }}
      >
        {detail}
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function normalizeBytes32(raw: string): string | null {
  if (!raw) return null;
  const lower = raw.toLowerCase().trim();
  const hex = lower.startsWith("0x") ? lower.slice(2) : lower;
  if (!/^[0-9a-f]{64}$/.test(hex)) return null;
  return `0x${hex}`;
}

function eqHex(a: string, b: string): boolean {
  return a.toLowerCase() === b.toLowerCase();
}

function byteLengthOfHex(hex: string): number {
  if (!hex) return 0;
  const h = hex.startsWith("0x") ? hex.slice(2) : hex;
  return h.length / 2;
}

// ---------------------------------------------------------------------------
// ICTT-specific summary view
// ---------------------------------------------------------------------------

/**
 * ICTTContext is everything the summary card + transfer flow + overview
 * need, derived from the events list. Pulled out as a single shape so
 * the rendering components don't repeat the lookup gymnastics.
 *
 * Fields are intentionally optional: this is a destination-side view of
 * a cross-chain message, so any field that lives only on the SOURCE
 * chain ("source tx hash", "source-side fee paid in source gas token")
 * stays undefined and renders as N/A. The user already accepted that
 * tradeoff — federation/cross-chain join is a separate piece of work.
 */
interface ICTTContext {
  kindLabel: string; // SINGLE_HOP_SEND etc.
  // The ICTT TokenRemote / TokenHome contract on the local chain. For
  // a destination-side ReceiveCrossChainMessage this is the
  // teleporterMessage.destinationAddress (the remote that mints/
  // releases tokens for this transfer). For a source-side
  // SendCrossChainMessage it's the originSenderAddress. Either way,
  // it's the on-chain ICTT token contract — useToken() resolves
  // symbol + decimals.
  tokenAddress?: string;
  // Local-chain participants. originSender = who initiated the send on
  // the source chain (renders as "Sender" in the overview; survives
  // across the bridge as TeleporterMessage.originSenderAddress).
  // recipient = the on-destination wallet that gets the funds (decoded
  // out of the appMessage SINGLE_HOP_SEND payload).
  sender?: string;
  recipient?: string;
  // Decimal-string uint256 amount, without decimals applied. The token
  // hook resolves decimals separately so we can format inline.
  amountRaw?: string;
  // Chain identity for both sides. Names are best-effort from the
  // P-Chain blockchain resolver; the cb58/0x ID is the canonical fallback.
  sourceChainName?: string;
  sourceChainId?: string;
  destChainName?: string;
  destChainId?: string;
  // Tx + relayer + reward (destination side only).
  destTxHash?: string;
  destBlockTimestamp?: string;
  deliverer?: string;
  rewardAddress?: string;
  // The MessageExecuted event, when present, marks final settlement
  // on the destination chain. Used to render an end-to-end timing
  // hint — but only relative to the Receive block (not the Send) since
  // we don't have the source side.
  receiveAt?: string;
  executedAt?: string;
}

function deriveICTT(events: ICMMessage[] | undefined): ICTTContext | null {
  if (!events || events.length === 0) return null;
  // Find the event whose appMessage decoded as ICTT. Receive carries the
  // full payload; MessageExecuted has only the messageId so the appMsg
  // is empty there. We accept ANY event with a recognized ICTT decode
  // — first match wins.
  let app: AppMessage | undefined;
  let receive: ICMMessage | undefined;
  let executed: ICMMessage | undefined;
  for (const e of events) {
    if (!app && e.appMessage?.protocol === "ICTT" && e.appMessage.kindLabel) {
      app = e.appMessage;
    }
    if (!receive && e.event === "ReceiveCrossChainMessage") receive = e;
    if (!executed && e.event === "MessageExecuted") executed = e;
  }
  if (!app || !app.kindLabel) return null;
  const fields = app.fields ?? [];
  const fieldMap = new Map(fields.map((f) => [f.name, f.value] as const));
  // The destination-side ICTT contract is the TokenRemote that received
  // the message. teleporterMessage.destinationAddress on the Receive
  // event names it directly. Fallback to the contract that emitted the
  // most recent event on this chain (the canonical Teleporter address,
  // which is NOT what we want here — so we prefer destinationAddress).
  const tokenAddress = receive?.teleporterMessage?.destinationAddress ?? events[0].contractAddress;
  return {
    kindLabel: app.kindLabel,
    tokenAddress,
    sender: receive?.teleporterMessage?.originSenderAddress,
    recipient: fieldMap.get("recipient"),
    amountRaw: fieldMap.get("amount"),
    sourceChainName: receive?.sourceBlockchainName,
    sourceChainId: receive?.sourceBlockchainId,
    destChainName: receive?.destinationBlockchainName,
    destChainId: receive?.destinationBlockchainId,
    destTxHash: receive?.transactionHash,
    destBlockTimestamp: receive?.block.timestamp,
    deliverer: receive?.deliverer,
    rewardAddress: receive?.rewardAddress,
    receiveAt: receive?.block.timestamp,
    executedAt: executed?.block.timestamp,
  };
}

/**
 * Top-of-page summary card for an ICTT transfer. Renders the natural-
 * language one-liner ("Account 0x… transferred 12,400 USDC from C-Chain
 * to Beam L1 via Teleporter ICTT") plus a thin metadata row beneath.
 *
 * Token symbol + decimals come from `useToken(tokenAddress)`. While that
 * resolves, the amount renders as the raw uint256 — the page stays
 * useful even if the token isn't in firn's catalog yet.
 */
function ICTTSummaryCard({ ictt, lifecycle }: { ictt: ICTTContext; lifecycle: Lifecycle | null }) {
  const { data: token } = useToken(ictt.tokenAddress);
  const formatted = formatTokenAmount(ictt.amountRaw, token?.decimals);
  const symbol = token?.symbol ?? "tokens";
  const sourceName = ictt.sourceChainName ?? shortChainId(ictt.sourceChainId);
  const destName = ictt.destChainName ?? shortChainId(ictt.destChainId);
  return (
    <div
      className="card border border-line rounded-[10px] bg-bg-elev"
      style={{ padding: "20px 24px" }}
    >
      <div className="eyebrow" style={{ marginBottom: 10 }}>
        Summary
      </div>
      <div
        style={{
          fontSize: 17,
          lineHeight: 1.55,
          color: "var(--ink-2)",
          fontWeight: 400,
        }}
      >
        Account{" "}
        {ictt.sender ? (
          <Link
            href={`/address/${ictt.sender}`}
            className="mono"
            style={{ color: "var(--ink)", textDecoration: "none", fontSize: 15 }}
          >
            {shortHex(ictt.sender, 4)}
          </Link>
        ) : (
          <span style={{ color: "var(--ink-3)" }}>—</span>
        )}{" "}
        transferred{" "}
        <span style={{ color: "var(--accent)", fontWeight: 500 }}>
          {formatted} {symbol}
        </span>{" "}
        from <span style={{ color: "var(--ink)" }}>{sourceName ?? "—"}</span> to{" "}
        <span style={{ color: "var(--ink)" }}>{destName ?? "—"}</span> via Teleporter ICTT.
      </div>
      <div
        className="mono"
        style={{
          marginTop: 14,
          display: "flex",
          flexWrap: "wrap",
          gap: 16,
          rowGap: 6,
          fontSize: 11.5,
          color: "var(--ink-4)",
        }}
      >
        {ictt.destBlockTimestamp ? (
          <span>Delivered {formatRelativeTime(ictt.destBlockTimestamp)}</span>
        ) : null}
        {lifecycle ? <span>Status: {lifecycle.status}</span> : null}
        <span>· Source-side fees N/A (only destination indexed)</span>
      </div>
    </div>
  );
}

/**
 * Three-column transfer flow visualization mirroring the user's mockup:
 *
 *   [Source chain]  ─ LOCK ─→  [Teleporter / Relayer]  ─ DELIVER ─→  [Destination chain]
 *
 * On a destination-only firn deployment the LOCK arrow shows N/A
 * (we don't have the source-chain emit time); the DELIVER arrow shows
 * the gap between Receive and Executed when both events were captured
 * in the same destination tx (always near-zero here).
 */
function TransferFlow({ ictt }: { ictt: ICTTContext }) {
  const sourceName = ictt.sourceChainName ?? shortChainId(ictt.sourceChainId);
  const destName = ictt.destChainName ?? shortChainId(ictt.destChainId);
  return (
    <div
      className="card border border-line rounded-[10px] bg-bg-elev"
      style={{ padding: "20px 24px" }}
    >
      <div className="eyebrow" style={{ marginBottom: 14 }}>
        Transfer Flow
      </div>
      <div
        style={{
          display: "grid",
          gridTemplateColumns: "1fr auto 1fr auto 1fr",
          alignItems: "center",
          gap: 12,
        }}
      >
        <FlowNode
          letter="S"
          chainName={sourceName ?? "—"}
          subtext="SOURCE"
          contract={undefined /* source-side TokenHome lives on other chain */}
          contractLabel="TokenHome on source"
        />
        <FlowArrow label="LOCK" sub="source-side" />
        <FlowNode
          letter="T"
          chainName="Teleporter"
          subtext="RELAYER"
          contract={ictt.deliverer}
          contractLabel="Relayer"
        />
        <FlowArrow label="DELIVER" sub={deriveDeliverTime(ictt)} />
        <FlowNode
          letter="D"
          chainName={destName ?? "—"}
          subtext="DESTINATION"
          contract={ictt.tokenAddress}
          contractLabel="TokenRemote"
        />
      </div>
      <div
        style={{
          display: "grid",
          gridTemplateColumns: "1fr 1fr 1fr",
          gap: 12,
          marginTop: 18,
          paddingTop: 14,
          borderTop: "1px solid var(--line-soft)",
          fontSize: 12,
          color: "var(--ink-3)",
        }}
      >
        <span>
          Sender ·{" "}
          {ictt.sender ? (
            <Link
              href={`/address/${ictt.sender}`}
              className="mono"
              style={{ color: "var(--ink-2)", textDecoration: "none" }}
            >
              {shortHex(ictt.sender, 4)}
            </Link>
          ) : (
            "—"
          )}
        </span>
        <span style={{ textAlign: "center" }}>
          Total elapsed · {deriveDeliverTime(ictt) ?? "N/A"}
        </span>
        <span style={{ textAlign: "right" }}>
          Recipient ·{" "}
          {ictt.recipient ? (
            <Link
              href={`/address/${ictt.recipient}`}
              className="mono"
              style={{ color: "var(--ink-2)", textDecoration: "none" }}
            >
              {shortHex(ictt.recipient, 4)}
            </Link>
          ) : (
            "—"
          )}
        </span>
      </div>
    </div>
  );
}

function FlowNode({
  letter,
  chainName,
  subtext,
  contract,
  contractLabel,
}: {
  letter: string;
  chainName: string;
  subtext: string;
  contract?: string;
  contractLabel: string;
}) {
  return (
    <div
      style={{
        display: "flex",
        flexDirection: "column",
        gap: 6,
        padding: "12px 14px",
        borderRadius: 8,
        border: "1px solid var(--line)",
        background: "var(--bg-sunken, var(--bg))",
        minWidth: 0,
      }}
    >
      <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
        <span
          aria-hidden
          style={{
            display: "inline-grid",
            placeItems: "center",
            width: 26,
            height: 26,
            borderRadius: 6,
            background: "color-mix(in oklch, var(--accent) 22%, transparent)",
            color: "var(--accent)",
            fontWeight: 600,
            fontSize: 13,
          }}
        >
          {letter}
        </span>
        <div style={{ minWidth: 0 }}>
          <div style={{ fontSize: 14, fontWeight: 500, color: "var(--ink)" }}>{chainName}</div>
          <div className="eyebrow" style={{ fontSize: 10 }}>
            {subtext}
          </div>
        </div>
      </div>
      <div
        className="mono"
        style={{
          marginTop: 4,
          fontSize: 11,
          color: contract ? "var(--accent)" : "var(--ink-4)",
          wordBreak: "break-all",
        }}
        title={contract ?? `${contractLabel} not on this chain`}
      >
        {contract ? `${contractLabel} · ${shortHex(contract, 4)}` : `${contractLabel} N/A`}
      </div>
    </div>
  );
}

function FlowArrow({ label, sub }: { label: string; sub?: string }) {
  return (
    <div
      style={{
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
        gap: 4,
        minWidth: 80,
      }}
    >
      <div className="eyebrow" style={{ fontSize: 10, color: "var(--ink-4)" }}>
        {label}
      </div>
      <div style={{ width: "100%", display: "flex", alignItems: "center", gap: 4 }}>
        <span style={{ flex: 1, height: 1, borderTop: "1px dashed var(--ink-4)" }} />
        <svg width="10" height="10" viewBox="0 0 10 10" aria-hidden>
          <path
            d="M2 5h6m0 0L6 3m2 2L6 7"
            stroke="var(--ink-4)"
            strokeWidth="1.4"
            fill="none"
            strokeLinecap="round"
          />
        </svg>
      </div>
      <div className="mono" style={{ fontSize: 10.5, color: "var(--good, var(--ink-3))" }}>
        {sub ?? ""}
      </div>
    </div>
  );
}

/**
 * Field-list panel matching the "Overview" tab in the mockup. Renders
 * one row per fact about this transfer, with N/A for source-only data.
 * The data is the same as what lives in the timeline event cards
 * below, just flattened + paired so the user doesn't have to scan
 * multiple cards to answer "what amount? what token? who sent?".
 */
function ICTTOverview({ ictt, messageId }: { ictt: ICTTContext; messageId: string }) {
  const { data: token } = useToken(ictt.tokenAddress);
  const amountFormatted = formatTokenAmount(ictt.amountRaw, token?.decimals);
  const tokenSymbol = token?.symbol;
  const tokenName = token?.name;
  const tokenDecimals = token?.decimals;
  return (
    <div className="card border border-line rounded-[10px] bg-bg-elev" style={{ padding: 0 }}>
      <div
        style={{
          padding: "14px 22px",
          borderBottom: "1px solid var(--line)",
          display: "flex",
          alignItems: "baseline",
          gap: 16,
          fontSize: 13,
          fontWeight: 500,
        }}
      >
        Overview
        <span className="eyebrow" style={{ color: "var(--ink-4)" }}>
          destination-side data
        </span>
      </div>
      <div style={{ padding: "8px 22px 14px" }}>
        <OverviewRow label="Message ID" mono value={messageId} />
        <OverviewRow
          label="Source Chain"
          value={ictt.sourceChainName ?? shortChainId(ictt.sourceChainId) ?? "—"}
          monoSub={ictt.sourceChainId ? shortHex(ictt.sourceChainId, 4) : undefined}
        />
        <OverviewRow
          label="Destination Chain"
          value={ictt.destChainName ?? shortChainId(ictt.destChainId) ?? "—"}
          monoSub={ictt.destChainId ? shortHex(ictt.destChainId, 4) : undefined}
          accent
        />
        <OverviewRow
          label="Token"
          value={
            tokenSymbol
              ? `${tokenName ? tokenName + " · " : ""}${tokenSymbol}`
              : ictt.tokenAddress
                ? "Unrecognized contract"
                : "—"
          }
          monoSub={
            tokenDecimals != null
              ? `${tokenDecimals} decimals`
              : ictt.tokenAddress
                ? shortHex(ictt.tokenAddress, 4)
                : undefined
          }
        />
        <OverviewRow
          label="Amount"
          value={
            <>
              {amountFormatted}
              {tokenSymbol ? <span style={{ color: "var(--ink-3)" }}> {tokenSymbol}</span> : null}
            </>
          }
        />
        <OverviewRow
          label="Sender (origin)"
          value={
            ictt.sender ? (
              <Link
                href={`/address/${ictt.sender}`}
                className="mono"
                style={{ color: "var(--ink-2)", textDecoration: "none" }}
              >
                {ictt.sender}
              </Link>
            ) : (
              "—"
            )
          }
        />
        <OverviewRow
          label="Recipient"
          value={
            ictt.recipient ? (
              <Link
                href={`/address/${ictt.recipient}`}
                className="mono"
                style={{ color: "var(--ink-2)", textDecoration: "none" }}
              >
                {ictt.recipient}
              </Link>
            ) : (
              "—"
            )
          }
        />
        <OverviewRow label="Source TX" value="N/A — source chain not indexed" muted />
        <OverviewRow
          label="Destination TX"
          value={
            ictt.destTxHash ? (
              <Link
                href={`/transactions/${ictt.destTxHash}`}
                className="mono"
                style={{ color: "var(--ink-2)", textDecoration: "none" }}
              >
                {ictt.destTxHash}
              </Link>
            ) : (
              "—"
            )
          }
        />
        <OverviewRow
          label="Relayer"
          value={
            ictt.deliverer ? (
              <Link
                href={`/address/${ictt.deliverer}`}
                className="mono"
                style={{ color: "var(--ink-2)", textDecoration: "none" }}
              >
                {ictt.deliverer}
              </Link>
            ) : (
              "—"
            )
          }
        />
        <OverviewRow
          label="Reward redeemer"
          value={
            ictt.rewardAddress ? (
              <Link
                href={`/address/${ictt.rewardAddress}`}
                className="mono"
                style={{ color: "var(--ink-2)", textDecoration: "none" }}
              >
                {ictt.rewardAddress}
              </Link>
            ) : (
              "—"
            )
          }
        />
        <OverviewRow
          label="End-to-End"
          value={deriveDeliverTime(ictt) ?? "N/A — needs source-chain timing"}
          muted={!deriveDeliverTime(ictt)}
        />
      </div>
    </div>
  );
}

function OverviewRow({
  label,
  value,
  mono,
  monoSub,
  muted,
  accent,
}: {
  label: string;
  value: React.ReactNode;
  mono?: boolean;
  monoSub?: string;
  muted?: boolean;
  accent?: boolean;
}) {
  return (
    <div
      style={{
        display: "grid",
        gridTemplateColumns: "180px 1fr",
        gap: 14,
        padding: "10px 0",
        borderTop: "1px solid var(--line-soft)",
        alignItems: "baseline",
        minHeight: 32,
      }}
    >
      <span className="eyebrow">{label}</span>
      <div
        className={mono ? "mono" : undefined}
        style={{
          fontSize: 13,
          color: muted ? "var(--ink-4)" : accent ? "var(--ink)" : "var(--ink-2)",
          wordBreak: "break-all",
          minWidth: 0,
          display: "flex",
          flexDirection: "column",
          gap: 2,
        }}
      >
        <span>{value}</span>
        {monoSub ? (
          <span className="mono" style={{ fontSize: 11, color: "var(--ink-4)" }}>
            {monoSub}
          </span>
        ) : null}
      </div>
    </div>
  );
}

/**
 * Format a uint256 decimal-string against a known token decimals
 * count, with thousands separators on the integer part. Falls back to
 * the raw string with a "(raw)" tag when decimals are unknown — better
 * than silently rendering 12400000000 as a human number.
 */
function formatTokenAmount(rawDecimal: string | undefined, decimals: number | undefined): string {
  if (!rawDecimal) return "—";
  if (decimals == null) return `${rawDecimal} (raw)`;
  // BigInt to avoid float precision loss on uint256 inputs.
  let n: bigint;
  try {
    n = BigInt(rawDecimal);
  } catch {
    return rawDecimal;
  }
  if (decimals === 0) return n.toString();
  const base = BigInt(10) ** BigInt(decimals);
  const whole = n / base;
  const frac = n % base;
  const wholeStr = formatIntegerWithCommas(whole.toString());
  if (frac === BigInt(0)) return wholeStr;
  // Pad fractional, strip trailing zeros, cap to 6 sig digits to keep
  // the headline readable. The Overview row shows the full raw value
  // separately if precision matters.
  const fracStr = frac.toString().padStart(decimals, "0").replace(/0+$/, "").slice(0, 6);
  return fracStr ? `${wholeStr}.${fracStr}` : wholeStr;
}

function formatIntegerWithCommas(s: string): string {
  return s.replace(/\B(?=(\d{3})+(?!\d))/g, ",");
}

/**
 * Best-effort timing string for the destination-side delivery: the gap
 * between the Receive event and the MessageExecuted event when both
 * fired in the same window. Returns undefined when we can't compute
 * (one event missing, parse fail). Shown as "N/A" by callers when
 * undefined — never invent a number.
 */
function deriveDeliverTime(ictt: ICTTContext): string | undefined {
  if (!ictt.receiveAt || !ictt.executedAt) return undefined;
  const r = Date.parse(ictt.receiveAt);
  const e = Date.parse(ictt.executedAt);
  if (!Number.isFinite(r) || !Number.isFinite(e) || e < r) return undefined;
  const ms = e - r;
  if (ms < 1500) return `${ms}ms`;
  return `${(ms / 1000).toFixed(1)}s`;
}

function shortChainId(id: string | undefined): string | undefined {
  if (!id) return undefined;
  return shortHex(id, 4);
}
