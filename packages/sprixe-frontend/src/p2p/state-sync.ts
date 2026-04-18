/**
 * StateSync — diff-broadcast of kiosk state to every connected phone
 * (§2.7 + Phase 3.9 tests).
 *
 * Phones need to know whether the kiosk is in the browser, playing,
 * or paused so the RemoteTab can enable/disable controls. Rather
 * than push the full state object on every tick, StateSync holds the
 * last-sent snapshot and broadcasts only the delta — fields whose
 * value differs from the previous state. Empty diffs produce zero
 * messages so the data channel stays quiet when nothing changes.
 */

import type { KioskToPhoneMessage } from "./protocol";

export type KioskScreen = "browser" | "playing" | "paused";

export interface KioskStateSnapshot {
  screen: KioskScreen;
  game?: string;
  title?: string;
  paused?: boolean;
  volume?: number;
}

export type Broadcaster = (message: KioskToPhoneMessage) => void;

export class StateSync {
  private state: KioskStateSnapshot = { screen: "browser" };
  private readonly broadcaster: Broadcaster;

  constructor(broadcaster: Broadcaster) {
    this.broadcaster = broadcaster;
  }

  /** Shallow-merge the patch and broadcast whichever fields changed. */
  setState(patch: Partial<KioskStateSnapshot>): void {
    const diff: Partial<KioskStateSnapshot> = {};
    let changed = false;

    const state = this.state as unknown as Record<string, unknown>;
    const diffBag = diff as unknown as Record<string, unknown>;
    const patchBag = patch as unknown as Record<string, unknown>;
    for (const k of Object.keys(patchBag)) {
      const nextVal = patchBag[k];
      if (nextVal === undefined) continue; // never broadcast explicit undefined
      if (state[k] !== nextVal) {
        diffBag[k] = nextVal;
        state[k] = nextVal;
        changed = true;
      }
    }

    if (!changed) return;
    this.broadcaster({ type: "state", payload: diff as Record<string, unknown> });
  }

  /** Broadcast the full current state — used on a new phone connection. */
  broadcastFullState(): void {
    const payload = { ...this.state } as unknown as Record<string, unknown>;
    this.broadcaster({ type: "state", payload });
  }

  getState(): Readonly<KioskStateSnapshot> {
    return this.state;
  }
}
