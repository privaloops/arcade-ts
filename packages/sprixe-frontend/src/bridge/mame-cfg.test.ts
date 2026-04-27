import { describe, it, expect } from "vitest";
import { serializeMappingToMameCfg } from "./mame-cfg";
import type { InputMapping } from "../input/mapping-store";

describe("serializeMappingToMameCfg", () => {
  it("emits a valid empty cfg when no mapping is set so MAME uses defaults", () => {
    const xml = serializeMappingToMameCfg(null);
    expect(xml).toContain('<?xml version="1.0"?>');
    expect(xml).toContain('<mameconfig version="10">');
    expect(xml).toContain('<system name="default">');
    // No port lines — just the empty <input> block.
    expect(xml).not.toContain("<port");
  });

  it("projects keyboard P1 bindings onto KEYCODE_* + correct port types", () => {
    const mapping: InputMapping = {
      version: 2,
      type: "keyboard",
      p1: {
        coin: { kind: "key", code: "Digit5" },
        start: { kind: "key", code: "Digit1" },
        up: { kind: "key", code: "ArrowUp" },
        button1: { kind: "key", code: "KeyA" },
      },
    };
    const xml = serializeMappingToMameCfg(mapping);
    expect(xml).toContain('<port type="P1_COIN1">');
    expect(xml).toContain("KEYCODE_5");
    expect(xml).toContain('<port type="P1_START1">');
    expect(xml).toContain("KEYCODE_1");
    expect(xml).toContain('<port type="P1_JOYSTICK_UP">');
    expect(xml).toContain("KEYCODE_UP");
    expect(xml).toContain('<port type="P1_BUTTON1">');
    expect(xml).toContain("KEYCODE_A");
  });

  it("projects gamepad button bindings onto JOYCODE_N_BUTTON{idx+1}", () => {
    const mapping: InputMapping = {
      version: 2,
      type: "gamepad",
      p1: {
        button1: { kind: "button", index: 0 },
        button2: { kind: "button", index: 1 },
        button6: { kind: "button", index: 5 },
      },
    };
    const xml = serializeMappingToMameCfg(mapping);
    expect(xml).toContain("JOYCODE_1_BUTTON1");
    expect(xml).toContain("JOYCODE_1_BUTTON2");
    expect(xml).toContain("JOYCODE_1_BUTTON6");
  });

  it("projects gamepad axis bindings onto MAME *_SWITCH tokens", () => {
    const mapping: InputMapping = {
      version: 2,
      type: "gamepad",
      p1: {
        left:  { kind: "axis", index: 0, dir: -1 },
        right: { kind: "axis", index: 0, dir: 1 },
        up:    { kind: "axis", index: 1, dir: -1 },
        down:  { kind: "axis", index: 1, dir: 1 },
      },
    };
    const xml = serializeMappingToMameCfg(mapping);
    expect(xml).toContain("JOYCODE_1_XAXIS_LEFT_SWITCH");
    expect(xml).toContain("JOYCODE_1_XAXIS_RIGHT_SWITCH");
    expect(xml).toContain("JOYCODE_1_YAXIS_UP_SWITCH");
    expect(xml).toContain("JOYCODE_1_YAXIS_DOWN_SWITCH");
  });

  it("renders a P2 slot when present", () => {
    const mapping: InputMapping = {
      version: 2,
      type: "keyboard",
      p1: { button1: { kind: "key", code: "KeyA" } },
      p2: {
        coin: { kind: "key", code: "Digit6" },
        button1: { kind: "key", code: "KeyL" },
      },
    };
    const xml = serializeMappingToMameCfg(mapping);
    expect(xml).toContain('<port type="P1_BUTTON1">');
    expect(xml).toContain('<port type="P2_COIN2">');
    expect(xml).toContain('<port type="P2_BUTTON1">');
  });

  it("skips bindings whose key code is unknown rather than emitting garbage", () => {
    const mapping: InputMapping = {
      version: 2,
      type: "keyboard",
      p1: {
        button1: { kind: "key", code: "MetaLeft" },     // unmapped → skipped
        button2: { kind: "key", code: "KeyB" },
      },
    };
    const xml = serializeMappingToMameCfg(mapping);
    expect(xml).not.toContain("MetaLeft");
    expect(xml).toContain("KEYCODE_B");
  });
});
