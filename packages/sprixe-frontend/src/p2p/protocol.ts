/**
 * WebRTC data-channel message schema (§2.9).
 *
 * Binary ROM chunks travel as ArrayBuffer inside the 'chunk' message
 * body. Everything else is JSON-encoded via PeerJS's default serializer.
 */

export type PhoneToKioskMessage =
  | { type: "file-start"; name: string; size: number }
  | { type: "chunk"; idx: number; data: ArrayBuffer }
  | { type: "file-end"; name: string }
  | { type: "cmd"; action: string; payload?: unknown };

export type KioskToPhoneMessage =
  | { type: "progress"; name: string; percent: number }
  | { type: "complete"; name: string; game: string; system: "cps1" | "neogeo" }
  | { type: "error"; name: string; error: string }
  | { type: "state"; payload: Record<string, unknown> }
  | { type: "save-slots"; slots: { slot: number; ts: number }[] }
  | { type: "volume"; level: number };

export type P2PMessage = PhoneToKioskMessage | KioskToPhoneMessage;
