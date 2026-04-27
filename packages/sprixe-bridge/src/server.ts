/**
 * Bridge HTTP server — sits on localhost:7777, lets a Chromium kiosk
 * page launch native MAME without leaving the browser sandbox.
 *
 * Endpoints:
 *   GET  /health           — cheap probe so the frontend can detect
 *                            whether the bridge is reachable and decide
 *                            between native MAME and the embedded TS
 *                            engine.
 *   POST /launch           — body: ROM ZIP bytes (Content-Type:
 *                            application/octet-stream). Header
 *                            X-Game-Id selects the MAME set name.
 *                            Writes the ROM to disk, spawns MAME,
 *                            returns 202 immediately. Use /events for
 *                            the actual exit notification.
 *   POST /quit             — kill the running MAME (SIGTERM). 200
 *                            either way, no body.
 *   GET  /events           — Server-Sent Events stream. Pushes events
 *                            of shape { type, ... } as MAME starts /
 *                            exits / errors.
 *
 * SSE was picked over WebSocket so we don't need the `ws` dependency
 * — the bridge stays at zero runtime deps, which keeps the Pi image
 * surface as small as possible.
 */

import { createServer, type IncomingMessage, type Server, type ServerResponse } from "node:http";
import { mkdir, writeFile } from "node:fs/promises";
import { join, dirname } from "node:path";
import { homedir } from "node:os";
import { spawn } from "node:child_process";
import { MameProcess, type ExitReason } from "./mame.js";
import { InputInjector, type RemoteAction } from "./input.js";

export type SystemRunner = (cmd: string, args: readonly string[]) => Promise<void>;

const defaultSystemRunner: SystemRunner = (cmd, args) =>
  new Promise<void>((resolve, reject) => {
    const proc = spawn(cmd, [...args], { stdio: "ignore", detached: true });
    proc.on("error", reject);
    proc.on("exit", (code) =>
      code === 0 ? resolve() : reject(new Error(`${cmd} exited with code ${code}`))
    );
    // Detach so the bridge can return its HTTP response before the
    // shutdown actually severs the connection.
    proc.unref();
  });

export interface BridgeServerOptions {
  /** Listening port. Defaults to 7777. */
  port?: number;
  /** Where ROMs are written before MAME picks them up. */
  romDir?: string;
  /** Where to write MAME's default.cfg when /config is POSTed.
   * Defaults to ~/.mame/cfg/default.cfg of the bridge user. */
  mameCfgPath?: string;
  /** Inject a custom MameProcess for tests. */
  mame?: MameProcess;
  /** Inject a custom system command runner for tests (reboot/poweroff). */
  systemRunner?: SystemRunner;
  /** Inject a custom InputInjector so tests don't actually call ydotool. */
  input?: InputInjector;
}

export type BridgeEvent =
  | { type: "launched"; gameId: string }
  | { type: "exited"; gameId: string; code: number | null; signal: NodeJS.Signals | null }
  | { type: "error"; gameId: string; message: string };

const MAX_ROM_BYTES = 64 * 1024 * 1024; // 64 MiB — biggest CPS / Neo-Geo ZIPs sit well under this.

export class BridgeServer {
  readonly port: number;
  readonly romDir: string;
  readonly mameCfgPath: string;

  private readonly mame: MameProcess;
  private readonly systemRunner: SystemRunner;
  private readonly input: InputInjector;
  private readonly sseClients = new Set<ServerResponse>();
  private server: Server | null = null;
  private currentGameId: string | null = null;

  constructor(options: BridgeServerOptions = {}) {
    this.port = options.port ?? 7777;
    this.romDir = options.romDir ?? "/tmp/sprixe-roms";
    this.mameCfgPath = options.mameCfgPath ?? join(homedir(), ".mame", "cfg", "default.cfg");
    this.mame = options.mame ?? new MameProcess();
    this.systemRunner = options.systemRunner ?? defaultSystemRunner;
    this.input = options.input ?? new InputInjector();
    this.mame.onExit((reason) => this.handleMameExit(reason));
  }

  async start(): Promise<void> {
    await mkdir(this.romDir, { recursive: true });
    this.server = createServer((req, res) => this.handle(req, res));
    await new Promise<void>((resolve) => this.server!.listen(this.port, "127.0.0.1", resolve));
  }

  async stop(): Promise<void> {
    for (const client of this.sseClients) {
      try { client.end(); } catch { /* already closed */ }
    }
    this.sseClients.clear();
    this.mame.stop();
    if (this.server) {
      await new Promise<void>((resolve, reject) =>
        this.server!.close((err) => (err ? reject(err) : resolve()))
      );
      this.server = null;
    }
  }

  private async handle(req: IncomingMessage, res: ServerResponse): Promise<void> {
    // Browser running on the same host still sends an Origin — allow
    // it explicitly so the localhost fetch from the kiosk page works
    // without a CORS preflight surprise.
    res.setHeader("Access-Control-Allow-Origin", "*");
    res.setHeader("Access-Control-Allow-Methods", "GET, POST, OPTIONS");
    res.setHeader("Access-Control-Allow-Headers", "Content-Type, X-Game-Id");
    if (req.method === "OPTIONS") {
      res.writeHead(204).end();
      return;
    }

    const url = req.url ?? "/";
    if (req.method === "GET" && url === "/health") {
      this.sendJson(res, 200, { ok: true, running: this.mame.isRunning(), gameId: this.currentGameId });
      return;
    }
    if (req.method === "POST" && url === "/launch") {
      await this.handleLaunch(req, res);
      return;
    }
    if (req.method === "POST" && url === "/quit") {
      this.mame.stop();
      this.sendJson(res, 200, { ok: true });
      return;
    }
    if (req.method === "GET" && url === "/events") {
      this.attachSseClient(res);
      return;
    }
    if (req.method === "POST" && url === "/system/reboot") {
      await this.runSystem(res, ["sudo", "/usr/bin/systemctl", "reboot"]);
      return;
    }
    if (req.method === "POST" && url === "/system/poweroff") {
      await this.runSystem(res, ["sudo", "/usr/bin/systemctl", "poweroff"]);
      return;
    }
    if (req.method === "POST" && url === "/input") {
      await this.handleInput(req, res);
      return;
    }
    if (req.method === "POST" && url === "/config") {
      await this.handleConfig(req, res);
      return;
    }
    this.sendJson(res, 404, { error: "not found" });
  }

  private async handleConfig(req: IncomingMessage, res: ServerResponse): Promise<void> {
    let body: Buffer;
    try {
      body = await readBody(req, 256 * 1024); // 256 KiB is way more than any sane MAME cfg
    } catch (err) {
      this.sendJson(res, 413, { error: err instanceof Error ? err.message : "body read failed" });
      return;
    }
    if (body.byteLength === 0) {
      this.sendJson(res, 400, { error: "empty config body" });
      return;
    }
    try {
      await mkdir(dirname(this.mameCfgPath), { recursive: true });
      await writeFile(this.mameCfgPath, body);
      this.sendJson(res, 200, { ok: true, path: this.mameCfgPath });
    } catch (err) {
      this.sendJson(res, 500, { error: err instanceof Error ? err.message : String(err) });
    }
  }

  private async handleInput(req: IncomingMessage, res: ServerResponse): Promise<void> {
    let body: Buffer;
    try {
      body = await readBody(req, 1024);
    } catch (err) {
      this.sendJson(res, 400, { error: err instanceof Error ? err.message : "body read failed" });
      return;
    }
    let parsed: { action?: unknown };
    try {
      parsed = JSON.parse(body.toString("utf8")) as { action?: unknown };
    } catch {
      this.sendJson(res, 400, { error: "invalid JSON" });
      return;
    }
    const action = parsed.action;
    const valid: readonly RemoteAction[] = ["quit", "pause", "save", "load", "volume-up", "volume-down"];
    if (typeof action !== "string" || !valid.includes(action as RemoteAction)) {
      this.sendJson(res, 400, { error: `unknown action: ${String(action)}` });
      return;
    }
    try {
      await this.input.send(action as RemoteAction);
      this.sendJson(res, 200, { ok: true });
    } catch (err) {
      this.sendJson(res, 500, {
        error: err instanceof Error ? err.message : String(err),
      });
    }
  }

  private async runSystem(res: ServerResponse, argv: readonly string[]): Promise<void> {
    const [cmd, ...args] = argv;
    if (!cmd) {
      this.sendJson(res, 500, { error: "empty command" });
      return;
    }
    // Reply before launching: reboot/poweroff sever the connection
    // mid-flight, so the frontend would otherwise see a network error
    // even though the action succeeded.
    this.sendJson(res, 202, { ok: true });
    try {
      await this.systemRunner(cmd, args);
    } catch (err) {
      // Response already sent — log only.
      console.error(`[sprixe-bridge] ${argv.join(" ")} failed:`, err);
    }
  }

  private async handleLaunch(req: IncomingMessage, res: ServerResponse): Promise<void> {
    const gameId = req.headers["x-game-id"];
    if (typeof gameId !== "string" || !/^[a-z0-9_]+$/i.test(gameId)) {
      this.sendJson(res, 400, { error: "missing or invalid X-Game-Id header" });
      return;
    }
    if (this.mame.isRunning()) {
      this.sendJson(res, 409, { error: "MAME is already running", gameId: this.currentGameId });
      return;
    }

    let body: Buffer;
    try {
      body = await readBody(req, MAX_ROM_BYTES);
    } catch (err) {
      this.sendJson(res, 413, { error: err instanceof Error ? err.message : "body read failed" });
      return;
    }
    if (body.byteLength === 0) {
      this.sendJson(res, 400, { error: "empty ROM body" });
      return;
    }

    const romPath = join(this.romDir, `${gameId}.zip`);
    await writeFile(romPath, body);

    this.currentGameId = gameId;
    try {
      this.mame.start({ gameId, romPath: this.romDir });
    } catch (err) {
      this.currentGameId = null;
      this.sendJson(res, 500, { error: err instanceof Error ? err.message : String(err) });
      return;
    }

    this.broadcast({ type: "launched", gameId });
    this.sendJson(res, 202, { ok: true, gameId });
  }

  private attachSseClient(res: ServerResponse): void {
    res.writeHead(200, {
      "Content-Type": "text/event-stream",
      "Cache-Control": "no-cache",
      Connection: "keep-alive",
    });
    res.write(`: connected\n\n`);
    this.sseClients.add(res);
    res.once("close", () => { this.sseClients.delete(res); });
  }

  private broadcast(event: BridgeEvent): void {
    const payload = `data: ${JSON.stringify(event)}\n\n`;
    for (const client of this.sseClients) {
      try { client.write(payload); } catch { this.sseClients.delete(client); }
    }
  }

  private handleMameExit(reason: ExitReason): void {
    const gameId = this.currentGameId ?? "";
    this.currentGameId = null;
    if (reason.kind === "spawn-error") {
      this.broadcast({ type: "error", gameId, message: reason.error.message });
      return;
    }
    this.broadcast({
      type: "exited",
      gameId,
      code: reason.code,
      signal: reason.signal,
    });
  }

  private sendJson(res: ServerResponse, status: number, body: unknown): void {
    res.writeHead(status, { "Content-Type": "application/json" });
    res.end(JSON.stringify(body));
  }
}

function readBody(req: IncomingMessage, limit: number): Promise<Buffer> {
  return new Promise<Buffer>((resolve, reject) => {
    const chunks: Buffer[] = [];
    let received = 0;
    req.on("data", (chunk: Buffer) => {
      received += chunk.byteLength;
      if (received > limit) {
        req.destroy();
        reject(new Error(`payload too large (>${limit} bytes)`));
        return;
      }
      chunks.push(chunk);
    });
    req.on("end", () => resolve(Buffer.concat(chunks)));
    req.on("error", reject);
  });
}
