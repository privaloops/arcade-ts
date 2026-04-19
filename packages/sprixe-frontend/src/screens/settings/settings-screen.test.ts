import { describe, it, expect, beforeEach, vi } from "vitest";
import { SettingsScreen } from "./settings-screen";
import { SettingsStore } from "./settings-store";

describe("SettingsScreen", () => {
  let container: HTMLDivElement;
  let settings: SettingsStore;
  let onClose: ReturnType<typeof vi.fn>;
  let screen: SettingsScreen;

  beforeEach(() => {
    document.body.innerHTML = "";
    container = document.createElement("div");
    document.body.appendChild(container);
    localStorage.clear();
    settings = new SettingsStore();
    onClose = vi.fn<() => void>();
    screen = new SettingsScreen(container, {
      settings,
      onClose: onClose as unknown as () => void,
      version: "test-1.0",
    });
  });

  describe("tabs", () => {
    it("mounts with 'display' tab active by default", () => {
      expect(screen.getActiveTab()).toBe("display");
      const active = container.querySelector<HTMLElement>(".af-settings-tab.active")!;
      expect(active.dataset.tabId).toBe("display");
    });

    it("setActiveTab updates DOM aria-selected", () => {
      screen.setActiveTab("audio");
      const audio = container.querySelector<HTMLElement>('[data-testid="settings-tab-audio"]')!;
      expect(audio.getAttribute("aria-selected")).toBe("true");
      const display = container.querySelector<HTMLElement>('[data-testid="settings-tab-display"]')!;
      expect(display.getAttribute("aria-selected")).toBe("false");
    });

    it("clicking a tab button switches context", () => {
      container.querySelector<HTMLButtonElement>('[data-testid="settings-tab-about"]')!.click();
      expect(screen.getActiveTab()).toBe("about");
    });

    it("bumper-right / bumper-left cycle through tabs (including the Back entry)", () => {
      const order = ["display", "audio", "controls", "wifi", "roms", "about", "back"];
      for (let i = 1; i < order.length; i++) {
        screen.handleNavAction("bumper-right");
        expect(screen.getActiveTab()).toBe(order[i]);
      }
      screen.handleNavAction("bumper-right"); // wraps
      expect(screen.getActiveTab()).toBe("display");
      screen.handleNavAction("bumper-left");  // wraps back
      expect(screen.getActiveTab()).toBe("back");
    });
  });

  describe("display tab form controls", () => {
    it("toggling CRT Filter persists through SettingsStore", () => {
      const toggle = container.querySelector<HTMLInputElement>(".af-settings-toggle")!;
      expect(toggle.checked).toBe(false);
      toggle.checked = true;
      toggle.dispatchEvent(new Event("change"));
      expect(settings.get().display.crtFilter).toBe(true);
    });

    it("aspect-ratio select writes to settings", () => {
      const select = container.querySelector<HTMLSelectElement>('[data-testid="setting-aspect-ratio"] select')!;
      select.value = "16:9";
      select.dispatchEvent(new Event("change"));
      expect(settings.get().display.aspectRatio).toBe("16:9");
    });

    it("scanline opacity slider converts 0-100 → 0-1 float", () => {
      const slider = container.querySelectorAll<HTMLInputElement>(".af-settings-slider")[0]!;
      slider.value = "75";
      slider.dispatchEvent(new Event("change"));
      expect(settings.get().display.scanlineOpacity).toBe(0.75);
    });
  });

  describe("audio tab", () => {
    beforeEach(() => screen.setActiveTab("audio"));

    it("master volume slider writes to settings", () => {
      const slider = container.querySelector<HTMLInputElement>('[data-testid="setting-volume"] input[type="range"]')!;
      slider.value = "42";
      slider.dispatchEvent(new Event("change"));
      expect(settings.get().audio.masterVolume).toBe(42);
    });

    it("latency select writes to settings", () => {
      const select = container.querySelector<HTMLSelectElement>('[data-testid="setting-latency"] select')!;
      select.value = "low";
      select.dispatchEvent(new Event("change"));
      expect(settings.get().audio.latency).toBe("low");
    });
  });

  describe("about tab", () => {
    it("displays the injected version", () => {
      screen.setActiveTab("about");
      const about = container.querySelector<HTMLElement>('[data-testid="settings-about"]')!;
      expect(about.textContent).toContain("test-1.0");
    });
  });

  describe("close", () => {
    it("back tab renders a Back button that closes the screen and invokes onClose", () => {
      screen.setActiveTab("back");
      container.querySelector<HTMLButtonElement>('[data-testid="settings-back"]')!.click();
      expect(onClose).toHaveBeenCalledTimes(1);
      expect(container.querySelector('[data-testid="settings-screen"]')).toBeNull();
    });

    it("handleNavAction('back') closes the screen", () => {
      screen.handleNavAction("back");
      expect(onClose).toHaveBeenCalledTimes(1);
    });

    it("handleNavAction('coin-hold') closes the screen", () => {
      screen.handleNavAction("coin-hold");
      expect(onClose).toHaveBeenCalledTimes(1);
    });
  });

  describe("controls tab", () => {
    it("renders the saved P1 mapping with the custom bindings", () => {
      const onReset = vi.fn<() => void>();
      const screen2 = new SettingsScreen(container, {
        settings,
        onClose: onClose as unknown as () => void,
        controls: {
          getMapping: () => ({
            version: 2,
            type: "keyboard",
            p1: { coin: { kind: "key", code: "Space" }, start: { kind: "key", code: "Enter" } },
          }),
          onReset: onReset as unknown as () => void,
        },
      });
      screen2.setActiveTab("controls");
      const pane = container.querySelector<HTMLElement>('[data-testid="settings-controls"]')!;
      // Keyboard is offered as a device option in the P1 selector.
      expect(pane.textContent).toContain("Keyboard");
      expect(pane.textContent).toContain("coin");
      expect(pane.textContent).toContain("Key Space");
      // Both players expose a bindings list — P1 picks up the custom
      // keyboard mapping, P2 falls back to engine defaults.
      const p1List = container.querySelector<HTMLElement>('[data-testid="settings-bindings-p1"]')!;
      const p2List = container.querySelector<HTMLElement>('[data-testid="settings-bindings-p2"]')!;
      expect(p1List).not.toBeNull();
      expect(p2List).not.toBeNull();
      expect(p2List.textContent).toMatch(/Key|Button/);
      screen2.unmount();
    });

    it("falls back to a placeholder when no binding is provided", () => {
      screen.setActiveTab("controls");
      const pane = container.querySelector<HTMLElement>('[data-testid="settings-controls"]')!;
      expect(pane.textContent).toContain("not configured");
    });
  });

  describe("roms tab", () => {
    it("shows room id + open state and wires Regenerate", () => {
      const onRegenerate = vi.fn<() => void>();
      const screen2 = new SettingsScreen(container, {
        settings,
        onClose: onClose as unknown as () => void,
        network: {
          getRoomId: () => "sprixe-abcd",
          isOpen: () => true,
          onRegenerate: onRegenerate as unknown as () => void,
        },
      });
      screen2.setActiveTab("roms");
      const pane = container.querySelector<HTMLElement>('[data-testid="settings-roms"]')!;
      expect(pane.textContent).toContain("sprixe-abcd");
      expect(pane.textContent).toContain("Open");
      container.querySelector<HTMLButtonElement>('[data-testid="settings-roms-regenerate"]')!.click();
      expect(onRegenerate).toHaveBeenCalledTimes(1);
      screen2.unmount();
    });

    it("renders ROM list and wires per-row delete", async () => {
      const deleteRom = vi.fn(async () => {});
      const screen2 = new SettingsScreen(container, {
        settings,
        onClose: onClose as unknown as () => void,
        storage: {
          listRoms: async () => [
            { id: "sf2", system: "cps1", kind: "game", zipData: new ArrayBuffer(0), addedAt: 0, lastPlayedAt: 0, playCount: 0, favorite: false, size: 1024 * 1024 },
          ],
          deleteRom: deleteRom as unknown as (id: string) => Promise<void>,
          estimate: async () => ({ usage: 10 * 1024 * 1024, quota: 1024 * 1024 * 1024 }),
        },
      });
      screen2.setActiveTab("roms");
      // Async render — wait two microtasks.
      await Promise.resolve();
      await Promise.resolve();
      await new Promise((r) => setTimeout(r, 0));
      const quota = container.querySelector<HTMLElement>('[data-testid="settings-roms-quota"]')!;
      expect(quota.textContent).toContain("10.0 MB");
      const delBtn = container.querySelector<HTMLButtonElement>('[data-testid="settings-storage-delete-sf2"]')!;
      delBtn.click();
      await Promise.resolve();
      expect(deleteRom).toHaveBeenCalledWith("sf2");
      screen2.unmount();
    });

    it("falls back to placeholder when storage binding missing", () => {
      screen.setActiveTab("roms");
      const pane = container.querySelector<HTMLElement>('[data-testid="settings-roms"]')!;
      expect(pane.textContent).toContain("not configured");
    });
  });

  describe("live re-render on external settings change", () => {
    it("a SettingsStore update while the screen is mounted refreshes the UI", () => {
      const toggle = () => container.querySelector<HTMLInputElement>(".af-settings-toggle")!;
      expect(toggle().checked).toBe(false);
      // External update (phone remote, CLI, whatever).
      settings.update({ display: { crtFilter: true } });
      expect(toggle().checked).toBe(true);
    });
  });
});
