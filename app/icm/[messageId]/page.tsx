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
import { useICMMessages, useChain } from "@/lib/api/queries";
import type {
  AppMessage,
  AppMessageFieldNode,
  ICMMessage,
  TeleporterFeeInfoDecoded,
  TeleporterMessageDecoded,
} from "@/lib/api/types";
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

  if (!messageId) {
    return (
      <div className="px-10 py-12">
        <NotFound title="Invalid message ID" detail="Expected a 32-byte (0x…) hex string." />
      </div>
    );
  }

  return (
    <div className="px-10 py-8 pb-12">
      <div className="eyebrow mb-2.5">
        <Link href="/icm" style={{ color: "inherit", textDecoration: "none" }}>
          ◆ ICM
        </Link>{" "}
        · Message
      </div>

      <div className="flex items-baseline gap-3 mb-3 flex-wrap">
        {lifecycle ? <LifecycleChip status={lifecycle.status} /> : null}
        {events && events.length > 0 ? (
          <Chip tone={events[0].kind === "teleporter" ? "steel" : "default"}>
            {events[0].kind === "teleporter" ? "Teleporter" : "Warp"}
          </Chip>
        ) : null}
        <CopyButton text={messageId} />
      </div>

      {/* Full messageId, no truncation. Renders large because it IS the
          page's primary identifier — the user came here from a row that
          showed only the first 10 hex chars and now wants the whole
          thing for cross-referencing on Etherscan, source debugging,
          etc. wordBreak lets the 66-char hex wrap onto two lines on
          narrower viewports rather than overflowing. */}
      <div
        className="h-display mb-7"
        style={{ fontSize: 22, lineHeight: 1.25, wordBreak: "break-all" }}
      >
        {messageId}
      </div>

      {/* Source ↔ destination at a glance — same shape as the index page
          row but rendered larger so it's the first thing the eye lands
          on after the headline. */}
      {sides ? <SidesCard sides={sides} /> : null}

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
      {message.allowedRelayerAddresses.length > 0 ? (
        <FieldRow label="Allowed relayers">
          <div className="flex flex-wrap gap-2">
            {message.allowedRelayerAddresses.map((a) => (
              <Hash key={a} value={a} length={0} tone="plain" href={`/address/${a}`} />
            ))}
          </div>
        </FieldRow>
      ) : (
        <FieldRow label="Allowed relayers">
          <span style={{ color: "var(--ink-4)" }}>any</span>
        </FieldRow>
      )}
      {message.receipts.length > 0 ? (
        <FieldRow label={`Inline receipts (${message.receipts.length})`}>
          <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
            {message.receipts.map((r, i) => (
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
