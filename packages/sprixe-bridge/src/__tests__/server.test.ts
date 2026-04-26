import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { BridgeServer } from "../server.js";
import { MameProcess, type SpawnedProcessLike, type Spawner } from "../mame.js";

class FakeProcess implements SpawnedProcessLike {
  pid = 4242;
  killed = false;
  private exitHandler: ((code: number | null, signal: NodeJS.Signals | null) => void) | null = null;
  on(event: "exit", cb: (code: number | null, signal: NodeJS.Signals | null) => void): void {
    if (event === "exit") this.exitHandler = cb;
  }
  kill(): boolean { this.killed = true; return true; }
  fireExit(code: number | null, signal: NodeJS.Signals | null = null): void {
    this.exitHandler?.(code, signal);
  }
}

interface Harness {
  server: BridgeServer;
  baseUrl: string;
  romDir: string;
  spawned: FakeProcess[];
}

async function makeHarness(): Promise<Harness> {
  const romDir = mkdtempSync(join(tmpdir(), "sprixe-bridge-test-"));
  const spawned: FakeProcess[] = [];
  const spawner: Spawner = () => {
    const p = new FakeProcess();
    spawned.push(p);
    return p;
  };
  const mame = new MameProcess({ spawner });
  // Port 0 = let the OS pick a free one so parallel tests don't collide.
  const server = new BridgeServer({ port: 0, romDir, mame });
  await server.start();
  // BridgeServer typed as fixed port; resolve actual via internals.
  const actualPort = (server as unknown as { server: { address: () => { port: number } } })
    .server.address().port;
  return { server, baseUrl: `http://127.0.0.1:${actualPort}`, romDir, spawned };
}

async function teardown(h: Harness): Promise<void> {
  await h.server.stop();
  rmSync(h.romDir, { recursive: true, force: true });
}

describe("BridgeServer", () => {
  let h: Harness;

  beforeEach(async () => { h = await makeHarness(); });
  afterEach(async () => { await teardown(h); });

  it("GET /health reports idle state", async () => {
    const res = await fetch(`${h.baseUrl}/health`);
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ ok: true, running: false, gameId: null });
  });

  it("POST /launch without X-Game-Id rejects with 400", async () => {
    const res = await fetch(`${h.baseUrl}/launch`, {
      method: "POST",
      body: new Uint8Array([0x50, 0x4B]), // "PK" — fake ZIP magic
    });
    expect(res.status).toBe(400);
  });

  it("POST /launch with empty body rejects with 400", async () => {
    const res = await fetch(`${h.baseUrl}/launch`, {
      method: "POST",
      headers: { "X-Game-Id": "sf2" },
    });
    expect(res.status).toBe(400);
  });

  it("POST /launch writes ROM and spawns MAME", async () => {
    const rom = new Uint8Array([0x50, 0x4B, 0x03, 0x04, 0xde, 0xad, 0xbe, 0xef]);
    const res = await fetch(`${h.baseUrl}/launch`, {
      method: "POST",
      headers: { "X-Game-Id": "sf2", "Content-Type": "application/octet-stream" },
      body: rom,
    });
    expect(res.status).toBe(202);
    expect(h.spawned).toHaveLength(1);

    const health = await (await fetch(`${h.baseUrl}/health`)).json() as { running: boolean; gameId: string };
    expect(health.running).toBe(true);
    expect(health.gameId).toBe("sf2");
  });

  it("POST /launch refuses concurrent launches with 409", async () => {
    const rom = new Uint8Array([0x50, 0x4B]);
    await fetch(`${h.baseUrl}/launch`, {
      method: "POST", headers: { "X-Game-Id": "sf2" }, body: rom,
    });
    const second = await fetch(`${h.baseUrl}/launch`, {
      method: "POST", headers: { "X-Game-Id": "kof97" }, body: rom,
    });
    expect(second.status).toBe(409);
  });

  it("POST /quit kills the running MAME", async () => {
    const rom = new Uint8Array([0x50, 0x4B]);
    await fetch(`${h.baseUrl}/launch`, {
      method: "POST", headers: { "X-Game-Id": "sf2" }, body: rom,
    });
    const res = await fetch(`${h.baseUrl}/quit`, { method: "POST" });
    expect(res.status).toBe(200);
    expect(h.spawned[0]!.killed).toBe(true);
  });

  it("GET /events streams 'exited' when MAME quits", async () => {
    const rom = new Uint8Array([0x50, 0x4B]);
    await fetch(`${h.baseUrl}/launch`, {
      method: "POST", headers: { "X-Game-Id": "sf2" }, body: rom,
    });

    const eventsRes = await fetch(`${h.baseUrl}/events`);
    expect(eventsRes.status).toBe(200);
    const reader = eventsRes.body!.getReader();
    const decoder = new TextDecoder();

    h.spawned[0]!.fireExit(0);

    let buffer = "";
    let received: string | null = null;
    // Pull a few chunks; SSE prefixes each event with "data: ".
    for (let i = 0; i < 5 && received === null; i++) {
      const { value, done } = await reader.read();
      if (done) break;
      buffer += decoder.decode(value);
      const dataLine = buffer.split("\n").find((l) => l.startsWith("data:"));
      if (dataLine) received = dataLine.slice("data:".length).trim();
    }
    void reader.cancel();

    expect(received).not.toBeNull();
    const parsed = JSON.parse(received!) as { type: string; gameId: string; code: number };
    expect(parsed.type).toBe("exited");
    expect(parsed.gameId).toBe("sf2");
    expect(parsed.code).toBe(0);
  });

  it("rejects unknown routes with 404", async () => {
    const res = await fetch(`${h.baseUrl}/whatever`);
    expect(res.status).toBe(404);
  });

  it("CORS preflight returns 204", async () => {
    const res = await fetch(`${h.baseUrl}/launch`, { method: "OPTIONS" });
    expect(res.status).toBe(204);
  });
});
