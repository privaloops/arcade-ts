import { describe, it, expect, vi } from "vitest";
import { CoinHoldDetector } from "./coin-hold";

describe("CoinHoldDetector", () => {
  describe("tap", () => {
    it("press + release under tapMax (200 ms) fires onTap", () => {
      const det = new CoinHoldDetector();
      const tap = vi.fn();
      const hold = vi.fn();
      det.onTap(tap);
      det.onHold(hold);

      det.press(0);
      det.release(150);

      expect(tap).toHaveBeenCalledTimes(1);
      expect(hold).not.toHaveBeenCalled();
    });

    it("a very short tap (<16 ms) still fires onTap", () => {
      const det = new CoinHoldDetector();
      const tap = vi.fn();
      det.onTap(tap);

      det.press(0);
      det.release(10);

      expect(tap).toHaveBeenCalledTimes(1);
    });
  });

  describe("long press (no commitment)", () => {
    it("release between tapMax and threshold fires nothing", () => {
      const det = new CoinHoldDetector();
      const tap = vi.fn();
      const hold = vi.fn();
      det.onTap(tap);
      det.onHold(hold);

      det.press(0);
      det.release(500); // 500 ms — past tap, short of hold

      expect(tap).not.toHaveBeenCalled();
      expect(hold).not.toHaveBeenCalled();
    });

    it("release exactly at tapMax-1 still fires onTap", () => {
      const det = new CoinHoldDetector({ tapMax: 200 });
      const tap = vi.fn();
      det.onTap(tap);

      det.press(0);
      det.release(199);

      expect(tap).toHaveBeenCalledTimes(1);
    });
  });

  describe("hold", () => {
    it("press + tick past threshold fires onHold exactly once", () => {
      const det = new CoinHoldDetector();
      const hold = vi.fn();
      det.onHold(hold);

      det.press(0);
      det.tick(500); // not yet
      det.tick(999); // still not
      det.tick(1000); // fires
      det.tick(1500); // already fired — no second call
      det.tick(2000);

      expect(hold).toHaveBeenCalledTimes(1);
    });

    it("release at 999 ms does NOT fire onHold", () => {
      const det = new CoinHoldDetector();
      const hold = vi.fn();
      const tap = vi.fn();
      det.onHold(hold);
      det.onTap(tap);

      det.press(0);
      det.tick(999); // threshold not met
      det.release(999);

      expect(hold).not.toHaveBeenCalled();
      expect(tap).not.toHaveBeenCalled(); // 999 ms > tapMax (200)
    });

    it("releasing after onHold fires does NOT also fire onTap", () => {
      const det = new CoinHoldDetector();
      const hold = vi.fn();
      const tap = vi.fn();
      det.onHold(hold);
      det.onTap(tap);

      det.press(0);
      det.tick(1000); // hold fires
      det.release(50); // irrelevant — state already committed

      expect(hold).toHaveBeenCalledTimes(1);
      expect(tap).not.toHaveBeenCalled();
    });

    it("custom threshold is respected", () => {
      const det = new CoinHoldDetector({ threshold: 500 });
      const hold = vi.fn();
      det.onHold(hold);

      det.press(0);
      det.tick(499);
      expect(hold).not.toHaveBeenCalled();
      det.tick(500);
      expect(hold).toHaveBeenCalledTimes(1);
    });
  });

  describe("double-tap", () => {
    it("two quick taps fire onTap twice, never onHold", () => {
      const det = new CoinHoldDetector();
      const tap = vi.fn();
      const hold = vi.fn();
      det.onTap(tap);
      det.onHold(hold);

      det.press(0);
      det.release(100);
      det.press(200);
      det.release(300);

      expect(tap).toHaveBeenCalledTimes(2);
      expect(hold).not.toHaveBeenCalled();
    });

    it("state resets between taps so the second press is measured from its own start", () => {
      const det = new CoinHoldDetector();
      const hold = vi.fn();
      det.onHold(hold);

      det.press(0);
      det.release(50);
      det.press(100);
      det.tick(1050); // 950 ms into the *second* press
      expect(hold).not.toHaveBeenCalled();

      det.tick(1100); // 1000 ms into the second press → fires
      expect(hold).toHaveBeenCalledTimes(1);
    });
  });

  describe("edge cases", () => {
    it("release without press is a no-op", () => {
      const det = new CoinHoldDetector();
      const tap = vi.fn();
      det.onTap(tap);
      det.release(100);
      expect(tap).not.toHaveBeenCalled();
    });

    it("duplicate press is ignored — second press does not overwrite the original pressedAt", () => {
      const det = new CoinHoldDetector();
      const hold = vi.fn();
      det.onHold(hold);

      det.press(0);
      det.press(500); // ignored — still tracking from t=0
      det.tick(1000);

      expect(hold).toHaveBeenCalledTimes(1);
    });

    it("reset() clears state mid-press", () => {
      const det = new CoinHoldDetector();
      const tap = vi.fn();
      const hold = vi.fn();
      det.onTap(tap);
      det.onHold(hold);

      det.press(0);
      det.reset();
      det.tick(2000);
      expect(hold).not.toHaveBeenCalled();

      // After reset, a fresh tap works.
      det.press(3000);
      det.release(3100);
      expect(tap).toHaveBeenCalledTimes(1);
    });

    it("isPressed reports the current state", () => {
      const det = new CoinHoldDetector();
      expect(det.isPressed()).toBe(false);
      det.press(0);
      expect(det.isPressed()).toBe(true);
      det.release(100);
      expect(det.isPressed()).toBe(false);
    });
  });

  describe("subscriptions", () => {
    it("unsubscribe stops onTap firings", () => {
      const det = new CoinHoldDetector();
      const cb = vi.fn();
      const off = det.onTap(cb);
      det.press(0);
      det.release(100);
      off();
      det.press(200);
      det.release(300);
      expect(cb).toHaveBeenCalledTimes(1);
    });

    it("unsubscribe stops onHold firings", () => {
      const det = new CoinHoldDetector();
      const cb = vi.fn();
      const off = det.onHold(cb);
      det.press(0);
      det.tick(1000);
      off();
      det.press(2000);
      det.tick(3000);
      expect(cb).toHaveBeenCalledTimes(1);
    });
  });
});
