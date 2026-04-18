import { describe, it, expect, beforeEach, vi } from "vitest";
import { RemoteTab, type Command } from "./remote-tab";

describe("RemoteTab", () => {
  let container: HTMLDivElement;
  let commands: Command[];
  let tab: RemoteTab;

  beforeEach(() => {
    document.body.innerHTML = "";
    container = document.createElement("div");
    document.body.appendChild(container);
    commands = [];
    tab = new RemoteTab(container, {
      onCommand: (c) => commands.push(c),
      volumeDebounceMs: 5,
    });
  });

  describe("action → command mapping", () => {
    it("pause button emits { action: 'pause' }", () => {
      tab.setKioskState("playing");
      container.querySelector<HTMLButtonElement>('[data-testid="remote-pause"]')!.click();
      expect(commands).toEqual([{ type: "cmd", action: "pause" }]);
    });

    it("resume button emits { action: 'resume' }", () => {
      tab.setKioskState("paused");
      container.querySelector<HTMLButtonElement>('[data-testid="remote-resume"]')!.click();
      expect(commands).toEqual([{ type: "cmd", action: "resume" }]);
    });

    it("save button emits { action: 'save', payload: {slot} }", () => {
      tab.setKioskState("playing");
      container.querySelector<HTMLButtonElement>('[data-testid="remote-slot-2"]')!.click();
      container.querySelector<HTMLButtonElement>('[data-testid="remote-save"]')!.click();
      expect(commands).toEqual([{ type: "cmd", action: "save", payload: { slot: 2 } }]);
    });

    it("load button emits { action: 'load', payload: {slot} }", () => {
      tab.setKioskState("paused");
      container.querySelector<HTMLButtonElement>('[data-testid="remote-slot-1"]')!.click();
      container.querySelector<HTMLButtonElement>('[data-testid="remote-load"]')!.click();
      expect(commands).toEqual([{ type: "cmd", action: "load", payload: { slot: 1 } }]);
    });

    it("quit button emits { action: 'quit' }", () => {
      tab.setKioskState("playing");
      container.querySelector<HTMLButtonElement>('[data-testid="remote-quit"]')!.click();
      expect(commands).toEqual([{ type: "cmd", action: "quit" }]);
    });
  });

  describe("disabled states by kiosk state", () => {
    it("'browser' state disables save/load/quit and both pause/resume", () => {
      tab.setKioskState("browser");
      const save = container.querySelector<HTMLButtonElement>('[data-testid="remote-save"]')!;
      const load = container.querySelector<HTMLButtonElement>('[data-testid="remote-load"]')!;
      const quit = container.querySelector<HTMLButtonElement>('[data-testid="remote-quit"]')!;
      const pause = container.querySelector<HTMLButtonElement>('[data-testid="remote-pause"]')!;
      const resume = container.querySelector<HTMLButtonElement>('[data-testid="remote-resume"]')!;

      expect(save.disabled).toBe(true);
      expect(load.disabled).toBe(true);
      expect(quit.disabled).toBe(true);
      expect(pause.disabled).toBe(true);
      expect(resume.disabled).toBe(true);
    });

    it("'playing' enables save/load/quit/pause but not resume", () => {
      tab.setKioskState("playing");
      expect(container.querySelector<HTMLButtonElement>('[data-testid="remote-save"]')!.disabled).toBe(false);
      expect(container.querySelector<HTMLButtonElement>('[data-testid="remote-pause"]')!.disabled).toBe(false);
      expect(container.querySelector<HTMLButtonElement>('[data-testid="remote-resume"]')!.disabled).toBe(true);
    });

    it("'paused' enables resume, save, load, quit; disables pause", () => {
      tab.setKioskState("paused");
      expect(container.querySelector<HTMLButtonElement>('[data-testid="remote-resume"]')!.disabled).toBe(false);
      expect(container.querySelector<HTMLButtonElement>('[data-testid="remote-pause"]')!.disabled).toBe(true);
      expect(container.querySelector<HTMLButtonElement>('[data-testid="remote-save"]')!.disabled).toBe(false);
    });

    it("the state readout reflects the current kiosk state", () => {
      const readout = container.querySelector<HTMLElement>('[data-testid="remote-state"]')!;
      tab.setKioskState("browser");
      expect(readout.dataset.state).toBe("browser");
      tab.setKioskState("playing");
      expect(readout.dataset.state).toBe("playing");
    });
  });

  describe("volume slider", () => {
    it("input events debounce emits to one 'volume' command at the end of the drag", async () => {
      const slider = container.querySelector<HTMLInputElement>('[data-testid="remote-volume"]')!;

      // Simulate a drag: multiple input events in rapid succession.
      for (const v of ["10", "25", "40", "55"]) {
        slider.value = v;
        slider.dispatchEvent(new Event("input", { bubbles: true }));
      }

      // Wait past the debounce window (5 ms configured + a 20 ms margin).
      await new Promise((r) => setTimeout(r, 25));

      const volumeCmds = commands.filter((c) => c.action === "volume");
      expect(volumeCmds).toHaveLength(1);
      expect(volumeCmds[0]!).toEqual({ type: "cmd", action: "volume", payload: { level: 55 } });
    });

    it("slider readout reflects the draft value during the drag even before the debounce fires", () => {
      const slider = container.querySelector<HTMLInputElement>('[data-testid="remote-volume"]')!;
      slider.value = "33";
      slider.dispatchEvent(new Event("input", { bubbles: true }));
      const readout = container.querySelector<HTMLElement>('[data-testid="remote-volume-readout"]')!;
      expect(readout.textContent).toBe("33");
    });

    it("flushVolume() emits the pending value without waiting for the timer", () => {
      const slider = container.querySelector<HTMLInputElement>('[data-testid="remote-volume"]')!;
      slider.value = "77";
      slider.dispatchEvent(new Event("input", { bubbles: true }));

      tab.flushVolume();

      const last = commands[commands.length - 1];
      expect(last).toEqual({ type: "cmd", action: "volume", payload: { level: 77 } });
    });

    it("setVolume() updates the slider + readout without emitting", () => {
      tab.setVolume(42);
      const slider = container.querySelector<HTMLInputElement>('[data-testid="remote-volume"]')!;
      expect(slider.value).toBe("42");
      const readout = container.querySelector<HTMLElement>('[data-testid="remote-volume-readout"]')!;
      expect(readout.textContent).toBe("42");
      expect(commands.filter((c) => c.action === "volume")).toHaveLength(0);
    });
  });

  describe("save slot picker", () => {
    it("clicking a slot updates selectedSlot", () => {
      tab.setKioskState("playing");
      container.querySelector<HTMLButtonElement>('[data-testid="remote-slot-3"]')!.click();
      expect(tab.getSelectedSlot()).toBe(3);
      // And the selected class rides with it.
      const selectedEl = container.querySelector<HTMLElement>(".af-remote-slot.selected")!;
      expect(selectedEl.dataset.slot).toBe("3");
    });

    it("setSaveSlots() marks populated vs empty slots", () => {
      tab.setSaveSlots([
        { slot: 0, ts: 1713020400 },
        { slot: 2, ts: 1713020800 },
      ]);
      const btn0 = container.querySelector<HTMLElement>('[data-testid="remote-slot-0"]')!;
      const btn1 = container.querySelector<HTMLElement>('[data-testid="remote-slot-1"]')!;
      const btn2 = container.querySelector<HTMLElement>('[data-testid="remote-slot-2"]')!;
      expect(btn0.dataset.populated).toBe("true");
      expect(btn1.dataset.populated).toBe("false");
      expect(btn2.dataset.populated).toBe("true");
    });
  });

  describe("initial state", () => {
    it("defaults to kiosk=browser, slot 0, volume 80", () => {
      expect(tab.getKioskState()).toBe("browser");
      expect(tab.getSelectedSlot()).toBe(0);
      const slider = container.querySelector<HTMLInputElement>('[data-testid="remote-volume"]')!;
      expect(slider.value).toBe("80");
    });
  });
});
