import "fake-indexeddb/auto";
import { vi } from "vitest";

// Gamepad API mock — tests push snapshots via globalThis.__setGamepad().
let currentPad: Gamepad | null = null;
(globalThis as unknown as { __setGamepad: (pad: Partial<Gamepad> | null) => void }).__setGamepad = (pad) => {
  currentPad = pad as Gamepad | null;
};

vi.stubGlobal("navigator", {
  ...globalThis.navigator,
  getGamepads: () => [currentPad, null, null, null] as (Gamepad | null)[],
});

// Deterministic rAF — advance manually via vi.advanceTimersByTime().
vi.stubGlobal("requestAnimationFrame", (cb: FrameRequestCallback) =>
  setTimeout(() => cb(performance.now()), 16)
);
