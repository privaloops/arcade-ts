import type { Page } from "@playwright/test";

/**
 * Installs a Gamepad API mock in the page before any script runs.
 *
 * Exposes two helpers on `window`:
 *   - `__pressButton(idx, ms = 50)` — tap a button for `ms` milliseconds.
 *   - `__holdButton(idx, ms)` — hold a button for `ms` ms, returns a Promise.
 *
 * All arcade E2E specs start with `await installGamepadMock(page)` before
 * `page.goto()` so the mock is active from the very first frame.
 */
export async function installGamepadMock(page: Page): Promise<void> {
  await page.addInitScript(() => {
    let pad: Gamepad | null = null;

    const snapshot = (idx: number): Gamepad => {
      const buttons = [] as GamepadButton[];
      for (let i = 0; i < 16; i++) {
        buttons[i] = { pressed: i === idx, touched: i === idx, value: i === idx ? 1 : 0 } as GamepadButton;
      }
      return {
        id: "mock",
        index: 0,
        connected: true,
        mapping: "standard",
        timestamp: performance.now(),
        axes: [0, 0, 0, 0],
        buttons,
        vibrationActuator: null as unknown as GamepadHapticActuator,
      } as Gamepad;
    };

    (window as unknown as { __pressButton: (idx: number, ms?: number) => void }).__pressButton = (idx, ms = 50) => {
      pad = snapshot(idx);
      setTimeout(() => { pad = null; }, ms);
    };

    (window as unknown as { __holdButton: (idx: number, ms: number) => Promise<void> }).__holdButton = (idx, ms) => {
      pad = snapshot(idx);
      return new Promise<void>((r) => setTimeout(() => { pad = null; r(); }, ms));
    };

    Object.defineProperty(navigator, "getGamepads", {
      value: () => [pad, null, null, null] as (Gamepad | null)[],
      configurable: true,
    });
  });
}
