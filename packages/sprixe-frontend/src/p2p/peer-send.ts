/**
 * PeerSend — WebRTC sender running on the phone that uploads a ROM
 * to the kiosk (§2.9 + §3.8).
 *
 * Transfer flow:
 *   1. open DataConnection to the kiosk's roomId (PeerJS dial) with
 *      bounded timeouts on both Peer 'open' and DataConnection 'open'
 *   2. send { type: 'file-start', name, size }
 *   3. chunk the ArrayBuffer into CHUNK_SIZE-byte slices and stream
 *      them with backpressure handling:
 *        - pause when conn.bufferedAmount > BACKPRESSURE_HIGH (1 MB)
 *        - resume when it drops to ≤ BACKPRESSURE_LOW (256 KB) via
 *          the 'bufferedamountlow' event (WebRTC data channel API)
 *        - abort if the drain never fires within a bounded window
 *          (connection died silently)
 *   4. send { type: 'file-end', name }
 *   5. wait for bufferedAmount to reach 0 so the caller only resolves
 *      once bytes have actually left the device.
 *
 * On transient send() failures the chunk is retried once; a second
 * failure propagates as a TransferError so the UI can surface the
 * "Transfer stalled" message from §3.8.
 */

import { Peer } from "./peer-deps";
import { DEFAULT_ICE_SERVERS } from "./ice-config";
import type { PhoneToKioskMessage } from "./protocol";

/** 16 KB stays well below the WebRTC 256 KB default buffer. */
export const CHUNK_SIZE = 16 * 1024;
export const BACKPRESSURE_HIGH = 1 * 1024 * 1024;
export const BACKPRESSURE_LOW = 256 * 1024;

/** Bounded so a dead PeerJS signaling channel surfaces within 15 s
 * instead of a permanent "Connecting…" state. */
export const DEFAULT_CONNECT_TIMEOUT_MS = 15_000;
export const DEFAULT_BACKPRESSURE_TIMEOUT_MS = 10_000;
export const DEFAULT_DRAIN_TIMEOUT_MS = 30_000;

export interface ConnectionLike {
  send(data: PhoneToKioskMessage): void;
  close(): void;
  on(event: "open" | "close" | "error" | "bufferedamountlow", cb: (...args: unknown[]) => void): void;
  off?(event: "bufferedamountlow", cb: (...args: unknown[]) => void): void;
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
  waitForLow?: (conn: ConnectionLike, timeoutMs: number) => Promise<void>;
  connectTimeoutMs?: number;
  backpressureTimeoutMs?: number;
  drainTimeoutMs?: number;
}

export interface SendFileOptions {
  onProgress?: (sent: number, total: number) => void;
  /** Byte offset to resume from — used by sendFileWithReconnect. */
  startByte?: number;
}

export class TransferError extends Error {
  override readonly name = "TransferError" as const;
  readonly stage: "connect" | "chunk" | "retry" | "remote" | "stalled";
  constructor(message: string, stage: TransferError["stage"]) {
    super(message);
    this.stage = stage;
    Object.setPrototypeOf(this, TransferError.prototype);
  }
}

const defaultFactory: PeerSendFactory = () =>
  new Peer({ config: { iceServers: DEFAULT_ICE_SERVERS } }) as unknown as PeerSendPeerLike;

/** Exported for focused unit testing — not part of the public API. */
export const defaultWaitForLow = (conn: ConnectionLike, timeoutMs: number): Promise<void> =>
  new Promise<void>((resolve, reject) => {
    conn.bufferedAmountLowThreshold = BACKPRESSURE_LOW;
    let settled = false;
    const handler = () => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      conn.off?.("bufferedamountlow", handler);
      resolve();
    };
    const timer = setTimeout(() => {
      if (settled) return;
      settled = true;
      conn.off?.("bufferedamountlow", handler);
      reject(new TransferError("backpressure drain stalled", "stalled"));
    }, timeoutMs);
    conn.on("bufferedamountlow", handler);
  });

function withTimeout<T>(promise: Promise<T>, timeoutMs: number, message: string): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    const timer = setTimeout(() => reject(new TransferError(message, "connect")), timeoutMs);
    promise.then(
      (v) => {
        clearTimeout(timer);
        resolve(v);
      },
      (e: unknown) => {
        clearTimeout(timer);
        reject(e instanceof Error ? e : new TransferError(String(e), "connect"));
      }
    );
  });
}

export class PeerSend {
  readonly roomId: string;

  private readonly peerFactory: PeerSendFactory;
  private readonly waitForLow: (conn: ConnectionLike, timeoutMs: number) => Promise<void>;
  private readonly connectTimeoutMs: number;
  private readonly backpressureTimeoutMs: number;
  private readonly drainTimeoutMs: number;
  private peer: PeerSendPeerLike | null = null;
  private conn: ConnectionLike | null = null;

  constructor(options: PeerSendOptions) {
    this.roomId = options.roomId;
    this.peerFactory = options.peerFactory ?? defaultFactory;
    this.waitForLow = options.waitForLow ?? defaultWaitForLow;
    this.connectTimeoutMs = options.connectTimeoutMs ?? DEFAULT_CONNECT_TIMEOUT_MS;
    this.backpressureTimeoutMs = options.backpressureTimeoutMs ?? DEFAULT_BACKPRESSURE_TIMEOUT_MS;
    this.drainTimeoutMs = options.drainTimeoutMs ?? DEFAULT_DRAIN_TIMEOUT_MS;
  }

  async connect(): Promise<void> {
    if (this.conn) return;
    const peer = this.peerFactory();
    this.peer = peer;

    try {
      await withTimeout(
        new Promise<void>((resolve, reject) => {
          peer.on("open", () => resolve());
          peer.on("error", (err) => reject(new TransferError(err.message, "connect")));
        }),
        this.connectTimeoutMs,
        "Peer open timeout"
      );

      const conn = peer.connect(this.roomId);
      this.conn = conn;
      await withTimeout(
        new Promise<void>((resolve, reject) => {
          conn.on("open", () => resolve());
          conn.on("error", (err) => {
            if (err instanceof Error) reject(new TransferError(err.message, "connect"));
            else reject(new TransferError("data channel error", "connect"));
          });
        }),
        this.connectTimeoutMs,
        "Data channel open timeout"
      );
    } catch (e) {
      // Tear down any half-open peer / conn so a retry gets a clean slate.
      this.close();
      throw e;
    }
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
    const startByte = options.startByte ?? 0;

    this.safeSend({ type: "file-start", name, size: total });

    const bytes = new Uint8Array(data);
    let sent = startByte;
    let idx = Math.floor(startByte / CHUNK_SIZE);

    while (sent < total) {
      if (conn.bufferedAmount > BACKPRESSURE_HIGH) {
        await this.waitForLow(conn, this.backpressureTimeoutMs);
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
    await this.waitForDrain(conn, this.drainTimeoutMs);
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

  /** Poll bufferedAmount until it reaches 0 so the caller only resolves
   * once the OS send queue is empty. Detects zombie connections where
   * file-end went through but the channel stopped flushing. */
  private async waitForDrain(conn: ConnectionLike, timeoutMs: number): Promise<void> {
    if (conn.bufferedAmount === 0) return;
    const start = Date.now();
    while (conn.bufferedAmount > 0) {
      if (Date.now() - start > timeoutMs) {
        throw new TransferError("send buffer did not drain", "stalled");
      }
      await new Promise((r) => setTimeout(r, 50));
    }
  }
}
