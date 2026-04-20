/**
 * PeerSend — WebRTC sender running on the phone that uploads a ROM
 * to the kiosk (§2.9 + §3.8).
 *
 * Transfer flow:
 *   1. open DataConnection to the kiosk's roomId (PeerJS dial)
 *   2. send { type: 'file-start', name, size }
 *   3. chunk the ArrayBuffer into CHUNK_SIZE-byte slices and stream
 *      them with backpressure handling:
 *        - pause when conn.bufferedAmount > BACKPRESSURE_HIGH (1 MB)
 *        - resume when it drops to ≤ BACKPRESSURE_LOW (256 KB) via
 *          the 'bufferedamountlow' event (WebRTC data channel API)
 *   4. send { type: 'file-end', name }
 *
 * On transient send() failures the chunk is retried once; a second
 * failure propagates as a TransferError so the UI can surface the
 * "Transfer stalled" message from §3.8.
 */

import { Peer } from "./peer-deps";
import type { DataConnection } from "./peer-deps";
import type { PhoneToKioskMessage } from "./protocol";

/** Chunk size per data-channel message. 16 KB stays well below the
 * WebRTC 256 KB default buffer and limits head-of-line blocking on
 * slow links. */
export const CHUNK_SIZE = 16 * 1024;
export const BACKPRESSURE_HIGH = 1 * 1024 * 1024;
export const BACKPRESSURE_LOW = 256 * 1024;

export interface ConnectionLike {
  send(data: PhoneToKioskMessage): void;
  close(): void;
  on(event: "open" | "close" | "error" | "bufferedamountlow", cb: (...args: unknown[]) => void): void;
  readonly bufferedAmount: number;
  bufferedAmountLowThreshold: number;
}

export interface PeerSendPeerLike {
  on(event: "open", cb: (id: string) => void): void;
  on(event: "error", cb: (err: Error) => void): void;
  connect(peerId: string): ConnectionLike;
  destroy(): void;
}

export type PeerSendFactory = () => PeerSendPeerLike;

export interface PeerSendOptions {
  roomId: string;
  peerFactory?: PeerSendFactory;
  /** Wait helper for backpressure — swapped in tests with a controllable promise. */
  waitForLow?: (conn: ConnectionLike) => Promise<void>;
}

export interface SendFileOptions {
  onProgress?: (sent: number, total: number) => void;
}

export class TransferError extends Error {
  override readonly name = "TransferError" as const;
  readonly stage: "connect" | "chunk" | "retry" | "remote";
  constructor(message: string, stage: TransferError["stage"]) {
    super(message);
    this.stage = stage;
    Object.setPrototypeOf(this, TransferError.prototype);
  }
}

const defaultFactory: PeerSendFactory = () => new Peer() as unknown as PeerSendPeerLike;

const defaultWaitForLow = (conn: ConnectionLike): Promise<void> =>
  new Promise<void>((resolve) => {
    conn.bufferedAmountLowThreshold = BACKPRESSURE_LOW;
    const handler = () => resolve();
    conn.on("bufferedamountlow", handler);
  });

export class PeerSend {
  readonly roomId: string;

  private readonly peerFactory: PeerSendFactory;
  private readonly waitForLow: (conn: ConnectionLike) => Promise<void>;
  private peer: PeerSendPeerLike | null = null;
  private conn: ConnectionLike | null = null;

  constructor(options: PeerSendOptions) {
    this.roomId = options.roomId;
    this.peerFactory = options.peerFactory ?? defaultFactory;
    this.waitForLow = options.waitForLow ?? defaultWaitForLow;
  }

  async connect(): Promise<void> {
    if (this.conn) return;
    const peer = this.peerFactory();
    this.peer = peer;

    await new Promise<void>((resolve, reject) => {
      peer.on("open", () => resolve());
      peer.on("error", (err) => reject(new TransferError(err.message, "connect")));
    });

    const conn = peer.connect(this.roomId);
    this.conn = conn;
    await new Promise<void>((resolve, reject) => {
      conn.on("open", () => resolve());
      conn.on("error", (err) => {
        if (err instanceof Error) reject(new TransferError(err.message, "connect"));
        else reject(new TransferError("data channel error", "connect"));
      });
    });
  }

  close(): void {
    if (this.conn) {
      try { this.conn.close(); } catch { /* ignore */ }
      this.conn = null;
    }
    if (this.peer) {
      try { this.peer.destroy(); } catch { /* ignore */ }
      this.peer = null;
    }
  }

  async sendFile(name: string, data: ArrayBuffer, options: SendFileOptions = {}): Promise<void> {
    if (!this.conn) throw new TransferError("connect() must resolve before sendFile()", "connect");
    const conn = this.conn;
    const total = data.byteLength;
    const onProgress = options.onProgress;

    this.safeSend({ type: "file-start", name, size: total });

    const bytes = new Uint8Array(data);
    let sent = 0;
    let idx = 0;

    while (sent < total) {
      if (conn.bufferedAmount > BACKPRESSURE_HIGH) {
        await this.waitForLow(conn);
      }

      const end = Math.min(sent + CHUNK_SIZE, total);
      const slice = bytes.slice(sent, end);
      const chunk = slice.buffer.slice(slice.byteOffset, slice.byteOffset + slice.byteLength);

      await this.sendChunkWithRetry({ type: "chunk", idx, data: chunk });

      sent = end;
      idx += 1;
      onProgress?.(sent, total);
    }

    this.safeSend({ type: "file-end", name });
  }

  /** Expose the live connection so Phase 3.7 can subscribe to remote events. */
  getConnection(): ConnectionLike | null {
    return this.conn;
  }

  private safeSend(message: PhoneToKioskMessage): void {
    if (!this.conn) throw new TransferError("no active connection", "chunk");
    this.conn.send(message);
  }

  private async sendChunkWithRetry(message: Extract<PhoneToKioskMessage, { type: "chunk" }>): Promise<void> {
    try {
      this.safeSend(message);
      return;
    } catch (e) {
      // First failure — wait a tick then retry once.
      await new Promise((r) => setTimeout(r, 0));
      try {
        this.safeSend(message);
        return;
      } catch (e2) {
        const msg = (e2 instanceof Error ? e2.message : (e instanceof Error ? e.message : "send failed"));
        throw new TransferError(`chunk ${message.idx}: ${msg}`, "retry");
      }
    }
  }
}
