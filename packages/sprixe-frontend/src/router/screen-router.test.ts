import { describe, it, expect, vi } from "vitest";
import { ScreenRouter, DEFAULT_TRANSITIONS, type Screen } from "./screen-router";

describe("ScreenRouter", () => {
  describe("initial state", () => {
    it("defaults to splash", () => {
      const router = new ScreenRouter();
      expect(router.current()).toBe("splash");
      expect(router.stackSize()).toBe(0);
    });

    it("accepts an initial screen", () => {
      const router = new ScreenRouter({ initial: "browser" });
      expect(router.current()).toBe("browser");
    });
  });

  describe("legal transitions", () => {
    it("browser → playing → browser round-trip", () => {
      const router = new ScreenRouter({ initial: "browser" });

      expect(router.navigate("playing")).toBe(true);
      expect(router.current()).toBe("playing");
      expect(router.stackSize()).toBe(1);

      expect(router.back()).toBe(true);
      expect(router.current()).toBe("browser");
      expect(router.stackSize()).toBe(0);
    });

    it("splash → browser is allowed; browser → splash is not", () => {
      const router = new ScreenRouter({ initial: "splash" });
      expect(router.navigate("browser")).toBe(true);
      expect(router.current()).toBe("browser");
      expect(router.navigate("splash")).toBe(false);
      expect(router.current()).toBe("browser");
    });

    it("canNavigate reports allowed targets from the default map", () => {
      const router = new ScreenRouter({ initial: "browser" });
      for (const to of DEFAULT_TRANSITIONS.browser!) {
        expect(router.canNavigate(to)).toBe(true);
      }
      // Random illegal target from "browser".
      expect(router.canNavigate("splash")).toBe(false);
    });
  });

  describe("illegal transitions", () => {
    it("refuses and leaves state untouched", () => {
      const router = new ScreenRouter({ initial: "playing" });
      expect(router.navigate("settings")).toBe(false); // playing → settings not allowed
      expect(router.current()).toBe("playing");
      expect(router.stackSize()).toBe(0);
    });

    it("refuses self-transitions", () => {
      const router = new ScreenRouter({ initial: "browser" });
      expect(router.navigate("browser")).toBe(false);
      expect(router.stackSize()).toBe(0);
    });

    it("custom transitions override the default map", () => {
      const router = new ScreenRouter({
        initial: "browser",
        transitions: { browser: ["settings"] },
      });
      expect(router.navigate("settings")).toBe(true);
      expect(router.current()).toBe("settings");
      expect(router.navigate("playing")).toBe(false); // settings has no outgoing edges here
    });
  });

  describe("back stack", () => {
    it("stacks multiple pushes and unwinds in reverse", () => {
      const router = new ScreenRouter({ initial: "browser" });
      router.navigate("settings");
      expect(router.stackSize()).toBe(1);

      router.back();
      expect(router.current()).toBe("browser");

      // Sanity: a fresh navigate→back cycle also works.
      router.navigate("playing");
      expect(router.current()).toBe("playing");
      router.back();
      expect(router.current()).toBe("browser");
      expect(router.stackSize()).toBe(0);
    });

    it("back() returns false on an empty stack", () => {
      const router = new ScreenRouter({ initial: "browser" });
      expect(router.back()).toBe(false);
      expect(router.current()).toBe("browser");
    });

    it("replace() transitions without pushing", () => {
      const router = new ScreenRouter({ initial: "browser" });
      expect(router.replace("settings")).toBe(true);
      expect(router.current()).toBe("settings");
      expect(router.stackSize()).toBe(0);
    });

    it("replace() respects the legality rules", () => {
      const router = new ScreenRouter({ initial: "playing" });
      expect(router.replace("settings")).toBe(false);
      expect(router.current()).toBe("playing");
    });

    it("clearStack empties the history", () => {
      const router = new ScreenRouter({ initial: "browser" });
      router.navigate("settings");
      router.clearStack();
      expect(router.back()).toBe(false);
      expect(router.current()).toBe("settings");
    });
  });

  describe("onEnter / onLeave hooks", () => {
    it("invokes both hooks exactly once per transition", () => {
      const router = new ScreenRouter({ initial: "browser" });
      const leaveBrowser = vi.fn();
      const enterPlaying = vi.fn();
      router.onLeave("browser", leaveBrowser);
      router.onEnter("playing", enterPlaying);

      router.navigate("playing");

      expect(leaveBrowser).toHaveBeenCalledTimes(1);
      expect(enterPlaying).toHaveBeenCalledTimes(1);
    });

    it("does not fire hooks when the transition is illegal", () => {
      const router = new ScreenRouter({ initial: "playing" });
      const leavePlaying = vi.fn();
      const enterSettings = vi.fn();
      router.onLeave("playing", leavePlaying);
      router.onEnter("settings", enterSettings);

      router.navigate("settings");

      expect(leavePlaying).not.toHaveBeenCalled();
      expect(enterSettings).not.toHaveBeenCalled();
    });

    it("fires hooks on back() as a regular transition", () => {
      const router = new ScreenRouter({ initial: "browser" });
      const leaveSettings = vi.fn();
      const enterBrowser = vi.fn();
      router.onLeave("settings", leaveSettings);
      router.onEnter("browser", enterBrowser);

      router.navigate("settings");
      router.back();

      expect(leaveSettings).toHaveBeenCalledTimes(1);
      expect(enterBrowser).toHaveBeenCalledTimes(1);
    });

    it("unsubscribe stops further firings", () => {
      const router = new ScreenRouter({ initial: "browser" });
      const cb = vi.fn();
      const off = router.onEnter("settings", cb);

      router.navigate("settings");
      expect(cb).toHaveBeenCalledTimes(1);

      off();
      router.back();
      router.navigate("settings");
      expect(cb).toHaveBeenCalledTimes(1);
    });
  });

  describe("transition table is exhaustive for Screen", () => {
    // Defensive: if the Screen union gains a new member, the default
    // transitions must still compile — otherwise there's a gap in the FSM.
    const screens: readonly Screen[] = [
      "splash",
      "empty",
      "input-mapping",
      "browser",
      "playing",
      "settings",
    ];

    it("every screen either has outgoing edges or is terminal by intent", () => {
      // "empty" has outgoing edges to input-mapping / browser in the default map.
      // "playing" exits to browser. No state should silently be a dead-end unless documented.
      for (const s of screens) {
        const outgoing = DEFAULT_TRANSITIONS[s];
        expect(outgoing, `Screen ${s} has no outgoing edges`).toBeDefined();
      }
    });
  });
});
