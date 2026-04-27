import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { BridgeServer, type SystemRunner } from "../server.js";
import { MameProcess, type SpawnedProcessLike, type Spawner } from "../mame.js";
import { InputInjector, type Runner as InputRunner } from "../input.js";

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
  mameCfgPath: string;
  spawned: FakeProcess[];
  systemCalls: { cmd: string; args: string[] }[];
  inputCalls: { cmd: string; args: string[] }[];
}

async function makeHarness(): Promise<Harness> {
  const romDir = mkdtempSync(join(tmpdir(), "sprixe-bridge-test-"));
  const spawned: FakeProcess[] = [];
  const spawner: Spawner = () => {
    const p = new FakeProcess();
    spawned.push(p);
    return p;
  };
  const systemCalls: { cmd: string; args: string[] }[] = [];
  const systemRunner: SystemRunner = async (cmd, args) => {
    systemCalls.push({ cmd, args: [...args] });
  };
  const inputCalls: { cmd: string; args: string[] }[] = [];
  const inputRunner: InputRunner = async (cmd, args) => {
    inputCalls.push({ cmd, args: [...args] });
  };
  const mame = new MameProcess({ spawner });
  // Port 0 = let the OS pick a free one so parallel tests don't collide.
  const mameCfgPath = join(romDir, "mame", "cfg", "default.cfg");
  const server = new BridgeServer({
    port: 0,
    romDir,
    mameCfgPath,
    mame,
    systemRunner,
    input: new InputInjector({ runner: inputRunner }),
  });
  await server.start();
  // BridgeServer typed as fixed port; resolve actual via internals.
  const actualPort = (server as unknown as { server: { address: () => { port: number } } })
    .server.address().port;
  return {
    server,
    baseUrl: `http://127.0.0.1:${actualPort}`,
    romDir,
    mameCfgPath,
    spawned,
    systemCalls,
    inputCalls,
  };
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

  it("POST /system/reboot invokes the system runner with sudo systemctl", async () => {
    const res = await fetch(`${h.baseUrl}/system/reboot`, { method: "POST" });
    expect(res.status).toBe(202);
    // Runner is async-fire-and-forget; the next microtask resolves it.
    await new Promise((r) => setTimeout(r, 10));
    expect(h.systemCalls).toHaveLength(1);
    expect(h.systemCalls[0]).toEqual({
      cmd: "sudo",
      args: ["/usr/bin/systemctl", "reboot"],
    });
  });

  it("POST /system/poweroff invokes the system runner with sudo systemctl", async () => {
    const res = await fetch(`${h.baseUrl}/system/poweroff`, { method: "POST" });
    expect(res.status).toBe(202);
    await new Promise((r) => setTimeout(r, 10));
    expect(h.systemCalls).toHaveLength(1);
    expect(h.systemCalls[0]).toEqual({
      cmd: "sudo",
      args: ["/usr/bin/systemctl", "poweroff"],
    });
  });

  it("POST /input quit forwards an ESC press to ydotool", async () => {
    const res = await fetch(`${h.baseUrl}/input`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action: "quit" }),
    });
    expect(res.status).toBe(200);
    expect(h.inputCalls[0]!.args).toEqual(["key", "1:1", "1:0"]);
  });

  it("POST /input rejects unknown actions with 400", async () => {
    const res = await fetch(`${h.baseUrl}/input`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action: "self-destruct" }),
    });
    expect(res.status).toBe(400);
    expect(h.inputCalls).toHaveLength(0);
  });

  it("POST /input rejects malformed JSON with 400", async () => {
    const res = await fetch(`${h.baseUrl}/input`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: "not json",
    });
    expect(res.status).toBe(400);
  });

  it("POST /config writes the body to the configured cfg path", async () => {
    const xml = '<?xml version="1.0"?><mameconfig version="10"></mameconfig>\n';
    const res = await fetch(`${h.baseUrl}/config`, {
      method: "POST",
      headers: { "Content-Type": "application/xml" },
      body: xml,
    });
    expect(res.status).toBe(200);
    const written = await import("node:fs/promises").then((m) =>
      m.readFile(h.mameCfgPath, "utf8")
    );
    expect(written).toBe(xml);
  });

  it("POST /config rejects an empty body with 400", async () => {
    const res = await fetch(`${h.baseUrl}/config`, { method: "POST" });
    expect(res.status).toBe(400);
  });
});
