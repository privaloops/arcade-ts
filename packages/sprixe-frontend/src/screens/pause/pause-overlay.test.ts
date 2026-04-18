import { describe, it, expect, beforeEach, vi } from "vitest";
import { PauseOverlay, type EmulatorHandle } from "./pause-overlay";

function makeEmulator(): EmulatorHandle & { paused: boolean; pause: () => void; resume: () => void } {
  return {
    paused: false,
    pause() { this.paused = true; },
    resume() { this.paused = false; },
    isPaused() { return this.paused; },
  };
}

describe("PauseOverlay", () => {
  let container: HTMLDivElement;

  beforeEach(() => {
    document.body.innerHTML = "";
    container = document.createElement("div");
    document.body.appendChild(container);
  });

  describe("open/close", () => {
    it("open() pauses the emulator and shows the overlay", () => {
      const emu = makeEmulator();
      const overlay = new PauseOverlay(container, { emulator: emu });
      expect(emu.paused).toBe(false);

      overlay.open();

      expect(emu.paused).toBe(true);
      expect(overlay.isOpen()).toBe(true);
      expect(overlay.root.hidden).toBe(false);
    });

    it("close() resumes the emulator and hides the overlay", () => {
      const emu = makeEmulator();
      const overlay = new PauseOverlay(container, { emulator: emu });
      overlay.open();
      overlay.close();

      expect(emu.paused).toBe(false);
      expect(overlay.isOpen()).toBe(false);
      expect(overlay.root.hidden).toBe(true);
    });

    it("open is idempotent — does not re-pause a paused emulator", () => {
      const emu = makeEmulator();
      const pauseSpy = vi.spyOn(emu, "pause");
      const overlay = new PauseOverlay(container, { emulator: emu });

      overlay.open();
      overlay.open();

      expect(pauseSpy).toHaveBeenCalledTimes(1);
    });

    it("close before open is a no-op (no spurious resume)", () => {
      const emu = makeEmulator();
      const resumeSpy = vi.spyOn(emu, "resume");
      const overlay = new PauseOverlay(container, { emulator: emu });
      overlay.close();
      expect(resumeSpy).not.toHaveBeenCalled();
    });

    it("resets the selection to the first item when opened", () => {
      const emu = makeEmulator();
      const overlay = new PauseOverlay(container, { emulator: emu });
      overlay.open();
      overlay.handleNavAction("down"); // move selection
      expect(overlay.getSelectedAction()).toBe("save-state");
      overlay.close();
      overlay.open();
      expect(overlay.getSelectedAction()).toBe("resume");
    });
  });

  describe("keyboard shortcuts", () => {
    it("Escape closes the overlay via Resume", () => {
      const emu = makeEmulator();
      const onResume = vi.fn();
      const overlay = new PauseOverlay(container, { emulator: emu, onResume });
      overlay.open();

      window.dispatchEvent(new KeyboardEvent("keydown", { key: "Escape" }));

      expect(overlay.isOpen()).toBe(false);
      expect(emu.paused).toBe(false);
      expect(onResume).toHaveBeenCalledTimes(1);
    });

    it("Escape only fires while the overlay is open", () => {
      const emu = makeEmulator();
      const onResume = vi.fn();
      const overlay = new PauseOverlay(container, { emulator: emu, onResume });

      window.dispatchEvent(new KeyboardEvent("keydown", { key: "Escape" }));

      expect(overlay.isOpen()).toBe(false);
      expect(onResume).not.toHaveBeenCalled();
    });

    it("Tab cycles selection forward (focus trap)", () => {
      const emu = makeEmulator();
      const overlay = new PauseOverlay(container, { emulator: emu });
      overlay.open();
      expect(overlay.getSelectedAction()).toBe("resume");

      window.dispatchEvent(new KeyboardEvent("keydown", { key: "Tab" }));
      expect(overlay.getSelectedAction()).toBe("save-state");

      window.dispatchEvent(new KeyboardEvent("keydown", { key: "Tab" }));
      expect(overlay.getSelectedAction()).toBe("load-state");
    });

    it("Shift+Tab cycles selection backward (focus trap)", () => {
      const emu = makeEmulator();
      const overlay = new PauseOverlay(container, { emulator: emu });
      overlay.open();

      window.dispatchEvent(new KeyboardEvent("keydown", { key: "Tab", shiftKey: true }));
      expect(overlay.getSelectedAction()).toBe("quit"); // wraps to last
    });
  });

  describe("NavAction routing", () => {
    it("up/down change the selected action with wrap-around", () => {
      const emu = makeEmulator();
      const overlay = new PauseOverlay(container, { emulator: emu });
      overlay.open();

      overlay.handleNavAction("down");
      expect(overlay.getSelectedAction()).toBe("save-state");
      overlay.handleNavAction("up");
      expect(overlay.getSelectedAction()).toBe("resume");
      overlay.handleNavAction("up"); // wrap
      expect(overlay.getSelectedAction()).toBe("quit");
    });

    it("confirm activates the selected action", () => {
      const emu = makeEmulator();
      const onQuit = vi.fn();
      const overlay = new PauseOverlay(container, { emulator: emu, onQuit });
      overlay.open();
      overlay.handleNavAction("up"); // → quit
      overlay.handleNavAction("confirm");

      expect(onQuit).toHaveBeenCalledTimes(1);
      expect(overlay.isOpen()).toBe(false);
    });

    it("confirm on Resume closes the overlay", () => {
      const emu = makeEmulator();
      const onResume = vi.fn();
      const overlay = new PauseOverlay(container, { emulator: emu, onResume });
      overlay.open();
      overlay.handleNavAction("confirm");

      expect(overlay.isOpen()).toBe(false);
      expect(onResume).toHaveBeenCalledTimes(1);
    });

    it("coin-hold on an open overlay dismisses it (player used the same gesture to open and close)", () => {
      const emu = makeEmulator();
      const onResume = vi.fn();
      const overlay = new PauseOverlay(container, { emulator: emu, onResume });
      overlay.open();
      overlay.handleNavAction("coin-hold");
      expect(overlay.isOpen()).toBe(false);
      expect(onResume).toHaveBeenCalledTimes(1);
    });

    it("back dismisses the overlay", () => {
      const emu = makeEmulator();
      const overlay = new PauseOverlay(container, { emulator: emu });
      overlay.open();
      overlay.handleNavAction("back");
      expect(overlay.isOpen()).toBe(false);
    });

    it("returns false when overlay is closed — lets upstream router handle the action", () => {
      const emu = makeEmulator();
      const overlay = new PauseOverlay(container, { emulator: emu });
      expect(overlay.handleNavAction("confirm")).toBe(false);
      expect(overlay.handleNavAction("up")).toBe(false);
    });
  });

  describe("action callbacks", () => {
    it("save-state fires onSaveState without closing the overlay", () => {
      const emu = makeEmulator();
      const onSave = vi.fn();
      const overlay = new PauseOverlay(container, { emulator: emu, onSaveState: onSave });
      overlay.open();
      overlay.handleNavAction("down"); // save-state
      overlay.handleNavAction("confirm");
      expect(onSave).toHaveBeenCalledTimes(1);
      expect(overlay.isOpen()).toBe(true);
    });

    it("load-state fires onLoadState without closing", () => {
      const emu = makeEmulator();
      const onLoad = vi.fn();
      const overlay = new PauseOverlay(container, { emulator: emu, onLoadState: onLoad });
      overlay.open();
      overlay.handleNavAction("down");
      overlay.handleNavAction("down"); // load-state
      overlay.handleNavAction("confirm");
      expect(onLoad).toHaveBeenCalledTimes(1);
      expect(overlay.isOpen()).toBe(true);
    });
  });

  describe("DOM output", () => {
    it("renders role=dialog + aria-modal + aria-label", () => {
      const emu = makeEmulator();
      const overlay = new PauseOverlay(container, { emulator: emu });
      expect(overlay.root.getAttribute("role")).toBe("dialog");
      expect(overlay.root.getAttribute("aria-modal")).toBe("true");
      expect(overlay.root.getAttribute("aria-label")).toBe("Paused");
    });

    it("renders one menu item per action", () => {
      const emu = makeEmulator();
      const overlay = new PauseOverlay(container, { emulator: emu });
      const items = container.querySelectorAll(".af-pause-item");
      expect(items.length).toBe(4);
    });

    it("selection class toggles on the active entry", () => {
      const emu = makeEmulator();
      const overlay = new PauseOverlay(container, { emulator: emu });
      overlay.open();
      overlay.handleNavAction("down");
      const selected = container.querySelector<HTMLElement>(".af-pause-item.selected")!;
      expect(selected.dataset.action).toBe("save-state");
    });
  });
});
