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
/**
 * Seeds a default gamepad input mapping into localStorage BEFORE any
 * page script runs. Phase 2.4 routes users without a mapping through
 * the setup screen, so any E2E that wants to land directly in the
 * browser must call this first. p2-first-boot-mapping.spec.ts opts
 * out by wiping localStorage after the initial goto.
 */
export async function seedDefaultMapping(page: Page): Promise<void> {
  await page.addInitScript(() => {
    if (!localStorage.getItem("sprixe.input.mapping.v1")) {
      localStorage.setItem(
        "sprixe.input.mapping.v1",
        JSON.stringify({
          version: 1,
          type: "gamepad",
          p1: {
            coin: { kind: "button", index: 8 },
            start: { kind: "button", index: 9 },
            up: { kind: "button", index: 12 },
            down: { kind: "button", index: 13 },
            left: { kind: "button", index: 14 },
            right: { kind: "button", index: 15 },
            button1: { kind: "button", index: 0 },
            button2: { kind: "button", index: 1 },
            button3: { kind: "button", index: 2 },
            button4: { kind: "button", index: 3 },
            button5: { kind: "button", index: 4 },
            button6: { kind: "button", index: 5 },
          },
        })
      );
    }
    // Phase 3.10: tell main.ts to use MOCK_GAMES as fallback when the
    // ROM store is empty. Production first boot hits EmptyState; tests
    // that want the browser pre-populated opt in with this flag.
    if (localStorage.getItem("sprixe.useMockCatalogue") === null) {
      localStorage.setItem("sprixe.useMockCatalogue", "true");
    }
  });
}

/**
 * Install only the Gamepad API mock. Use this when the test needs
 * raw control over localStorage (e.g. p2-first-boot-mapping which
 * explicitly tests the no-mapping state).
 */
export async function installGamepadMockOnly(page: Page): Promise<void> {
  await page.addInitScript(() => {
    let pad: Gamepad | null = null;
    let activeTimer: number | null = null;

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

    const clearActive = () => {
      if (activeTimer !== null) {
        clearTimeout(activeTimer);
        activeTimer = null;
      }
    };

    (window as unknown as { __pressButton: (idx: number, ms?: number) => void }).__pressButton = (idx, ms = 50) => {
      clearActive();
      pad = snapshot(idx);
      activeTimer = window.setTimeout(() => {
        pad = null;
        activeTimer = null;
      }, ms);
    };

    (window as unknown as { __holdButton: (idx: number, ms: number) => Promise<void> }).__holdButton = (idx, ms) => {
      clearActive();
      pad = snapshot(idx);
      return new Promise<void>((r) => {
        activeTimer = window.setTimeout(() => {
          pad = null;
          activeTimer = null;
          r();
        }, ms);
      });
    };

    Object.defineProperty(navigator, "getGamepads", {
      value: () => [pad, null, null, null] as (Gamepad | null)[],
      configurable: true,
    });
  });
}

/**
 * Install gamepad mock + seed the default input mapping. This is
 * what most arcade E2E tests want: land on the browser screen
 * without hitting the first-boot mapping setup.
 */
export async function installGamepadMock(page: Page): Promise<void> {
  await seedDefaultMapping(page);
  await installGamepadMockOnly(page);
}
