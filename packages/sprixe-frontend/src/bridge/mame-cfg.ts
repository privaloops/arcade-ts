/**
 * Project the Sprixe InputMapping onto MAME's default.cfg XML so the
 * native MAME running on the Pi honours the same controls the user
 * configured in Sprixe Settings → Controls.
 *
 * The kiosk page generates this string at launch time and POSTs it
 * to the bridge's /config endpoint, which writes it to
 * ~/.mame/cfg/default.cfg right before spawning MAME. MAME loads
 * default.cfg automatically; per-player slots fall back to the
 * standard MAME defaults if a slot isn't present.
 */
import type { InputMapping, InputBinding, MappingRole, PlayerSlot } from "../input/mapping-store";

/** Sprixe role → MAME port type for player N. */
function portForRole(role: MappingRole, player: 1 | 2): string {
  const prefix = `P${player}`;
  switch (role) {
    case "coin":    return `${prefix}_COIN${player}`;
    case "start":   return `${prefix}_START${player}`;
    case "up":      return `${prefix}_JOYSTICK_UP`;
    case "down":    return `${prefix}_JOYSTICK_DOWN`;
    case "left":    return `${prefix}_JOYSTICK_LEFT`;
    case "right":   return `${prefix}_JOYSTICK_RIGHT`;
    case "button1": return `${prefix}_BUTTON1`;
    case "button2": return `${prefix}_BUTTON2`;
    case "button3": return `${prefix}_BUTTON3`;
    case "button4": return `${prefix}_BUTTON4`;
    case "button5": return `${prefix}_BUTTON5`;
    case "button6": return `${prefix}_BUTTON6`;
  }
}

/**
 * Map a JavaScript KeyboardEvent.code (the Sprixe storage format)
 * onto MAME's KEYCODE_* identifier. Covers the keys a typical arcade
 * encoder or USB keyboard sends; falls back to the trailing segment
 * uppercased ("Equal" → "EQUAL") which often matches when the table
 * doesn't list a literal entry.
 */
function jsKeyToMame(code: string): string | null {
  const explicit: Record<string, string> = {
    // Letters
    KeyA: "KEYCODE_A", KeyB: "KEYCODE_B", KeyC: "KEYCODE_C", KeyD: "KEYCODE_D",
    KeyE: "KEYCODE_E", KeyF: "KEYCODE_F", KeyG: "KEYCODE_G", KeyH: "KEYCODE_H",
    KeyI: "KEYCODE_I", KeyJ: "KEYCODE_J", KeyK: "KEYCODE_K", KeyL: "KEYCODE_L",
    KeyM: "KEYCODE_M", KeyN: "KEYCODE_N", KeyO: "KEYCODE_O", KeyP: "KEYCODE_P",
    KeyQ: "KEYCODE_Q", KeyR: "KEYCODE_R", KeyS: "KEYCODE_S", KeyT: "KEYCODE_T",
    KeyU: "KEYCODE_U", KeyV: "KEYCODE_V", KeyW: "KEYCODE_W", KeyX: "KEYCODE_X",
    KeyY: "KEYCODE_Y", KeyZ: "KEYCODE_Z",
    // Digits (top row)
    Digit0: "KEYCODE_0", Digit1: "KEYCODE_1", Digit2: "KEYCODE_2",
    Digit3: "KEYCODE_3", Digit4: "KEYCODE_4", Digit5: "KEYCODE_5",
    Digit6: "KEYCODE_6", Digit7: "KEYCODE_7", Digit8: "KEYCODE_8", Digit9: "KEYCODE_9",
    // Arrows + nav
    ArrowUp: "KEYCODE_UP", ArrowDown: "KEYCODE_DOWN",
    ArrowLeft: "KEYCODE_LEFT", ArrowRight: "KEYCODE_RIGHT",
    Space: "KEYCODE_SPACE", Enter: "KEYCODE_ENTER", Tab: "KEYCODE_TAB",
    Escape: "KEYCODE_ESC", Backspace: "KEYCODE_BACKSPACE",
    // Modifiers
    ShiftLeft: "KEYCODE_LSHIFT", ShiftRight: "KEYCODE_RSHIFT",
    ControlLeft: "KEYCODE_LCONTROL", ControlRight: "KEYCODE_RCONTROL",
    AltLeft: "KEYCODE_LALT", AltRight: "KEYCODE_RALT",
    // Punctuation
    Minus: "KEYCODE_MINUS", Equal: "KEYCODE_EQUALS",
    BracketLeft: "KEYCODE_OPENBRACE", BracketRight: "KEYCODE_CLOSEBRACE",
    Semicolon: "KEYCODE_COLON", Quote: "KEYCODE_QUOTE",
    Comma: "KEYCODE_COMMA", Period: "KEYCODE_STOP", Slash: "KEYCODE_SLASH",
    Backslash: "KEYCODE_BACKSLASH",
    // F-keys
    F1: "KEYCODE_F1", F2: "KEYCODE_F2", F3: "KEYCODE_F3", F4: "KEYCODE_F4",
    F5: "KEYCODE_F5", F6: "KEYCODE_F6", F7: "KEYCODE_F7", F8: "KEYCODE_F8",
    F9: "KEYCODE_F9", F10: "KEYCODE_F10", F11: "KEYCODE_F11", F12: "KEYCODE_F12",
    // Numpad
    Numpad0: "KEYCODE_0_PAD", Numpad1: "KEYCODE_1_PAD", Numpad2: "KEYCODE_2_PAD",
    Numpad3: "KEYCODE_3_PAD", Numpad4: "KEYCODE_4_PAD", Numpad5: "KEYCODE_5_PAD",
    Numpad6: "KEYCODE_6_PAD", Numpad7: "KEYCODE_7_PAD", Numpad8: "KEYCODE_8_PAD",
    Numpad9: "KEYCODE_9_PAD",
  };
  return explicit[code] ?? null;
}

/** Sprixe binding → MAME input sequence string. Returns null when the
 * binding can't be projected (unknown key, unsupported axis). */
function bindingToMameSeq(binding: InputBinding, player: 1 | 2): string | null {
  switch (binding.kind) {
    case "key": {
      const mame = jsKeyToMame(binding.code);
      return mame;
    }
    case "button":
      return `JOYCODE_${player}_BUTTON${binding.index + 1}`;
    case "axis": {
      // Standard SDL axis ordering: 0=LX, 1=LY, 2=RX, 3=RY.
      const axisIdx = binding.index;
      const dir = binding.dir;
      const axisName =
        axisIdx === 0 ? "XAXIS" :
        axisIdx === 1 ? "YAXIS" :
        axisIdx === 2 ? "ZAXIS" :
        axisIdx === 3 ? "RZAXIS" :
        null;
      if (!axisName) return null;
      // MAME treats these "*_SWITCH" tokens as digital axis taps that
      // map cleanly onto a directional control like JOYSTICK_UP.
      const xMap = dir < 0 ? "LEFT" : "RIGHT";
      const yMap = dir < 0 ? "UP" : "DOWN";
      const polarity = (axisIdx === 0 || axisIdx === 2) ? xMap : yMap;
      return `JOYCODE_${player}_${axisName}_${polarity}_SWITCH`;
    }
  }
}

function escapeXml(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");
}

function renderPort(role: MappingRole, binding: InputBinding, player: 1 | 2): string | null {
  const seq = bindingToMameSeq(binding, player);
  if (!seq) return null;
  const port = portForRole(role, player);
  return `      <port type="${escapeXml(port)}">\n        <newseq type="standard">${escapeXml(seq)}</newseq>\n      </port>`;
}

function renderPlayer(slot: PlayerSlot, player: 1 | 2): string[] {
  const out: string[] = [];
  for (const role of Object.keys(slot) as MappingRole[]) {
    const binding = slot[role];
    if (!binding) continue;
    const xml = renderPort(role, binding, player);
    if (xml) out.push(xml);
  }
  return out;
}

/**
 * Serialize the full mapping into a default.cfg XML document. Empty
 * mapping (no slot) returns an empty document so MAME falls back to
 * its compiled-in defaults instead of erroring on a malformed cfg.
 */
export function serializeMappingToMameCfg(mapping: InputMapping | null): string {
  const ports: string[] = [];
  if (mapping) {
    ports.push(...renderPlayer(mapping.p1, 1));
    if (mapping.p2) ports.push(...renderPlayer(mapping.p2, 2));
  }
  return [
    `<?xml version="1.0"?>`,
    `<mameconfig version="10">`,
    `  <system name="default">`,
    `    <input>`,
    ...ports,
    `    </input>`,
    `  </system>`,
    `</mameconfig>`,
    ``,
  ].join("\n");
}
