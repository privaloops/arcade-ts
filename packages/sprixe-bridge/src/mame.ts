/**
 * MameProcess — owns the lifecycle of a single running MAME instance.
 *
 * Wraps child_process.spawn behind a small interface so tests can pass
 * a fake spawner without ever touching a real MAME binary. Only one
 * MAME may run at a time per bridge — start() while another is alive
 * throws, callers should stop() first.
 */

import { spawn, type ChildProcess } from "node:child_process";

export interface SpawnedProcessLike {
  pid?: number | undefined;
  on(event: "exit", cb: (code: number | null, signal: NodeJS.Signals | null) => void): void;
  on(event: "error", cb: (err: Error) => void): void;
  kill(signal?: NodeJS.Signals): boolean;
}

export type Spawner = (cmd: string, args: readonly string[]) => SpawnedProcessLike;

export type ExitReason =
  | { kind: "exit"; code: number | null; signal: NodeJS.Signals | null }
  | { kind: "spawn-error"; error: Error };

export type ExitListener = (reason: ExitReason) => void;

export interface MameProcessOptions {
  /** Path to the MAME binary. Defaults to "mame" (resolved via PATH). */
  bin?: string;
  /** Override for tests — defaults to node's child_process.spawn. */
  spawner?: Spawner;
}

export interface LaunchOptions {
  /** ROM set name handed to MAME's command line (e.g. "sf2"). */
  gameId: string;
  /** Directory MAME should look in for the ROM ZIP. */
  romPath: string;
  /** Optional extra MAME flags appended after the standard ones. */
  extraArgs?: readonly string[];
}

const defaultSpawner: Spawner = (cmd, args) =>
  spawn(cmd, [...args], { stdio: "inherit" }) as ChildProcess;

export class MameProcess {
  private readonly bin: string;
  private readonly spawner: Spawner;
  private current: SpawnedProcessLike | null = null;
  private readonly exitListeners = new Set<ExitListener>();

  constructor(options: MameProcessOptions = {}) {
    this.bin = options.bin ?? "mame";
    this.spawner = options.spawner ?? defaultSpawner;
  }

  /**
   * Spawn MAME for the requested game. Throws if a previous instance
   * is still alive — callers should stop() and wait for the exit
   * callback before relaunching.
   */
  start(opts: LaunchOptions): void {
    if (this.current) {
      throw new Error("MAME is already running — stop() before starting another instance");
    }
    const args = [
      opts.gameId,
      "-rompath", opts.romPath,
      "-skip_gameinfo",
      "-nofilter",
      ...(opts.extraArgs ?? []),
    ];
    let proc: SpawnedProcessLike;
    try {
      proc = this.spawner(this.bin, args);
    } catch (err) {
      const reason: ExitReason = {
        kind: "spawn-error",
        error: err instanceof Error ? err : new Error(String(err)),
      };
      this.notifyExit(reason);
      return;
    }
    this.current = proc;
    // ENOENT (binary missing) is delivered as an 'error' event, not a
    // synchronous throw — without a listener, Node escalates it to an
    // unhandled exception and the whole bridge dies. Treat it the same
    // way as a synchronous spawn failure: clear state, fire spawn-error.
    let settled = false;
    proc.on("error", (err) => {
      if (settled) return;
      settled = true;
      this.current = null;
      this.notifyExit({ kind: "spawn-error", error: err });
    });
    proc.on("exit", (code, signal) => {
      if (settled) return;
      settled = true;
      this.current = null;
      this.notifyExit({ kind: "exit", code, signal });
    });
  }

  /**
   * Send SIGTERM to the running MAME if any. The exit listener will
   * fire once MAME actually exits (asynchronous). No-op when nothing
   * is running.
   */
  stop(): void {
    if (!this.current) return;
    try {
      this.current.kill("SIGTERM");
    } catch { /* race with exit — ignore */ }
  }

  isRunning(): boolean {
    return this.current !== null;
  }

  onExit(cb: ExitListener): () => void {
    this.exitListeners.add(cb);
    return () => { this.exitListeners.delete(cb); };
  }

  private notifyExit(reason: ExitReason): void {
    for (const cb of this.exitListeners) {
      try { cb(reason); } catch { /* listener errors must not crash the bridge */ }
    }
  }
}
