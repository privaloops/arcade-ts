import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { MappingScreen } from "./mapping-screen";
import { InputCapture } from "../../input/input-capture";
import { MAPPING_ROLES, loadMapping, clearMapping, STORAGE_KEY, type InputBinding, type MappingRole } from "../../input/mapping-store";

type SetPad = (pad: Partial<Gamepad> | null) => void;
const setPad: SetPad = (globalThis as unknown as { __setGamepad: SetPad }).__setGamepad;

function gamepadWith(opts: { pressed?: number[] | undefined; axes?: number[] | undefined } = {}): Partial<Gamepad> {
  const pressed = new Set(opts.pressed ?? []);
  const buttons: GamepadButton[] = [];
  for (let i = 0; i < 16; i++) {
    buttons[i] = { pressed: pressed.has(i), touched: pressed.has(i), value: pressed.has(i) ? 1 : 0 } as GamepadButton;
  }
  const axes = new Array(4).fill(0);
  (opts.axes ?? []).forEach((v, i) => { axes[i] = v; });
  return { connected: true, buttons, axes, id: "mock", index: 0 };
}

describe("MappingScreen", () => {
  let container: HTMLDivElement;

  beforeEach(() => {
    document.body.innerHTML = "";
    container = document.createElement("div");
    document.body.appendChild(container);
    localStorage.clear();
    setPad(null);
  });

  function runCaptureWithPad(capture: InputCapture, pad: Partial<Gamepad> | null) {
    setPad(pad);
    capture.tick();
  }

  it("sequentially captures the 12 arcade roles and fires onComplete with a full mapping", () => {
    const capture = new InputCapture();
    const onComplete = vi.fn();
    const screen = new MappingScreen(container, { capture, onComplete });

    // Baseline: no pad. advance() armed capture on the first role ('coin').
    expect(screen.getCurrentRole()).toBe("coin");

    // 12 roles: coin, start, up, down, left, right, button1..button6.
    // One distinct button per prompt (up/down also use axis variants).
    const binds: Array<[number[] | undefined, number[] | undefined]> = [
      [[8], undefined],                // coin
      [[9], undefined],                // start
      [undefined, [0, -0.9, 0, 0]],    // up (axis 1 dir -1)
      [undefined, [0, 0.9, 0, 0]],     // down (axis 1 dir +1)
      [[14], undefined],               // left
      [[15], undefined],               // right
      [[0], undefined],                // button1
      [[1], undefined],                // button2
      [[2], undefined],                // button3
      [[3], undefined],                // button4
      [[4], undefined],                // button5
      [[5], undefined],                // button6
    ];

    for (const [pressed, axes] of binds) {
      runCaptureWithPad(capture, gamepadWith({ pressed, axes }));
      runCaptureWithPad(capture, gamepadWith({}));
    }

    expect(onComplete).toHaveBeenCalledTimes(1);
    const mapping = onComplete.mock.calls[0]![0];
    expect(mapping.version).toBe(2);
    expect(mapping.type).toBe("gamepad");
    expect(mapping.p1.coin).toEqual({ kind: "button", index: 8 });
    expect(mapping.p1.start).toEqual({ kind: "button", index: 9 });
    expect(mapping.p1.up).toEqual({ kind: "axis", index: 1, dir: -1 });
    expect(mapping.p1.down).toEqual({ kind: "axis", index: 1, dir: 1 });
    expect(mapping.p1.button1).toEqual({ kind: "button", index: 0 });
    expect(mapping.p1.button6).toEqual({ kind: "button", index: 5 });
    expect(screen.getCurrentRole()).toBeNull();
  });

  it("persists the completed mapping to localStorage under sprixe.input.mapping.v1", () => {
    const capture = new InputCapture();
    const onComplete = vi.fn();
    new MappingScreen(container, { capture, onComplete });

    for (const role of MAPPING_ROLES) {
      // Fire a distinct button for each prompt (16 possible, 12 used).
      const idx = MAPPING_ROLES.indexOf(role);
      runCaptureWithPad(capture, gamepadWith({ pressed: [idx] }));
      runCaptureWithPad(capture, gamepadWith({}));
    }

    expect(localStorage.getItem(STORAGE_KEY)).not.toBeNull();
    const stored = loadMapping();
    expect(stored).not.toBeNull();
    expect(stored!.type).toBe("gamepad");
    expect(stored!.p1.coin).toEqual({ kind: "button", index: 0 });
    expect(stored!.p1.button6).toEqual({ kind: "button", index: 11 });
  });

  it("refuses a duplicate binding and keeps the prompt active", () => {
    const capture = new InputCapture();
    const onComplete = vi.fn();
    const screen = new MappingScreen(container, { capture, onComplete });

    // Role 1: coin → button 8
    runCaptureWithPad(capture, gamepadWith({ pressed: [8] }));
    runCaptureWithPad(capture, gamepadWith({}));
    expect(screen.getCurrentRole()).toBe("start");

    // Role 2 (start): also button 8 → duplicate → refused.
    runCaptureWithPad(capture, gamepadWith({ pressed: [8] }));
    runCaptureWithPad(capture, gamepadWith({}));

    expect(screen.getCurrentRole()).toBe("start"); // still pending
    const warning = container.querySelector<HTMLElement>('[data-testid="mapping-warning"]')!;
    expect(warning.style.visibility).toBe("visible");
    expect(warning.textContent).toContain("already mapped");

    // Now press a distinct button → warning cleared, advances.
    runCaptureWithPad(capture, gamepadWith({ pressed: [9] }));
    runCaptureWithPad(capture, gamepadWith({}));
    expect(screen.getCurrentRole()).toBe("up");
    expect(warning.style.visibility).toBe("hidden");
  });

  it("axis detection honours AXIS_DEADZONE — values below 0.3 are ignored", () => {
    const capture = new InputCapture();
    const screen = new MappingScreen(container, { capture, onComplete: vi.fn() });

    // Small movement (0.2) — shouldn't trigger.
    runCaptureWithPad(capture, gamepadWith({ axes: [0, 0.2, 0, 0] }));
    expect(screen.getCurrentRole()).toBe("coin");

    // Cross threshold.
    runCaptureWithPad(capture, gamepadWith({ axes: [0, 0.4, 0, 0] }));
    runCaptureWithPad(capture, gamepadWith({}));
    expect(screen.getCurrentRole()).toBe("start");
    expect(screen.getMapping().coin).toEqual({ kind: "axis", index: 1, dir: 1 });
  });

  it("respects a custom roles list", () => {
    const capture = new InputCapture();
    const onComplete = vi.fn();
    const roles: readonly MappingRole[] = ["coin", "button1"];
    new MappingScreen(container, { capture, onComplete, roles });

    runCaptureWithPad(capture, gamepadWith({ pressed: [8] }));
    runCaptureWithPad(capture, gamepadWith({}));
    runCaptureWithPad(capture, gamepadWith({ pressed: [0] }));
    runCaptureWithPad(capture, gamepadWith({}));

    expect(onComplete).toHaveBeenCalledTimes(1);
    const m = onComplete.mock.calls[0]![0];
    expect(Object.keys(m.p1)).toEqual(["coin", "button1"]);
  });

  it("keyboard mode flips the mapping type when the first binding is a key", () => {
    const capture = new InputCapture();
    const onComplete = vi.fn();
    const screen = new MappingScreen(container, { capture, onComplete, roles: ["coin", "button1"] as const });
    void screen;

    // Simulate a keydown — not via the capture.tick (no pad), but
    // via the real window keydown listener that InputCapture registers.
    window.dispatchEvent(new KeyboardEvent("keydown", { code: "KeyC" }));
    // Then a button for confirm.
    runCaptureWithPad(capture, gamepadWith({ pressed: [0] }));
    runCaptureWithPad(capture, gamepadWith({}));

    expect(onComplete).toHaveBeenCalledTimes(1);
    const m = onComplete.mock.calls[0]![0];
    expect(m.type).toBe("keyboard"); // first binding decided the type
    expect(m.p1.coin).toEqual({ kind: "key", code: "KeyC" });
  });

  afterEach(() => {
    clearMapping();
  });
});
