import { describe, it, expect, beforeEach } from "vitest";
import { GamepadNav, DEFAULT_MAPPING, type NavAction } from "./gamepad-nav";

type SetPad = (pad: Partial<Gamepad> | null) => void;
const setPad: SetPad = (globalThis as unknown as { __setGamepad: SetPad }).__setGamepad;

/** Build a minimal Gamepad snapshot where a chosen set of button indices are pressed. */
function pad(pressedIndices: number[]): Partial<Gamepad> {
  const pressedSet = new Set(pressedIndices);
  const buttons: GamepadButton[] = [];
  for (let i = 0; i < 16; i++) {
    buttons[i] = {
      pressed: pressedSet.has(i),
      touched: pressedSet.has(i),
      value: pressedSet.has(i) ? 1 : 0,
    } as GamepadButton;
  }
  return { connected: true, buttons, axes: [0, 0, 0, 0], id: "mock", index: 0 };
}

describe("GamepadNav", () => {
  let actions: NavAction[];

  beforeEach(() => {
    actions = [];
    setPad(null);
  });

  it("emits on the down-edge (released → pressed)", () => {
    const nav = new GamepadNav();
    nav.onAction((a) => actions.push(a));

    nav.tick(0);
    expect(actions).toEqual([]);

    setPad(pad([DEFAULT_MAPPING.confirm]));
    nav.tick(16);

    expect(actions).toEqual(["confirm"]);
  });

  it("does not re-emit while the button stays pressed (no repeat for non-directional actions)", () => {
    const nav = new GamepadNav();
    nav.onAction((a) => actions.push(a));

    setPad(pad([DEFAULT_MAPPING.confirm]));
    nav.tick(0);
    nav.tick(100);
    nav.tick(500);
    nav.tick(1200);

    expect(actions).toEqual(["confirm"]);
  });

  it("directional key-repeat: initial delay 250 ms, then every 80 ms", () => {
    const nav = new GamepadNav();
    nav.onAction((a) => actions.push(a));

    setPad(pad([DEFAULT_MAPPING.up]));
    nav.tick(0);                       // down-edge → 1 emit
    nav.tick(100);                     // too early
    nav.tick(240);                     // still before 250 ms threshold
    nav.tick(260);                     // first repeat
    nav.tick(339);                     // before next 80 ms slot
    nav.tick(340);                     // second repeat (260 + 80)
    nav.tick(420);                     // third repeat

    expect(actions).toEqual(["up", "up", "up", "up"]);
  });

  it("short tap under one tick: a single emission", () => {
    const nav = new GamepadNav();
    nav.onAction((a) => actions.push(a));

    setPad(pad([DEFAULT_MAPPING.down]));
    nav.tick(0);                       // press captured
    setPad(pad([]));
    nav.tick(10);                      // release captured inside 16 ms

    expect(actions).toEqual(["down"]);
  });

  it("ignores buttons outside the mapping", () => {
    const nav = new GamepadNav();
    nav.onAction((a) => actions.push(a));

    // Index 7 is not mapped in DEFAULT_MAPPING — left trigger.
    setPad(pad([7]));
    nav.tick(0);
    nav.tick(400);

    expect(actions).toEqual([]);
  });

  it("ignores re-press that occurs within the same frame as release", () => {
    const nav = new GamepadNav();
    nav.onAction((a) => actions.push(a));

    setPad(pad([DEFAULT_MAPPING.confirm]));
    nav.tick(0);
    setPad(pad([]));
    nav.tick(16);
    setPad(pad([DEFAULT_MAPPING.confirm]));
    nav.tick(32);

    expect(actions).toEqual(["confirm", "confirm"]);
  });

  it("coin-hold fires exactly once after 1000 ms of sustained press", () => {
    const nav = new GamepadNav();
    nav.onAction((a) => actions.push(a));

    setPad(pad([DEFAULT_MAPPING.coin]));
    nav.tick(0);                       // press captured, no emission
    nav.tick(500);                     // still below threshold
    nav.tick(999);                     // one ms shy
    expect(actions).toEqual([]);

    nav.tick(1000);                    // threshold reached → emit coin-hold
    nav.tick(1500);                    // held longer → no second emission
    nav.tick(2000);

    expect(actions).toEqual(["coin-hold"]);
  });

  it("coin released before threshold does not emit coin-hold", () => {
    const nav = new GamepadNav();
    nav.onAction((a) => actions.push(a));

    setPad(pad([DEFAULT_MAPPING.coin]));
    nav.tick(0);
    nav.tick(900);
    setPad(pad([]));
    nav.tick(950);

    expect(actions).toEqual([]);
  });

  it("no gamepad connected drops state and stops firing", () => {
    const nav = new GamepadNav();
    nav.onAction((a) => actions.push(a));

    setPad(pad([DEFAULT_MAPPING.up]));
    nav.tick(0);
    nav.tick(300);                     // 1 down-edge + 1 repeat = 2 emits

    setPad(null);
    nav.tick(400);
    nav.tick(500);

    setPad(pad([DEFAULT_MAPPING.up]));
    nav.tick(600);                     // counts as a fresh down-edge

    expect(actions).toEqual(["up", "up", "up"]);
  });

  it("onAction returns an unsubscribe function", () => {
    const nav = new GamepadNav();
    const unsubscribe = nav.onAction((a) => actions.push(a));

    setPad(pad([DEFAULT_MAPPING.confirm]));
    nav.tick(0);
    expect(actions).toEqual(["confirm"]);

    unsubscribe();
    setPad(pad([]));
    nav.tick(16);
    setPad(pad([DEFAULT_MAPPING.confirm]));
    nav.tick(32);

    expect(actions).toEqual(["confirm"]);
  });

  it("stop() clears held state — the next tick sees a fresh press", () => {
    const nav = new GamepadNav();
    nav.onAction((a) => actions.push(a));

    setPad(pad([DEFAULT_MAPPING.confirm]));
    nav.tick(0);                       // down-edge
    nav.stop();                        // internal button map cleared
    nav.tick(16);                      // button still pressed → counts as new down-edge

    expect(actions).toEqual(["confirm", "confirm"]);
  });

  it("custom mapping overrides default bindings", () => {
    const nav = new GamepadNav({ mapping: { confirm: 4 } });
    nav.onAction((a) => actions.push(a));

    // Button 4 is not the default confirm (0) — verify the override takes effect.
    setPad(pad([4]));
    nav.tick(0);
    setPad(pad([0]));
    nav.tick(16);

    expect(actions).toEqual(["confirm"]);
  });
});
