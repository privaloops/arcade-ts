/**
 * SaveStateController — glue between the playing screen, SaveStateDB,
 * and the toast UI. Owns the F5/F8 keyboard handlers and exposes
 * save() / load() so PauseOverlay menu items can hit the same flow.
 *
 * MVP writes only to slot 0 (§2.6 allows 4 slots, slot picker UI
 * arrives with Phase 5 alongside the real engine integration). The
 * controller is one-shot: spawn it on game launch, dispose it on
 * quit to menu. Listeners live on `window` so F5/F8 work whether
 * focus is on the canvas, the pause overlay, or a toast.
 */

import type { EmulatorHandle } from "../screens/pause/pause-overlay";
import type { SaveStateDB } from "./save-state-db";
import type { Toast } from "../ui/toast";

const DEFAULT_SLOT = 0;

export interface SaveStateControllerOptions {
  emulator: EmulatorHandle;
  db: SaveStateDB;
  gameId: string;
  toast: Toast;
  /** Override the slot for tests. Defaults to 0. */
  slot?: number;
  /** When true, don't attach keyboard listeners — tests drive save/load
   * directly. */
  skipKeyBindings?: boolean;
}

export class SaveStateController {
  private readonly emulator: EmulatorHandle;
  private readonly db: SaveStateDB;
  private readonly gameId: string;
  private readonly toast: Toast;
  private readonly slot: number;
  private readonly keydownHandler: ((e: KeyboardEvent) => void) | null;

  constructor(options: SaveStateControllerOptions) {
    this.emulator = options.emulator;
    this.db = options.db;
    this.gameId = options.gameId;
    this.toast = options.toast;
    this.slot = options.slot ?? DEFAULT_SLOT;

    if (options.skipKeyBindings) {
      this.keydownHandler = null;
    } else {
      this.keydownHandler = (e: KeyboardEvent) => {
        if (e.key === "F5") {
          e.preventDefault();
          void this.save();
        } else if (e.key === "F8") {
          e.preventDefault();
          void this.load();
        }
      };
      window.addEventListener("keydown", this.keydownHandler);
    }
  }

  async save(slotOverride?: number): Promise<void> {
    if (!this.emulator.saveState) {
      this.toast.show("info", "Save state unavailable");
      return;
    }
    const slot = slotOverride ?? this.slot;
    try {
      const buf = await this.emulator.saveState();
      if (!buf) {
        this.toast.show("info", "Nothing to save yet");
        return;
      }
      await this.db.save(this.gameId, slot, buf);
      this.toast.show("success", `Saved slot ${slot + 1}`);
    } catch (e) {
      this.toast.show("error", `Save failed: ${describe(e)}`);
    }
  }

  async load(slotOverride?: number): Promise<void> {
    if (!this.emulator.loadState) {
      this.toast.show("info", "Load state unavailable");
      return;
    }
    const slot = slotOverride ?? this.slot;
    try {
      const rec = await this.db.load(this.gameId, slot);
      if (!rec) {
        this.toast.show("info", `Slot ${slot + 1} empty`);
        return;
      }
      const ok = this.emulator.loadState(rec.data);
      if (ok) this.toast.show("success", `Loaded slot ${slot + 1}`);
      else this.toast.show("error", "Load failed");
    } catch (e) {
      this.toast.show("error", `Load failed: ${describe(e)}`);
    }
  }

  dispose(): void {
    if (this.keydownHandler) {
      window.removeEventListener("keydown", this.keydownHandler);
    }
  }
}

function describe(e: unknown): string {
  if (e instanceof Error) return e.message;
  return "unknown error";
}
