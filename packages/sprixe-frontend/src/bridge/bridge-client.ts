/**
 * BridgeClient — talks to the local @sprixe/bridge daemon when the
 * frontend runs on a Pi (or any host with the bridge installed).
 *
 * The frontend probes /health at boot. If the bridge answers, ROM
 * launches are POSTed to /launch and a SSE stream surfaces MAME's
 * exit so the browser UI can come back to the foreground. If the
 * probe fails the frontend keeps using its embedded TS engine — same
 * code path on web builds, no separate bundle.
 */
const DEFAULT_BASE_URL = "http://127.0.0.1:7777";
const DEFAULT_PROBE_TIMEOUT_MS = 200;

export interface BridgeClientOptions {
  baseUrl?: string;
}

export type BridgeEvent =
  | { type: "launched"; gameId: string }
  | { type: "exited"; gameId: string; code: number | null; signal: string | null }
  | { type: "error"; gameId: string; message: string };

export interface BridgeSubscription {
  close(): void;
}

export class BridgeClient {
  private readonly baseUrl: string;

  constructor(options: BridgeClientOptions = {}) {
    this.baseUrl = options.baseUrl ?? DEFAULT_BASE_URL;
  }

  /**
   * Quick liveness probe. Returns false on any failure (network
   * refused, timeout, non-2xx) so the caller can branch into the
   * fallback path without try/catch noise.
   */
  async probe(timeoutMs: number = DEFAULT_PROBE_TIMEOUT_MS): Promise<boolean> {
    try {
      const ctrl = new AbortController();
      const timer = setTimeout(() => ctrl.abort(), timeoutMs);
      const res = await fetch(`${this.baseUrl}/health`, { signal: ctrl.signal });
      clearTimeout(timer);
      return res.ok;
    } catch {
      return false;
    }
  }

  /**
   * Hand the ROM bytes to the bridge and ask it to spawn MAME. The
   * promise resolves once MAME has been spawned (HTTP 202), not when
   * the user quits — subscribe() owns the exit notification.
   */
  async launch(gameId: string, romData: ArrayBuffer): Promise<void> {
    const res = await fetch(`${this.baseUrl}/launch`, {
      method: "POST",
      headers: {
        "Content-Type": "application/octet-stream",
        "X-Game-Id": gameId,
      },
      body: romData,
    });
    if (!res.ok) {
      const body = await res.text().catch(() => "");
      throw new Error(`bridge /launch failed: ${res.status}${body ? ` — ${body}` : ""}`);
    }
  }

  /** Ask the bridge to SIGTERM the running MAME (no-op if nothing runs). */
  async quit(): Promise<void> {
    try {
      await fetch(`${this.baseUrl}/quit`, { method: "POST" });
    } catch {
      // The bridge may have died with MAME — let the SSE subscription
      // surface the failure if it matters.
    }
  }

  /** Ask the bridge to reboot the host (Pi). The HTTP response comes
   * back before the system actually shuts down, so the caller can
   * surface a "Rebooting..." toast before connectivity disappears. */
  async reboot(): Promise<void> {
    const res = await fetch(`${this.baseUrl}/system/reboot`, { method: "POST" });
    if (!res.ok) throw new Error(`bridge /system/reboot failed: ${res.status}`);
  }

  /** Same as reboot() but powers the host off. */
  async poweroff(): Promise<void> {
    const res = await fetch(`${this.baseUrl}/system/poweroff`, { method: "POST" });
    if (!res.ok) throw new Error(`bridge /system/poweroff failed: ${res.status}`);
  }

  /**
   * Synthesize a keystroke that MAME picks up via uinput. Used to
   * proxy phone-remote commands (pause/save/load/quit/volume) into
   * the running emulator while Chromium sits in the background.
   */
  async sendInput(action: BridgeRemoteAction): Promise<void> {
    const res = await fetch(`${this.baseUrl}/input`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action }),
    });
    if (!res.ok) throw new Error(`bridge /input failed: ${res.status}`);
  }

  /**
   * Subscribe to MAME lifecycle events via SSE. Returns a handle the
   * caller closes when it stops caring (e.g. on shutdown). EventSource
   * auto-reconnects on transient drops, which is what we want when
   * the bridge restarts.
   */
  subscribe(handler: (event: BridgeEvent) => void): BridgeSubscription {
    const es = new EventSource(`${this.baseUrl}/events`);
    es.onmessage = (e) => {
      try {
        const parsed = JSON.parse(e.data) as BridgeEvent;
        handler(parsed);
      } catch {
        // Bridge guarantees JSON; malformed payloads mean the channel
        // is wedged — drop them silently.
      }
    };
    return { close: () => es.close() };
  }
}

export type BridgeRemoteAction =
  | "quit"
  | "pause"
  | "save"
  | "load"
  | "volume-up"
  | "volume-down";
