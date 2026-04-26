/**
 * PeerHost — WebRTC host running on the arcade kiosk.
 *
 * Opens a Peer with a stable `roomId` (rendered as the QR target on
 * the empty state screen), waits for connections from phones, and
 * reassembles chunked ROM uploads into { name, data } files ready to
 * be piped into Phase 3.4's rom-pipeline.
 *
 * Multiple phones can upload concurrently; reassembly state is kept
 * per connection so simultaneous file-start messages from two phones
 * don't collide.
 *
 * A peerFactory hook is exposed so Phase 3.2 unit tests can inject a
 * deterministic mock instead of hitting PeerJS Cloud.
 */

import { Peer } from "./peer-deps";
import { DEFAULT_ICE_SERVERS } from "./ice-config";
import { CHUNK_SIZE } from "./peer-send";
import type { DataConnection } from "./peer-deps";
import type { PhoneToKioskMessage, KioskToPhoneMessage } from "./protocol";

/**
 * The subset of Peer that PeerHost actually touches. Keeping this
 * explicit lets test mocks provide a minimal surface without having
 * to re-implement every PeerJS field.
 */
export interface PeerLike {
  on(event: "open", cb: (id: string) => void): void;
  on(event: "connection", cb: (conn: DataConnection) => void): void;
  on(event: "error", cb: (err: Error) => void): void;
  on(event: "close", cb: () => void): void;
  destroy(): void;
}

export interface ReceivedFile {
  name: string;
  size: number;
  data: ArrayBuffer;
}

export type PeerFactory = (id: string) => PeerLike;

export interface PeerHostOptions {
  roomId: string;
  peerFactory?: PeerFactory;
}

type FileListener = (file: ReceivedFile, conn: DataConnection) => void | Promise<void>;
type ConnectionListener = (conn: DataConnection) => void;
type ErrorListener = (err: Error) => void;
export type PhoneCommand = Extract<PhoneToKioskMessage, { type: "cmd" }>;
type CommandListener = (cmd: PhoneCommand, conn: DataConnection) => void;

interface ReassemblyState {
  name: string;
  size: number;
  chunks: ArrayBuffer[];
  receivedBytes: number;
}

const defaultFactory: PeerFactory = (id) =>
  new Peer(id, { config: { iceServers: DEFAULT_ICE_SERVERS } }) as unknown as PeerLike;

export class PeerHost {
  readonly roomId: string;

  private readonly peerFactory: PeerFactory;
  private peer: PeerLike | null = null;
  private opened = false;

  private readonly fileListeners = new Set<FileListener>();
  private readonly connectionListeners = new Set<ConnectionListener>();
  private readonly errorListeners = new Set<ErrorListener>();
  private readonly commandListeners = new Set<CommandListener>();
  private readonly connections = new Set<DataConnection>();
  private readonly reassemblyByConn = new WeakMap<DataConnection, ReassemblyState>();
  private readonly connCleanups = new WeakMap<DataConnection, () => void>();

  constructor(options: PeerHostOptions) {
    this.roomId = options.roomId;
    this.peerFactory = options.peerFactory ?? defaultFactory;
  }

  /**
   * Open the PeerJS connection. Resolves when PeerJS emits 'open'.
   * Idempotent while the peer is live; on failure, the internal peer
   * is torn down so callers can retry with a fresh attempt.
   */
  start(): Promise<void> {
    if (this.peer && this.opened) return Promise.resolve();
    if (this.peer) {
      try { this.peer.destroy(); } catch { /* ignore */ }
      this.peer = null;
    }
    const peer = this.peerFactory(this.roomId);
    this.peer = peer;

    return new Promise<void>((resolve, reject) => {
      peer.on("open", () => {
        this.opened = true;
        resolve();
      });
      peer.on("error", (err) => {
        for (const l of this.errorListeners) l(err);
        if (!this.opened) {
          try { peer.destroy(); } catch { /* ignore */ }
          if (this.peer === peer) this.peer = null;
          reject(err);
        }
      });
      peer.on("close", () => {
        this.opened = false;
      });
      peer.on("connection", (conn) => this.handleConnection(conn));
    });
  }

  close(): void {
    if (!this.peer) return;
    for (const conn of this.connections) {
      const cleanup = this.connCleanups.get(conn);
      cleanup?.();
    }
    this.connections.clear();
    this.fileListeners.clear();
    this.connectionListeners.clear();
    this.errorListeners.clear();
    this.commandListeners.clear();
    this.peer.destroy();
    this.peer = null;
    this.opened = false;
  }

  isOpen(): boolean {
    return this.opened;
  }

  onFile(cb: FileListener): () => void {
    this.fileListeners.add(cb);
    return () => {
      this.fileListeners.delete(cb);
    };
  }

  onConnection(cb: ConnectionListener): () => void {
    this.connectionListeners.add(cb);
    return () => {
      this.connectionListeners.delete(cb);
    };
  }

  onError(cb: ErrorListener): () => void {
    this.errorListeners.add(cb);
    return () => {
      this.errorListeners.delete(cb);
    };
  }

  /**
   * Subscribe to remote control commands from any connected phone.
   * Paired with Phase 3.7: the phone's RemoteTab emits
   * { type: "cmd", action, payload } messages that the host must route
   * to its local overlay / save controller / settings.
   */
  onCommand(cb: CommandListener): () => void {
    this.commandListeners.add(cb);
    return () => {
      this.commandListeners.delete(cb);
    };
  }

  /** Broadcast a kiosk-originated message to every connected phone. */
  broadcast(message: KioskToPhoneMessage): void {
    for (const conn of this.connections) {
      try {
        (conn as unknown as { send: (m: unknown) => void }).send(message);
      } catch {
        // Individual send failures are logged elsewhere; don't let a
        // single broken channel take down the broadcast loop.
      }
    }
  }

  /** Testing helper — count of currently-open phone connections. */
  getConnectionCount(): number {
    return this.connections.size;
  }

  private handleConnection(conn: DataConnection): void {
    this.connections.add(conn);

    const connAny = conn as unknown as {
      on: (event: string, cb: (...args: unknown[]) => void) => void;
    };
    const onData = (data: unknown) => this.handleData(conn, data as PhoneToKioskMessage);
    const onClose = () => this.removeConnection(conn);
    const onError = (err: unknown) => {
      if (err instanceof Error) for (const l of this.errorListeners) l(err);
      this.removeConnection(conn);
    };

    connAny.on("data", onData);
    connAny.on("close", onClose);
    connAny.on("error", onError);

    // Defer connectionListeners until the data channel is actually
    // open. PeerJS fires 'connection' as soon as the signalling answer
    // is exchanged, but the underlying RTCDataChannel may still be in
    // 'connecting'. Sending before 'open' silently fails, which means
    // StateSync.broadcastFullState() (wired through onConnection) was
    // dropping the initial state and leaving the phone with default
    // disabled controls.
    connAny.on("open", () => {
      for (const l of this.connectionListeners) l(conn);
    });

    this.connCleanups.set(conn, () => {
      try {
        (conn as unknown as { close?: () => void }).close?.();
      } catch { /* ignore */ }
    });
  }

  private handleData(conn: DataConnection, message: PhoneToKioskMessage): void {
    switch (message.type) {
      case "file-start":
        this.reassemblyByConn.set(conn, {
          name: message.name,
          size: message.size,
          chunks: [],
          receivedBytes: 0,
        });
        return;
      case "chunk": {
        const state = this.reassemblyByConn.get(conn);
        if (!state) return; // chunk before file-start — protocol violation, ignore
        state.chunks[message.idx] = message.data;
        state.receivedBytes += message.data.byteLength;
        return;
      }
      case "file-end": {
        const state = this.reassemblyByConn.get(conn);
        if (!state) return;
        this.reassemblyByConn.delete(conn);

        // Integrity check — if the connection died mid-transfer
        // concatChunks would zero-pad and hand a corrupted ZIP to the pipeline.
        const expectedChunks = Math.ceil(state.size / CHUNK_SIZE) || 0;
        const missing = findMissingChunks(state.chunks, expectedChunks);
        if (state.receivedBytes !== state.size || missing.length > 0) {
          const errMsg = `incomplete transfer (got ${state.receivedBytes}/${state.size} bytes${
            missing.length > 0 ? `, missing chunks ${missing.slice(0, 5).join(",")}` : ""
          })`;
          try {
            (conn as unknown as { send: (m: KioskToPhoneMessage) => void }).send({
              type: "error", name: state.name, error: errMsg,
            });
          } catch { /* phone may already be gone */ }
          for (const l of this.errorListeners) l(new Error(errMsg));
          return;
        }

        const data = concatChunks(state.chunks, state.receivedBytes);
        const file: ReceivedFile = { name: state.name, size: data.byteLength, data };
        for (const l of this.fileListeners) void l(file, conn);
        return;
      }
      case "cmd":
        for (const l of this.commandListeners) l(message, conn);
        return;
    }
  }

  private removeConnection(conn: DataConnection): void {
    this.connections.delete(conn);
    this.reassemblyByConn.delete(conn);
    this.connCleanups.delete(conn);
  }
}

function findMissingChunks(chunks: ArrayBuffer[], expected: number): number[] {
  const missing: number[] = [];
  for (let i = 0; i < expected; i++) {
    if (!chunks[i]) missing.push(i);
  }
  return missing;
}

function concatChunks(chunks: ArrayBuffer[], totalBytes: number): ArrayBuffer {
  const out = new Uint8Array(totalBytes);
  let offset = 0;
  for (const chunk of chunks) {
    if (!chunk) continue;
    out.set(new Uint8Array(chunk), offset);
    offset += chunk.byteLength;
  }
  return out.buffer;
}
