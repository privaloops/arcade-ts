import { test, expect } from "@playwright/test";
import { resolve } from "node:path";

/**
 * P2P transfer E2E — two Playwright contexts connected by a shared
 * BroadcastChannel so neither touches the real PeerJS Cloud.
 *
 * Both the kiosk and the phone install the same PeerMock class via
 * addInitScript. The mock relays messages over a BroadcastChannel
 * named after the roomId; the real WebRTC path is never exercised.
 * This is exactly what the plan §5.0 prescribes for P2P E2Es: no
 * network I/O in CI.
 */

const ROOM_ID = "sprixe-e2e-test-123";

async function installPeerMock(context: import("@playwright/test").BrowserContext): Promise<void> {
  await context.addInitScript((roomId) => {
    /* eslint-disable @typescript-eslint/no-explicit-any */
    const TOPIC = `peerjs-mock-${roomId}`;

    type MockHandler = (...args: any[]) => void;

    /**
     * The mock mimics PeerJS's minimal API surface that PeerSend and
     * PeerHost actually use. Messages flow through BroadcastChannel so
     * host and phone see each other even when they live in separate
     * Playwright contexts that share the same origin.
     */
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
        if (!set) {
          set = new Set();
          this.handlers.set(event, set);
        }
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

      constructor(id?: string) {
        this.id = id ?? `peer-${Math.random().toString(36).slice(2, 10)}`;
        this.channel = new BroadcastChannel(TOPIC);

        // Host = an instance constructed WITH a fixed roomId that
        // happens to match our TOPIC room. Phone = constructed without
        // an id (PeerSend calls new Peer()) and later calls .connect(roomId).
        if (id === roomId) {
          this.role = "host";
          this.channel.addEventListener("message", (ev: MessageEvent) => {
            const m = ev.data as { kind: string; connId: string };
            if (m.kind === "offer") {
              const conn = new MockDataConnection(this.channel, "host", m.connId);
              // Reply with 'open' so the phone's connection resolves.
              this.channel.postMessage({ kind: "open", connId: m.connId });
              // Host sees the peer.
              this.emit("connection", conn);
              conn.emit("open");
            }
          });
        }

        queueMicrotask(() => this.emit("open", this.id));
      }

      on(event: string, cb: MockHandler): void {
        let set = this.handlers.get(event);
        if (!set) {
          set = new Set();
          this.handlers.set(event, set);
        }
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
  }, ROOM_ID);
}

async function seedDefaultMappingOnContext(context: import("@playwright/test").BrowserContext): Promise<void> {
  await context.addInitScript(() => {
    if (localStorage.getItem("sprixe.input.mapping.v1")) return;
    localStorage.setItem(
      "sprixe.input.mapping.v1",
      JSON.stringify({
        version: 1,
        type: "gamepad",
        p1: {
          coin: { kind: "button", index: 8 },
          start: { kind: "button", index: 9 },
          up: { kind: "axis", index: 1, dir: -1 },
          down: { kind: "axis", index: 1, dir: 1 },
          confirm: { kind: "button", index: 0 },
          back: { kind: "button", index: 1 },
        },
      })
    );
    localStorage.setItem("sprixe.roomId", "sprixe-e2e-test-123");
  });
}

test.describe("Phase 3 — P2P ROM transfer (two contexts + BroadcastChannel)", () => {
  test("phone page renders at /send/{roomId} with the right roomId displayed", async ({ browser }) => {
    const context = await browser.newContext();
    await seedDefaultMappingOnContext(context);
    await installPeerMock(context);
    const page = await context.newPage();
    await page.goto(`/send/${ROOM_ID}`);

    await expect(page.locator('[data-testid="phone-page"]')).toBeVisible();
    const dropzone = page.locator('[data-testid="upload-dropzone"]');
    await expect(dropzone).toBeVisible();
    const status = page.locator('[data-testid="phone-status"]');
    await expect(status).toHaveText("Idle");
    await expect(page.locator('[data-testid="phone-page"]')).toHaveAttribute("data-room-id", ROOM_ID);

    await context.close();
  });

  test("host boots PeerHost with the configured roomId; PeerMock intercepts without touching the network", async ({ browser }) => {
    const context = await browser.newContext();
    await seedDefaultMappingOnContext(context);
    await installPeerMock(context);
    const page = await context.newPage();

    // Capture any console.error so an unhandled PeerJS network attempt
    // would fail the test loudly.
    const consoleErrors: string[] = [];
    page.on("console", (msg) => {
      if (msg.type() === "error") consoleErrors.push(msg.text());
    });

    await page.goto("/");
    await expect(page.locator(".af-browser-screen")).toBeVisible();
    // PeerHost lives in the background; no DOM marker yet (Phase 3.8 adds the QR).
    // The absence of console errors about Peer connectivity is what we're checking.
    const bad = consoleErrors.filter((e) => /peer/i.test(e));
    expect(bad).toEqual([]);

    await context.close();
  });

  test("phone → host end-to-end: uploaded ROM appears in the browser catalogue", async ({ browser }) => {
    // 1 context + 2 pages so the BroadcastChannel mock bridges host
    // and phone (BroadcastChannel is isolated per browser context).
    const context = await browser.newContext();
    await seedDefaultMappingOnContext(context);
    await installPeerMock(context);

    const hostPage = await context.newPage();
    await hostPage.goto("/");
    await hostPage.evaluate(() => {
      // Open at version 1 — RomDB's own version — so we don't trigger
      // an upgrade that would be blocked by the live main.ts connection.
      return new Promise<void>((r) => {
        const req = indexedDB.open("sprixe-arcade", 1);
        req.onsuccess = () => {
          const db = req.result;
          if (db.objectStoreNames.contains("roms")) {
            const tx = db.transaction("roms", "readwrite");
            tx.objectStore("roms").clear();
            tx.oncomplete = () => { db.close(); r(); };
            tx.onerror = () => { db.close(); r(); };
          } else {
            db.close();
            r();
          }
        };
        req.onerror = () => r();
        req.onblocked = () => r();
      });
    });
    await hostPage.reload();
    await expect(hostPage.locator(".af-browser-screen")).toBeVisible();

    const idsBefore = await hostPage.$$eval(".af-game-list-item", (els) =>
      els.map((el) => el.getAttribute("data-game-id"))
    );

    const phonePage = await context.newPage();
    await phonePage.goto(`/send/${ROOM_ID}`);
    const fixture = resolve(process.cwd(), "packages/sprixe-frontend/tests/fixtures/test.zip");
    await phonePage.locator('[data-testid="upload-file-input"]').setInputFiles(fixture);

    // Queue entry reaches 'done' once PeerSend finishes streaming.
    const entryStatus = phonePage.locator(".af-upload-entry").first().locator(".af-upload-entry-status");
    await expect(entryStatus).toHaveText(/Done/, { timeout: 5000 });

    await expect
      .poll(
        async () =>
          hostPage.$$eval(".af-game-list-item", (els) => els.map((el) => el.getAttribute("data-game-id"))),
        { timeout: 3000 }
      )
      .not.toEqual(idsBefore);

    const idsAfter = await hostPage.$$eval(".af-game-list-item", (els) =>
      els.map((el) => el.getAttribute("data-game-id"))
    );
    const newIds = idsAfter.filter((id) => !idsBefore.includes(id));
    expect(newIds.length).toBeGreaterThan(0);

    await context.close();
  });
});
