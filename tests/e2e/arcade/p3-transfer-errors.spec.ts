import { test, expect } from "@playwright/test";

/**
 * p3-transfer-errors — a phone uploads a file that isn't a ROM; the
 * kiosk surfaces a typed error toast and tells the phone why (Phase
 * 3.11 + 4b.6). Runs in a single browser context so the PeerMock
 * BroadcastChannel bridges host + phone.
 */

const ROOM_ID = "sprixe-err-test";

async function installPeerMock(context: import("@playwright/test").BrowserContext): Promise<void> {
  await context.addInitScript((roomId) => {
    /* eslint-disable @typescript-eslint/no-explicit-any */
    const TOPIC = `peerjs-mock-${roomId}`;

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
          const m = ev.data as { kind: string; connId: string; data?: any };
          if (m.connId !== this.connId) return;
          if (m.kind === "open" && this.role === "phone") this.emit("open");
          if (m.kind === "data") this.emit("data", m.data);
        });
      }

      send(data: unknown): void {
        this.channel.postMessage({ kind: "data", connId: this.connId, data });
      }
      close(): void { this.emit("close"); }
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

      constructor(id?: string) {
        this.id = id ?? `peer-${Math.random().toString(36).slice(2, 10)}`;
        this.channel = new BroadcastChannel(TOPIC);
        if (id === roomId) {
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
  }, ROOM_ID);
}

async function seedKioskState(context: import("@playwright/test").BrowserContext): Promise<void> {
  await context.addInitScript(() => {
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
          confirm: { kind: "button", index: 0 },
          back: { kind: "button", index: 1 },
        },
      })
    );
    localStorage.setItem("sprixe.roomId", "sprixe-err-test");
    localStorage.setItem("sprixe.useMockCatalogue", "true");
  });
}

test.describe("Phase 4b.6 — transfer error surfacing", () => {
  test("phone uploads a non-ZIP file → kiosk shows an error toast", async ({ browser }) => {
    const context = await browser.newContext();
    await seedKioskState(context);
    await installPeerMock(context);

    const hostPage = await context.newPage();
    await hostPage.goto("/");
    await expect(hostPage.locator(".af-browser-screen")).toBeVisible();

    const phonePage = await context.newPage();
    await phonePage.goto(`/send/${ROOM_ID}`);
    await expect(phonePage.locator('[data-testid="phone-page"]')).toBeVisible();

    // Upload a plain-text file — the pipeline must reject it with
    // InvalidRomError (the classifier maps to "Not a valid ZIP archive").
    await phonePage.locator('[data-testid="upload-file-input"]').setInputFiles({
      name: "fake.zip",
      mimeType: "application/zip",
      buffer: Buffer.from("this is not a zip", "utf-8"),
    });

    // Host-side toast should appear with the classified message.
    await expect(hostPage.locator('[data-testid="toast"]')).toBeVisible({ timeout: 5000 });
    const toastText = await hostPage.locator('[data-testid="toast"] .af-toast-message').textContent();
    expect(toastText).toMatch(/Not a valid ZIP|Unknown ROM|Transfer failed/);

    await context.close();
  });
});
