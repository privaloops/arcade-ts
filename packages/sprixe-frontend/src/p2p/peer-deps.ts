/**
 * peer-deps — the single import surface of PeerJS for this package.
 *
 * Centralising the re-export keeps Phase 3 wiring easy to audit (grep
 * for peerjs returns a single file) and gives us one place to swap in
 * a bundled-local signaling server if PeerJS Cloud becomes unreliable
 * in V2 (§6 — PeerJS Cloud rate limits risk).
 *
 * Tests hook in a mock by assigning `window.__PeerMock` to a drop-in
 * replacement class before any module imports Peer from here. The
 * export reads the window hook at module evaluation time, which is
 * exactly the point at which Playwright's addInitScript has already
 * run.
 */

import { Peer as OriginalPeer } from "peerjs";
export type { DataConnection } from "peerjs";

type PeerCtor = typeof OriginalPeer;

declare global {
  interface Window {
    __PeerMock?: PeerCtor;
  }
}

export const Peer: PeerCtor =
  typeof window !== "undefined" && window.__PeerMock !== undefined
    ? window.__PeerMock
    : OriginalPeer;
