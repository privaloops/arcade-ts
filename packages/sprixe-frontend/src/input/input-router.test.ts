import { describe, it, expect, vi } from "vitest";
import { InputRouter } from "./input-router";

describe("InputRouter", () => {
  describe("menu mode", () => {
    it("forwards NavActions to nav listeners", () => {
      const router = new InputRouter("menu");
      const cb = vi.fn();
      router.onNavAction(cb);

      router.feedAction("up");
      router.feedAction("confirm");

      expect(cb).toHaveBeenCalledTimes(2);
      expect(cb.mock.calls.map((c) => c[0])).toEqual(["up", "confirm"]);
    });

    it("unsubscribe stops further forwarding", () => {
      const router = new InputRouter("menu");
      const cb = vi.fn();
      const off = router.onNavAction(cb);
      router.feedAction("up");
      off();
      router.feedAction("down");
      expect(cb).toHaveBeenCalledTimes(1);
    });
  });

  describe("emu mode", () => {
    it("drops NavActions without calling nav listeners", () => {
      const router = new InputRouter("menu");
      const cb = vi.fn();
      router.onNavAction(cb);

      router.setMode("emu");
      router.feedAction("up");
      router.feedAction("confirm");

      expect(cb).not.toHaveBeenCalled();
    });
  });

  describe("mode switching", () => {
    it("setMode is atomic — actions resolved after the switch use the new mode", () => {
      const router = new InputRouter("menu");
      const cb = vi.fn();
      router.onNavAction(cb);

      router.feedAction("up"); // menu → fires
      router.setMode("emu");
      router.feedAction("down"); // emu → drops
      router.setMode("menu");
      router.feedAction("left"); // menu again → fires

      expect(cb).toHaveBeenCalledTimes(2);
      expect(cb.mock.calls.map((c) => c[0])).toEqual(["up", "left"]);
    });

    it("re-entering menu restores forwarding for already-registered listeners", () => {
      const router = new InputRouter("emu");
      const cb = vi.fn();
      router.onNavAction(cb);

      router.feedAction("up"); // dropped
      router.setMode("menu");
      router.feedAction("down"); // fires

      expect(cb).toHaveBeenCalledWith("down");
    });
  });

  describe("coin-hold", () => {
    it("fires coin-hold listeners in menu mode", () => {
      const router = new InputRouter("menu");
      const cb = vi.fn();
      router.onCoinHold(cb);

      router.feedAction("coin-hold");

      expect(cb).toHaveBeenCalledTimes(1);
    });

    it("fires coin-hold listeners in emu mode too", () => {
      const router = new InputRouter("emu");
      const cb = vi.fn();
      router.onCoinHold(cb);

      router.feedAction("coin-hold");

      expect(cb).toHaveBeenCalledTimes(1);
    });

    it("coin-hold does NOT fire nav listeners", () => {
      const router = new InputRouter("menu");
      const nav = vi.fn();
      const coin = vi.fn();
      router.onNavAction(nav);
      router.onCoinHold(coin);

      router.feedAction("coin-hold");

      expect(nav).not.toHaveBeenCalled();
      expect(coin).toHaveBeenCalledTimes(1);
    });
  });

  describe("no double-fire", () => {
    it("a single NavAction invokes each listener exactly once", () => {
      const router = new InputRouter("menu");
      const cb = vi.fn();
      router.onNavAction(cb);
      router.onNavAction(cb); // duplicate subscription

      router.feedAction("confirm");

      // The Set semantics mean we can't re-add the same cb, so still 1 call.
      expect(cb).toHaveBeenCalledTimes(1);
    });

    it("mode-priority scenario — one binding wired to two different actions", () => {
      // Story: a physical button is bound to both 'settings' (menu)
      // and '1P Start' (emu). The router ensures the active mode
      // decides which one fires; cross-mode bleed is impossible
      // because feedAction is mode-gated.
      const router = new InputRouter("menu");
      const nav = vi.fn();
      router.onNavAction(nav);

      router.feedAction("settings");
      router.setMode("emu");
      router.feedAction("settings"); // same input semantically

      expect(nav).toHaveBeenCalledTimes(1);
      expect(nav).toHaveBeenCalledWith("settings");
    });
  });
});
