import type { BrowserContext } from "@playwright/test";

/**
 * Install the same PeerJS mock used by p3-rom-transfer-p2p on a
 * context, plus the default mapping + static room id. Keeps the
 * phone-remote + state-sync specs focused on their own assertions.
 */
export async function installPeerMock(
  context: BrowserContext,
  roomId: string,
): Promise<void> {
  await context.addInitScript((id) => {
    /* eslint-disable @typescript-eslint/no-explicit-any */
    const TOPIC = `peerjs-mock-${id}`;

    type MockHandler = (...args: any[]) => void;

    class MockDataConnection {
      bufferedAmount = 0;
      bufferedAmountLowThreshold = 0;
      private handlers = new Map<string, Set<MockHandler>>();
      private channel: BroadcastChannel;
      private role: "host" | "phone";
      private connId: string;

      constructor(channel: BroadcastChannel, role: "host" | "phone", connId: string) {
        this.channel = channel;
        this.role = role;
        this.connId = connId;
        this.channel.addEventListener("message", (ev: MessageEvent) => {
          const m = ev.data as { kind: string; connId: string; event?: string; data?: any };
          if (m.connId !== this.connId) return;
          if (m.kind === "open" && this.role === "phone") this.emit("open");
          if (m.kind === "data" && m.event !== undefined) this.emit("data", m.data);
        });
      }

      send(data: unknown): void {
        this.channel.postMessage({ kind: "data", connId: this.connId, event: "data", data });
      }

      close(): void {
        this.emit("close");
      }

      on(event: string, cb: MockHandler): void {
        let set = this.handlers.get(event);
        if (!set) { set = new Set(); this.handlers.set(event, set); }
        set.add(cb);
      }

      emit(event: string, ...args: any[]): void {
        const set = this.handlers.get(event);
        if (!set) return;
        for (const cb of set) cb(...args);
      }
    }

    class MockPeer {
      id: string;
      private handlers = new Map<string, Set<MockHandler>>();
      private channel: BroadcastChannel;
      private role: "host" | "phone" | "unknown" = "unknown";

      constructor(peerId?: string) {
        this.id = peerId ?? `peer-${Math.random().toString(36).slice(2, 10)}`;
        this.channel = new BroadcastChannel(TOPIC);
        if (peerId === id) {
          this.role = "host";
          this.channel.addEventListener("message", (ev: MessageEvent) => {
            const m = ev.data as { kind: string; connId: string };
            if (m.kind === "offer") {
              const conn = new MockDataConnection(this.channel, "host", m.connId);
              this.channel.postMessage({ kind: "open", connId: m.connId });
              this.emit("connection", conn);
              conn.emit("open");
            }
          });
        }
        queueMicrotask(() => this.emit("open", this.id));
      }

      on(event: string, cb: MockHandler): void {
        let set = this.handlers.get(event);
        if (!set) { set = new Set(); this.handlers.set(event, set); }
        set.add(cb);
      }

      emit(event: string, ...args: any[]): void {
        const set = this.handlers.get(event);
        if (!set) return;
        for (const cb of set) cb(...args);
      }

      connect(targetId: string): MockDataConnection {
        this.role = "phone";
        const connId = `conn-${Math.random().toString(36).slice(2)}`;
        const conn = new MockDataConnection(this.channel, "phone", connId);
        this.channel.postMessage({ kind: "offer", connId, target: targetId });
        return conn;
      }

      destroy(): void {
        this.channel.close();
        this.handlers.clear();
      }
    }

    (window as any).__PeerMock = MockPeer;
  }, roomId);
}

export async function seedMappingAndRoomId(
  context: BrowserContext,
  roomId: string,
): Promise<void> {
  await context.addInitScript((rid) => {
    if (!localStorage.getItem("sprixe.input.mapping.v1")) {
      localStorage.setItem(
        "sprixe.input.mapping.v1",
        JSON.stringify({
          version: 1,
          type: "gamepad",
          p1: {
            coin: { kind: "button", index: 8 },
            start: { kind: "button", index: 9 },
            up: { kind: "button", index: 12 },
            down: { kind: "button", index: 13 },
            left: { kind: "button", index: 14 },
            right: { kind: "button", index: 15 },
            button1: { kind: "button", index: 0 },
            button2: { kind: "button", index: 1 },
            button3: { kind: "button", index: 2 },
            button4: { kind: "button", index: 3 },
            button5: { kind: "button", index: 4 },
            button6: { kind: "button", index: 5 },
          },
        })
      );
    }
    localStorage.setItem("sprixe.roomId", rid);
  }, roomId);
}
