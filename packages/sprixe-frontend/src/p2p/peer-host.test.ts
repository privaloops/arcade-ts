import { describe, it, expect, vi } from "vitest";
import { PeerHost, type PeerLike } from "./peer-host";
import type { DataConnection } from "./peer-deps";

type Handler = (...args: unknown[]) => void;

/** Minimal PeerJS mock — dispatches synchronously via emit(). */
class MockPeer {
  readonly id: string;
  destroyed = false;
  private readonly handlers = new Map<string, Set<Handler>>();

  constructor(id: string) {
    this.id = id;
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

  destroy(): void {
    this.destroyed = true;
    this.handlers.clear();
  }
}

class MockConnection {
  closed = false;
  sent: unknown[] = [];
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

  send(data: unknown): void {
    this.sent.push(data);
  }

  close(): void {
    this.closed = true;
  }
}

function makePeerFactory(): { factory: (id: string) => PeerLike; instances: MockPeer[] } {
  const instances: MockPeer[] = [];
  return {
    instances,
    factory: (id: string) => {
      const p = new MockPeer(id);
      instances.push(p);
      return p as unknown as PeerLike;
    },
  };
}

describe("PeerHost", () => {
  describe("lifecycle", () => {
    it("opens the peer with the requested roomId and resolves start() on 'open'", async () => {
      const { factory, instances } = makePeerFactory();
      const host = new PeerHost({ roomId: "room-abc", peerFactory: factory });

      const starting = host.start();
      expect(instances).toHaveLength(1);
      expect(instances[0]!.id).toBe("room-abc");

      // Simulate PeerJS emitting 'open' with the resolved id.
      instances[0]!.emit("open", "room-abc");
      await starting;

      expect(host.isOpen()).toBe(true);
    });

    it("start() is idempotent — second call does not create a second peer", async () => {
      const { factory, instances } = makePeerFactory();
      const host = new PeerHost({ roomId: "abc", peerFactory: factory });
      const p = host.start();
      instances[0]!.emit("open", "abc");
      await p;
      await host.start();
      expect(instances).toHaveLength(1);
    });

    it("close() destroys the peer and drops listeners", async () => {
      const { factory, instances } = makePeerFactory();
      const host = new PeerHost({ roomId: "abc", peerFactory: factory });
      const p = host.start();
      instances[0]!.emit("open", "abc");
      await p;

      const fileCb = vi.fn();
      host.onFile(fileCb);
      host.close();

      expect(instances[0]!.destroyed).toBe(true);
      expect(host.isOpen()).toBe(false);
    });

    it("start() rejects if the peer errors before opening", async () => {
      const { factory, instances } = makePeerFactory();
      const host = new PeerHost({ roomId: "abc", peerFactory: factory });
      const starting = host.start();
      instances[0]!.emit("error", new Error("peer init failed"));
      await expect(starting).rejects.toThrow("peer init failed");
    });
  });

  describe("incoming connections", () => {
    it("invokes onConnection on every new data channel", async () => {
      const { factory, instances } = makePeerFactory();
      const host = new PeerHost({ roomId: "abc", peerFactory: factory });
      const p = host.start();
      instances[0]!.emit("open", "abc");
      await p;

      const cb = vi.fn();
      host.onConnection(cb);

      const conn1 = new MockConnection();
      const conn2 = new MockConnection();
      instances[0]!.emit("connection", conn1 as unknown as DataConnection);
      instances[0]!.emit("connection", conn2 as unknown as DataConnection);

      expect(cb).toHaveBeenCalledTimes(2);
      expect(host.getConnectionCount()).toBe(2);
    });

    it("getConnectionCount drops back to 0 when peers close", async () => {
      const { factory, instances } = makePeerFactory();
      const host = new PeerHost({ roomId: "abc", peerFactory: factory });
      const p = host.start();
      instances[0]!.emit("open", "abc");
      await p;

      const conn = new MockConnection();
      instances[0]!.emit("connection", conn as unknown as DataConnection);
      expect(host.getConnectionCount()).toBe(1);
      conn.emit("close");
      expect(host.getConnectionCount()).toBe(0);
    });
  });

  describe("file reassembly", () => {
    async function spinUp() {
      const { factory, instances } = makePeerFactory();
      const host = new PeerHost({ roomId: "abc", peerFactory: factory });
      const p = host.start();
      instances[0]!.emit("open", "abc");
      await p;
      return { host, peer: instances[0]! };
    }

    it("reassembles a chunked payload into a single ArrayBuffer", async () => {
      const { host, peer } = await spinUp();
      const received: { name: string; data: ArrayBuffer }[] = [];
      host.onFile((f) => { received.push(f); });

      const conn = new MockConnection();
      peer.emit("connection", conn as unknown as DataConnection);

      const chunk0 = new Uint8Array([0x50, 0x4b, 0x03, 0x04]).buffer;
      const chunk1 = new Uint8Array([0xaa, 0xbb, 0xcc, 0xdd]).buffer;

      conn.emit("data", { type: "file-start", name: "sf2.zip", size: 8 });
      conn.emit("data", { type: "chunk", idx: 0, data: chunk0 });
      conn.emit("data", { type: "chunk", idx: 1, data: chunk1 });
      conn.emit("data", { type: "file-end", name: "sf2.zip" });

      expect(received).toHaveLength(1);
      expect(received[0]!.name).toBe("sf2.zip");
      expect(new Uint8Array(received[0]!.data)).toEqual(
        new Uint8Array([0x50, 0x4b, 0x03, 0x04, 0xaa, 0xbb, 0xcc, 0xdd])
      );
    });

    it("keeps separate reassembly state per connection", async () => {
      const { host, peer } = await spinUp();
      const received: { name: string; data: ArrayBuffer }[] = [];
      host.onFile((f) => { received.push(f); });

      const connA = new MockConnection();
      const connB = new MockConnection();
      peer.emit("connection", connA as unknown as DataConnection);
      peer.emit("connection", connB as unknown as DataConnection);

      connA.emit("data", { type: "file-start", name: "a.zip", size: 2 });
      connB.emit("data", { type: "file-start", name: "b.zip", size: 2 });
      connA.emit("data", { type: "chunk", idx: 0, data: new Uint8Array([1, 2]).buffer });
      connB.emit("data", { type: "chunk", idx: 0, data: new Uint8Array([9, 9]).buffer });
      connA.emit("data", { type: "file-end", name: "a.zip" });
      connB.emit("data", { type: "file-end", name: "b.zip" });

      expect(received.map((r) => r.name).sort()).toEqual(["a.zip", "b.zip"]);
      const a = received.find((r) => r.name === "a.zip")!;
      const b = received.find((r) => r.name === "b.zip")!;
      expect(new Uint8Array(a.data)).toEqual(new Uint8Array([1, 2]));
      expect(new Uint8Array(b.data)).toEqual(new Uint8Array([9, 9]));
    });

    it("ignores chunks that arrive before file-start (protocol violation)", async () => {
      const { host, peer } = await spinUp();
      const received: unknown[] = [];
      host.onFile((f) => { received.push(f); });

      const conn = new MockConnection();
      peer.emit("connection", conn as unknown as DataConnection);
      conn.emit("data", { type: "chunk", idx: 0, data: new ArrayBuffer(4) });
      conn.emit("data", { type: "file-end", name: "never-started.zip" });

      expect(received).toHaveLength(0);
    });

    it("supports sequential uploads on the same connection", async () => {
      const { host, peer } = await spinUp();
      const received: { name: string; data: ArrayBuffer }[] = [];
      host.onFile((f) => { received.push(f); });

      const conn = new MockConnection();
      peer.emit("connection", conn as unknown as DataConnection);

      for (const name of ["a.zip", "b.zip"]) {
        conn.emit("data", { type: "file-start", name, size: 1 });
        conn.emit("data", { type: "chunk", idx: 0, data: new Uint8Array([0x01]).buffer });
        conn.emit("data", { type: "file-end", name });
      }

      expect(received.map((r) => r.name)).toEqual(["a.zip", "b.zip"]);
    });
  });

  describe("broadcast", () => {
    it("sends the message to every connected phone", async () => {
      const { factory, instances } = makePeerFactory();
      const host = new PeerHost({ roomId: "abc", peerFactory: factory });
      const p = host.start();
      instances[0]!.emit("open", "abc");
      await p;

      const conn1 = new MockConnection();
      const conn2 = new MockConnection();
      instances[0]!.emit("connection", conn1 as unknown as DataConnection);
      instances[0]!.emit("connection", conn2 as unknown as DataConnection);

      host.broadcast({ type: "volume", level: 50 });

      expect(conn1.sent).toEqual([{ type: "volume", level: 50 }]);
      expect(conn2.sent).toEqual([{ type: "volume", level: 50 }]);
    });

    it("survives a single failing connection", async () => {
      const { factory, instances } = makePeerFactory();
      const host = new PeerHost({ roomId: "abc", peerFactory: factory });
      const p = host.start();
      instances[0]!.emit("open", "abc");
      await p;

      const bad = new MockConnection();
      bad.send = () => { throw new Error("channel closed"); };
      const good = new MockConnection();
      instances[0]!.emit("connection", bad as unknown as DataConnection);
      instances[0]!.emit("connection", good as unknown as DataConnection);

      expect(() => host.broadcast({ type: "volume", level: 100 })).not.toThrow();
      expect(good.sent).toEqual([{ type: "volume", level: 100 }]);
    });
  });

  describe("error surfacing", () => {
    it("onError fires for peer-level errors after open", async () => {
      const { factory, instances } = makePeerFactory();
      const host = new PeerHost({ roomId: "abc", peerFactory: factory });
      const p = host.start();
      instances[0]!.emit("open", "abc");
      await p;

      const cb = vi.fn();
      host.onError(cb);
      instances[0]!.emit("error", new Error("signaling lost"));

      expect(cb).toHaveBeenCalledTimes(1);
      expect(cb.mock.calls[0]![0]).toBeInstanceOf(Error);
    });
  });

  describe("incomplete transfer guard", () => {
    async function spinUp() {
      const { factory, instances } = makePeerFactory();
      const host = new PeerHost({ roomId: "abc", peerFactory: factory });
      const p = host.start();
      instances[0]!.emit("open", "abc");
      await p;
      return { host, peer: instances[0]! };
    }

    it("rejects and signals error when receivedBytes < declared size", async () => {
      const { host, peer } = await spinUp();
      const fileCb = vi.fn();
      const errCb = vi.fn();
      host.onFile(fileCb);
      host.onError(errCb);

      const conn = new MockConnection();
      peer.emit("connection", conn as unknown as DataConnection);

      conn.emit("data", { type: "file-start", name: "broken.zip", size: 1000 });
      conn.emit("data", { type: "chunk", idx: 0, data: new Uint8Array(500).buffer });
      conn.emit("data", { type: "file-end", name: "broken.zip" });

      expect(fileCb).not.toHaveBeenCalled();
      expect(errCb).toHaveBeenCalledTimes(1);
      const err = errCb.mock.calls[0]![0] as Error;
      expect(err.message).toContain("incomplete transfer");
      // The phone receives an error message back.
      const errMsg = conn.sent.find(
        (m) => (m as { type: string }).type === "error"
      ) as { type: "error"; name: string; error: string } | undefined;
      expect(errMsg).toBeDefined();
      expect(errMsg!.name).toBe("broken.zip");
    });

    it("rejects when a chunk index is missing (hole in sequence)", async () => {
      const { host, peer } = await spinUp();
      const fileCb = vi.fn();
      const errCb = vi.fn();
      host.onFile(fileCb);
      host.onError(errCb);

      const conn = new MockConnection();
      peer.emit("connection", conn as unknown as DataConnection);

      // size 2 * 16KB = 32768, idx 0 OK, idx 1 missing.
      conn.emit("data", { type: "file-start", name: "holey.zip", size: 32768 });
      conn.emit("data", { type: "chunk", idx: 0, data: new Uint8Array(16384).buffer });
      conn.emit("data", { type: "file-end", name: "holey.zip" });

      expect(fileCb).not.toHaveBeenCalled();
      expect(errCb).toHaveBeenCalledTimes(1);
    });
  });
});
