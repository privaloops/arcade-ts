import { describe, it, expect, vi } from "vitest";
import {
  PeerSend,
  TransferError,
  CHUNK_SIZE,
  BACKPRESSURE_HIGH,
  BACKPRESSURE_LOW,
  type ConnectionLike,
  type PeerSendPeerLike,
} from "./peer-send";
import type { PhoneToKioskMessage } from "./protocol";

type Handler = (...args: unknown[]) => void;

class MockConnection implements ConnectionLike {
  sent: PhoneToKioskMessage[] = [];
  bufferedAmount = 0;
  bufferedAmountLowThreshold = 0;
  closed = false;
  sendCallCount = 0;
  /** Set of 1-based call indices that should throw when send() is invoked. */
  failAtCall = new Set<number>();
  private readonly handlers = new Map<string, Set<Handler>>();

  send(data: PhoneToKioskMessage): void {
    this.sendCallCount += 1;
    if (this.failAtCall.has(this.sendCallCount)) {
      throw new Error(`simulated failure at call ${this.sendCallCount}`);
    }
    this.sent.push(data);
  }

  close(): void {
    this.closed = true;
  }

  on(event: string, cb: Handler): void {
    let set = this.handlers.get(event);
    if (!set) {
      set = new Set();
      this.handlers.set(event, set);
    }
    set.add(cb);
  }

  emit(event: string, ...args: unknown[]): void {
    const set = this.handlers.get(event);
    if (!set) return;
    for (const cb of set) cb(...args);
  }
}

class MockPeer {
  readonly connections: MockConnection[] = [];
  destroyed = false;
  private readonly handlers = new Map<string, Set<Handler>>();

  on(event: string, cb: Handler): void {
    let set = this.handlers.get(event);
    if (!set) {
      set = new Set();
      this.handlers.set(event, set);
    }
    set.add(cb);
  }

  emit(event: string, ...args: unknown[]): void {
    const set = this.handlers.get(event);
    if (!set) return;
    for (const cb of set) cb(...args);
  }

  connect(): ConnectionLike {
    const conn = new MockConnection();
    this.connections.push(conn);
    // Simulate async open on next microtask so connect() awaits feel real.
    queueMicrotask(() => conn.emit("open"));
    return conn;
  }

  destroy(): void {
    this.destroyed = true;
  }
}

function makeSend(options: {
  peer?: MockPeer;
  autoDrain?: boolean;
} = {}) {
  const peer = options.peer ?? new MockPeer();
  const send = new PeerSend({
    roomId: "abc",
    peerFactory: () => peer as unknown as PeerSendPeerLike,
    waitForLow: async (conn) => {
      if (options.autoDrain !== false) {
        // Drain: reset bufferedAmount so the pump loop continues.
        (conn as MockConnection).bufferedAmount = 0;
      }
    },
  });
  return { peer, send };
}

async function openAndConnect(send: PeerSend, peer: MockPeer): Promise<MockConnection> {
  const connecting = send.connect();
  queueMicrotask(() => peer.emit("open", "phone-id"));
  await connecting;
  return peer.connections[0]!;
}

describe("PeerSend", () => {
  describe("connect", () => {
    it("opens a Peer and a DataConnection to the roomId", async () => {
      const { peer, send } = makeSend();
      await openAndConnect(send, peer);
      expect(peer.connections).toHaveLength(1);
    });

    it("connect() rejects with TransferError if the peer errors before open", async () => {
      const peer = new MockPeer();
      const send = new PeerSend({ roomId: "abc", peerFactory: () => peer as unknown as PeerSendPeerLike });
      const p = send.connect();
      queueMicrotask(() => peer.emit("error", new Error("ICE failed")));
      await expect(p).rejects.toBeInstanceOf(TransferError);
    });
  });

  describe("chunking", () => {
    it("splits a payload into 16 KB chunks with file-start + file-end framing", async () => {
      const { peer, send } = makeSend();
      const conn = await openAndConnect(send, peer);

      const size = CHUNK_SIZE * 3 + 100;
      const data = new Uint8Array(size);
      for (let i = 0; i < size; i++) data[i] = i & 0xff;
      await send.sendFile("sf2.zip", data.buffer);

      const types = conn.sent.map((m) => m.type);
      expect(types[0]).toBe("file-start");
      expect(types[types.length - 1]).toBe("file-end");

      const chunks = conn.sent.filter((m) => m.type === "chunk");
      expect(chunks).toHaveLength(4); // 3 full + 1 remainder
      expect(chunks[0]!.idx).toBe(0);
      expect(chunks[3]!.idx).toBe(3);
      expect(chunks[0]!.data.byteLength).toBe(CHUNK_SIZE);
      expect(chunks[3]!.data.byteLength).toBe(100);
    });

    it("tiny files ship as a single chunk", async () => {
      const { peer, send } = makeSend();
      const conn = await openAndConnect(send, peer);

      await send.sendFile("tiny.zip", new Uint8Array([1, 2, 3, 4]).buffer);

      const chunks = conn.sent.filter((m) => m.type === "chunk");
      expect(chunks).toHaveLength(1);
      const start = conn.sent[0]! as Extract<PhoneToKioskMessage, { type: "file-start" }>;
      expect(start.size).toBe(4);
    });
  });

  describe("backpressure", () => {
    it("pauses when bufferedAmount exceeds BACKPRESSURE_HIGH and resumes via waitForLow", async () => {
      const peer = new MockPeer();
      let drainCalls = 0;
      const send = new PeerSend({
        roomId: "abc",
        peerFactory: () => peer as unknown as PeerSendPeerLike,
        waitForLow: async (conn) => {
          drainCalls += 1;
          (conn as MockConnection).bufferedAmount = 0;
        },
      });
      const conn = await openAndConnect(send, peer);

      // Start with the buffer over the high-water mark so the first
      // chunk has to wait. After the first drain, autoDrain is false
      // (we reset manually), so subsequent chunks should not re-drain.
      conn.bufferedAmount = BACKPRESSURE_HIGH + 1;

      await send.sendFile("x.zip", new Uint8Array(CHUNK_SIZE * 2).buffer);

      expect(drainCalls).toBeGreaterThanOrEqual(1);
    });

    it("does not drain when bufferedAmount stays under the high threshold", async () => {
      const peer = new MockPeer();
      let drainCalls = 0;
      const send = new PeerSend({
        roomId: "abc",
        peerFactory: () => peer as unknown as PeerSendPeerLike,
        waitForLow: async () => { drainCalls += 1; },
      });
      await openAndConnect(send, peer);

      await send.sendFile("x.zip", new Uint8Array(CHUNK_SIZE).buffer);
      expect(drainCalls).toBe(0);
    });
  });

  describe("retry", () => {
    it("retries a transient send failure once, then continues", async () => {
      const { peer, send } = makeSend();
      const conn = await openAndConnect(send, peer);

      // Call #1 is the file-start; fail call #2 (first chunk) and
      // let the retry (call #3) succeed.
      conn.failAtCall.add(2);

      await send.sendFile("x.zip", new Uint8Array(CHUNK_SIZE).buffer);

      const chunks = conn.sent.filter((m) => m.type === "chunk");
      expect(chunks).toHaveLength(1);
    });

    it("aborts with TransferError when two consecutive chunk sends fail", async () => {
      const { peer, send } = makeSend();
      const conn = await openAndConnect(send, peer);
      // Fail calls #2 (first chunk) and #3 (its retry). Call #1 is file-start.
      conn.failAtCall.add(2);
      conn.failAtCall.add(3);

      await expect(send.sendFile("x.zip", new Uint8Array(CHUNK_SIZE).buffer))
        .rejects.toBeInstanceOf(TransferError);
    });
  });

  describe("progress", () => {
    it("fires onProgress once per chunk with cumulative sent + total", async () => {
      const { peer, send } = makeSend();
      await openAndConnect(send, peer);

      const totalBytes = CHUNK_SIZE * 2 + 500;
      const callbacks: Array<[number, number]> = [];
      await send.sendFile("x.zip", new Uint8Array(totalBytes).buffer, {
        onProgress: (sent, total) => callbacks.push([sent, total]),
      });

      expect(callbacks.map((c) => c[0])).toEqual([CHUNK_SIZE, CHUNK_SIZE * 2, totalBytes]);
      expect(callbacks.every((c) => c[1] === totalBytes)).toBe(true);
    });

    it("omitting onProgress is fine", async () => {
      const { peer, send } = makeSend();
      await openAndConnect(send, peer);
      await expect(send.sendFile("x.zip", new Uint8Array(1024).buffer)).resolves.toBeUndefined();
    });
  });

  describe("close", () => {
    it("close() tears down the connection and destroys the peer", async () => {
      const { peer, send } = makeSend();
      const conn = await openAndConnect(send, peer);
      send.close();
      expect(conn.closed).toBe(true);
      expect(peer.destroyed).toBe(true);
    });
  });

  describe("getConnection", () => {
    it("returns null before connect + the live conn after", async () => {
      const { peer, send } = makeSend();
      expect(send.getConnection()).toBeNull();
      const conn = await openAndConnect(send, peer);
      expect(send.getConnection()).toBe(conn);
    });
  });

  describe("thresholds", () => {
    it("exports the canonical high/low constants", () => {
      expect(BACKPRESSURE_HIGH).toBe(1024 * 1024);
      expect(BACKPRESSURE_LOW).toBe(256 * 1024);
    });
  });
});
