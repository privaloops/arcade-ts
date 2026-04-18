import { describe, it, expect, vi } from "vitest";
import { StateSync } from "./state-sync";
import type { KioskToPhoneMessage } from "./protocol";

function capturePayloads(): { broadcaster: (m: KioskToPhoneMessage) => void; calls: KioskToPhoneMessage[] } {
  const calls: KioskToPhoneMessage[] = [];
  return { broadcaster: (m) => calls.push(m), calls };
}

describe("StateSync", () => {
  describe("diff broadcast semantics", () => {
    it("setState to the same screen as the initial state emits 0 messages", () => {
      const { broadcaster, calls } = capturePayloads();
      const sync = new StateSync(broadcaster);
      sync.setState({ screen: "browser" }); // initial already browser
      expect(calls).toHaveLength(0);
    });

    it("setState with a new screen emits one message containing only the changed field", () => {
      const { broadcaster, calls } = capturePayloads();
      const sync = new StateSync(broadcaster);
      sync.setState({ screen: "playing", game: "sf2" });
      expect(calls).toEqual([
        { type: "state", payload: { screen: "playing", game: "sf2" } },
      ]);
    });

    it("a subsequent partial patch broadcasts only the delta", () => {
      const { broadcaster, calls } = capturePayloads();
      const sync = new StateSync(broadcaster);
      sync.setState({ screen: "playing", game: "sf2", title: "Street Fighter II" });
      calls.length = 0;

      sync.setState({ paused: true });

      expect(calls).toHaveLength(1);
      const msg = calls[0]! as Extract<KioskToPhoneMessage, { type: "state" }>;
      expect(msg.payload).toEqual({ paused: true });
      expect(msg.payload).not.toHaveProperty("game");
      expect(msg.payload).not.toHaveProperty("screen");
    });

    it("setting a field to the same value does not emit", () => {
      const { broadcaster, calls } = capturePayloads();
      const sync = new StateSync(broadcaster);
      sync.setState({ screen: "playing", volume: 80 });
      calls.length = 0;

      sync.setState({ volume: 80 });
      expect(calls).toHaveLength(0);
    });

    it("explicit undefined values are ignored (not broadcast)", () => {
      const { broadcaster, calls } = capturePayloads();
      const sync = new StateSync(broadcaster);
      sync.setState({ screen: "playing" });
      calls.length = 0;

      sync.setState({ game: undefined as unknown as string });
      expect(calls).toHaveLength(0);
    });

    it("multiple field changes in one setState call collapse into one message", () => {
      const { broadcaster, calls } = capturePayloads();
      const sync = new StateSync(broadcaster);
      sync.setState({ screen: "playing", game: "mslug", title: "Metal Slug", paused: false, volume: 80 });
      expect(calls).toHaveLength(1);
      const msg = calls[0]! as Extract<KioskToPhoneMessage, { type: "state" }>;
      expect(msg.payload).toEqual({
        screen: "playing",
        game: "mslug",
        title: "Metal Slug",
        paused: false,
        volume: 80,
      });
    });
  });

  describe("getState", () => {
    it("reflects every accepted patch", () => {
      const spy = vi.fn();
      const sync = new StateSync(spy);
      sync.setState({ screen: "playing", game: "sf2", volume: 80 });
      sync.setState({ paused: true });

      expect(sync.getState()).toMatchObject({
        screen: "playing",
        game: "sf2",
        volume: 80,
        paused: true,
      });
    });
  });

  describe("broadcastFullState", () => {
    it("sends the current snapshot verbatim regardless of diff tracking", () => {
      const { broadcaster, calls } = capturePayloads();
      const sync = new StateSync(broadcaster);
      sync.setState({ screen: "playing", game: "sf2" });
      calls.length = 0;

      sync.broadcastFullState();
      expect(calls).toHaveLength(1);
      const msg = calls[0]! as Extract<KioskToPhoneMessage, { type: "state" }>;
      expect(msg.payload).toMatchObject({ screen: "playing", game: "sf2" });
    });
  });

  describe("throughput", () => {
    it("100 setState calls with churning values complete in <100 ms", () => {
      const spy = vi.fn();
      const sync = new StateSync(spy);
      const start = performance.now();
      for (let i = 0; i < 100; i++) {
        sync.setState({ volume: i % 100 });
      }
      const elapsed = performance.now() - start;
      expect(elapsed).toBeLessThan(100);
    });
  });
});
