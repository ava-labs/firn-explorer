// firn v1 API types — Avalanche Interchain Messaging (ICM).
//
// firn's `/v1/icm/messages` decodes the unified Warp + Teleporter event
// stream into one flat shape. Most fields are optional because event
// types differ — a unified UI keys off `kind` + `event`. Mirrors
// firn/internal/icm/decoder.go::Message.

import type { BlockRef } from "./common";

export type ICMKind = "warp" | "teleporter";

export interface ICMMessage {
  kind: ICMKind;
  event: string;
  block: BlockRef;
  transactionHash: string;
  logIndex: number;
  contractAddress: string;
  /** Universal join key — bytes32 hex. Present on all Teleporter events
   *  and on Warp's unsignedMessageID. */
  messageId?: string;
  sourceBlockchainId?: string;
  destinationBlockchainId?: string;
  /** Resolved against P-Chain getBlockchains + primary-network seeds —
   *  the OPPOSITE side of the active chain is filled in implicitly
   *  (e.g. on a MessageExecuted event we're indexing the destination,
   *  so destinationBlockchainName = active chain name). Empty when the
   *  resolver doesn't know the chain (rare; subnet just created). */
  sourceBlockchainName?: string;
  sourceBlockchainCb58?: string;
  destinationBlockchainName?: string;
  destinationBlockchainCb58?: string;
  /** SendWarpMessage only. */
  sender?: string;
  /** ReceiveCrossChainMessage only. */
  deliverer?: string;
  rewardAddress?: string;
  /** RelayerRewardsRedeemed only. */
  asset?: string;
  amount?: string;
  /** Canonical Warp message bytes (hex). */
  unsignedMessage?: string;
  /** Decoded Warp envelope — present on SendWarpMessage events when the
   *  unsignedMessage parses cleanly through avalanchego's Warp codec.
   *  See firn/internal/decoders/icm/decoder.go::WarpEnvelope. */
  warpEnvelope?: WarpEnvelope;
  /** Raw ABI-encoded `data` from the log; consumers can decode the deeper
   *  TeleporterMessage / TeleporterFeeInfo structs when needed. */
  rawData?: string;
  /** Decoded TeleporterMessage struct (Send/Receive/Failed events). */
  teleporterMessage?: TeleporterMessageDecoded;
  /** Decoded TeleporterFeeInfo (Send / AddFeeAmount / ReceiptReceived). */
  feeInfo?: TeleporterFeeInfoDecoded;
  /** Layered decode of the application payload riding inside
   *  TeleporterMessage.message. Always populated when teleporterMessage
   *  is set. See firn/internal/decoders/icm/appmessage.go. */
  appMessage?: AppMessage;
}

/** Mirrors firn's TeleporterMessageDecoded — wire-friendly types
 *  (decimal-string bigints, lowercase 0x-hex addresses). */
export interface TeleporterMessageDecoded {
  messageNonce: string;
  originSenderAddress: string;
  destinationBlockchainId: string;
  destinationAddress: string;
  requiredGasLimit: string;
  allowedRelayerAddresses: string[];
  receipts: TeleporterMessageReceiptDecoded[];
  messageHex: string;
}

export interface TeleporterMessageReceiptDecoded {
  receivedMessageNonce: string;
  relayerRewardAddress: string;
}

export interface TeleporterFeeInfoDecoded {
  feeTokenAddress: string;
  amount: string;
}

/** Decoded application payload from inside TeleporterMessage.message.
 *  See firn/internal/decoders/icm/appmessage.go. */
export interface AppMessage {
  bytesHex: string;
  envelope?: AppMessageEnvelope;
  /** Recognized protocol — currently "ICTT" or empty. */
  protocol?: string;
  /** Recognized message kind under that protocol — e.g. "SINGLE_HOP_SEND". */
  kindLabel?: string;
  fields?: AppMessageFieldNode[];
}

export interface AppMessageEnvelope {
  /** decimal-stringified uint256 */
  messageType: string;
  payloadHex: string;
}

export interface AppMessageFieldNode {
  name: string;
  /** "address" | "uint256" | "uint8" | "bytes32" | "bytes" | "address[]" */
  type: string;
  value: string;
  items?: AppMessageFieldNode[];
}

/** Decoded outer Warp envelope. networkID + sourceChainID come from
 *  avalanchego's `warp.UnsignedMessage`; addressedCall comes from
 *  `payload.AddressedCall` when typeID=1. */
export interface WarpEnvelope {
  networkId: number;
  sourceChainId: string;
  addressedCall?: WarpAddressedCall;
}

export interface WarpAddressedCall {
  sourceAddress: string;
  /** The protocol-specific payload (e.g. ABI-encoded TeleporterMessage).
   *  Frontend decoders consume this for deeper rendering. */
  payloadHex: string;
}
