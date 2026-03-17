/**
 * CPS1 Input Manager
 *
 * Handles keyboard and Gamepad API inputs, mapped to the CPS1 I/O port format.
 *
 * CPS1 I/O ports (active-LOW: 0 = pressed, 1 = released):
 *   Port 0 (IN0) @ 0x800140 : Player 1 directions + buttons
 *   Port 1 (IN1) @ 0x800142 : Player 2 directions + buttons
 *   Port 2 (IN2) @ 0x800144 : Coins, starts, service, test
 *
 * IN0/IN1 bit layout (active-LOW):
 *   bit 0 : Right
 *   bit 1 : Left
 *   bit 2 : Down
 *   bit 3 : Up
 *   bit 4 : Button 1 (LP)
 *   bit 5 : Button 2 (MP)
 *   bit 6 : Button 3 (HP)
 *   bit 7 : (unused, always 1)
 *
 * IN0 high byte / IN1 high byte (active-LOW):
 *   bit 0 : Button 4 (LK)
 *   bit 1 : Button 5 (MK)
 *   bit 2 : Button 6 (HK)
 *   bits 3-7 : unused (always 1)
 *
 * IN2 bit layout (active-LOW):
 *   bit 0 : Coin 1
 *   bit 1 : Coin 2
 *   bit 2 : Start 1
 *   bit 3 : Start 2
 *   bit 4 : Service
 *   bit 5 : Test
 *   bits 6-7 : unused (always 1)
 */

// ── Key mapping types ───────────────────────────────────────────────────────

export interface KeyMapping {
  up: string;
  down: string;
  left: string;
  right: string;
  button1: string; // LP
  button2: string; // MP
  button3: string; // HP
  button4: string; // LK
  button5: string; // MK
  button6: string; // HK
  start: string;
  coin: string;
}

// ── Default key mappings ────────────────────────────────────────────────────

const DEFAULT_P1_MAPPING: KeyMapping = {
  up: "ArrowUp",
  down: "ArrowDown",
  left: "ArrowLeft",
  right: "ArrowRight",
  button1: "KeyA",    // LP
  button2: "KeyS",    // MP
  button3: "KeyD",    // HP
  button4: "KeyZ",    // LK
  button5: "KeyX",    // MK
  button6: "KeyC",    // HK
  start: "Enter",
  coin: "Digit5",
};

const DEFAULT_P2_MAPPING: KeyMapping = {
  up: "KeyI",
  down: "KeyK",
  left: "KeyJ",
  right: "KeyL",
  button1: "KeyT",
  button2: "KeyY",
  button3: "KeyU",
  button4: "KeyG",
  button5: "KeyH",
  button6: "KeyN",
  start: "Digit2",
  coin: "Digit6",
};

// ── Standard gamepad button indices (W3C Standard Gamepad) ──────────────────

const GP_DPAD_UP = 12;
const GP_DPAD_DOWN = 13;
const GP_DPAD_LEFT = 14;
const GP_DPAD_RIGHT = 15;
const GP_BUTTON_A = 0;   // LP
const GP_BUTTON_B = 1;   // MP
const GP_BUTTON_X = 2;   // HP
const GP_BUTTON_Y = 3;   // LK
const GP_BUTTON_LB = 4;  // MK
const GP_BUTTON_RB = 5;  // HK
const GP_START = 9;
const GP_SELECT = 8;     // Coin

// Axis threshold for analog sticks used as d-pad
const AXIS_THRESHOLD = 0.5;

// ── Input Manager ───────────────────────────────────────────────────────────

export class InputManager {
  private keyState: Set<string> = new Set();
  private mappings: [KeyMapping, KeyMapping];
  private _debugInputCount = 0;
  private gamepadIndices: [number | null, number | null] = [null, null];

  private boundKeyDown: (e: KeyboardEvent) => void;
  private boundKeyUp: (e: KeyboardEvent) => void;
  private boundGamepadConnected: (e: GamepadEvent) => void;
  private boundGamepadDisconnected: (e: GamepadEvent) => void;

  constructor() {
    this.mappings = [
      { ...DEFAULT_P1_MAPPING },
      { ...DEFAULT_P2_MAPPING },
    ];

    this.boundKeyDown = this.onKeyDown.bind(this);
    this.boundKeyUp = this.onKeyUp.bind(this);
    this.boundGamepadConnected = this.onGamepadConnected.bind(this);
    this.boundGamepadDisconnected = this.onGamepadDisconnected.bind(this);

    window.addEventListener("keydown", this.boundKeyDown);
    window.addEventListener("keyup", this.boundKeyUp);
    window.addEventListener("gamepadconnected", this.boundGamepadConnected);
    window.addEventListener("gamepaddisconnected", this.boundGamepadDisconnected);
  }

  /**
   * Read one of the 3 CPS1 I/O ports.
   *
   * Returns an 8-bit value (active-LOW: 0 = pressed, 1 = released).
   *   port 0 : IN0 low byte  (P1 directions + buttons 1-3)
   *   port 1 : IN0 high byte (P1 buttons 4-6)
   *   port 2 : IN1 low byte  (P2 directions + buttons 1-3)
   *   port 3 : IN1 high byte (P2 buttons 4-6)
   *   port 4 : IN2           (coins, starts, service, test)
   *
   * The bus reads 16-bit words, so:
   *   read16(0x800140) = (port0 << 8) | port1  →  IN0
   *   read16(0x800142) = (port2 << 8) | port3  →  IN1
   *   read16(0x800144) = (port4 << 8) | 0xFF   →  IN2
   */
  readPort(port: number): number {
    switch (port) {
      case 0: return this.readPlayerLow(0);
      case 1: return this.readPlayerHigh(0);
      case 2: return this.readPlayerLow(1);
      case 3: return this.readPlayerHigh(1);
      case 4: return this.readSystem();
      default: return 0xFF;
    }
  }

  /**
   * Reconfigure key mapping for a player (0 = P1, 1 = P2).
   */
  setKeyMapping(player: number, mapping: KeyMapping): void {
    if (player === 0 || player === 1) {
      this.mappings[player] = { ...mapping };
    }
  }

  /**
   * Get current key mapping for a player.
   */
  getKeyMapping(player: number): KeyMapping {
    return { ...this.mappings[player === 1 ? 1 : 0] };
  }

  /**
   * Update all I/O port bytes on the bus in one call.
   * Call this once per frame before the 68000 runs.
   */
  updateBusPorts(ioPorts: Uint8Array): void {
    // Bus layout (matching MAME cps1.cpp):
    //   0x800000-0x800007 = IN1 → ioPorts[0..7]
    //     byte 0: P1 directions + buttons 1-3
    //     byte 1: P1 buttons 4-6
    //     byte 2: P2 directions + buttons 1-3
    //     byte 3: P2 buttons 4-6
    //   0x800018-0x80001F = system/DIP → ioPorts[8..15]
    //     byte 8: coins, starts, service

    // IN1 at 0x800000-0x800003 (big-endian 68000):
    //   read16(0x800000) = P1 directions/buttons (IN1 in MAME)
    //   read16(0x800002) = P2 directions/buttons
    // In big-endian: byte at even address = high byte, odd address = low byte
    // MAME returns player data as full 16-bit: (P1_low_byte << 8) | P1_high_byte
    // But the 68000 does byte reads too, so:
    //   0x800000 = P1 directions + btn1-3
    //   0x800001 = P1 btn4-6
    //   0x800002 = P2 directions + btn1-3
    //   0x800003 = P2 btn4-6
    // 68000 big-endian: read16(0x800000) = (byte0 << 8) | byte1
    // MAME "IN1" port: P1 = bits 0-7 (low byte), P2 = bits 8-15 (high byte)
    // So byte at 0x800000 (even) = P2, byte at 0x800001 (odd) = P1
    ioPorts[0] = this.readPort(2);  // P2 directions + buttons 1-3 (high byte)
    ioPorts[1] = this.readPort(0);  // P1 directions + buttons 1-3 (low byte)
    ioPorts[2] = this.readPort(3);  // P2 buttons 4-6
    ioPorts[3] = this.readPort(1);  // P1 buttons 4-6

    // System inputs at 0x800018 (via cps1_dsw_r):
    // Returns (IN0 << 8) | 0xFF — IN0 at even address (high byte)
    ioPorts[8] = this.readPort(4);  // coins, starts, service (high byte)
    ioPorts[9] = 0xFF;              // low byte = 0xFF
  }

  /**
   * Remove all event listeners. Call when destroying the emulator.
   */
  destroy(): void {
    window.removeEventListener("keydown", this.boundKeyDown);
    window.removeEventListener("keyup", this.boundKeyUp);
    window.removeEventListener("gamepadconnected", this.boundGamepadConnected);
    window.removeEventListener("gamepaddisconnected", this.boundGamepadDisconnected);
  }

  // ── Private: keyboard events ──────────────────────────────────────────────

  private onKeyDown(e: KeyboardEvent): void {
    // Prevent browser defaults for mapped keys (arrows, etc.)
    if (this.isMappedKey(e.code)) {
      e.preventDefault();
    }
    this.keyState.add(e.code);
  }

  private onKeyUp(e: KeyboardEvent): void {
    this.keyState.delete(e.code);
  }

  private isMappedKey(code: string): boolean {
    for (const m of this.mappings) {
      if (
        code === m.up || code === m.down || code === m.left || code === m.right ||
        code === m.button1 || code === m.button2 || code === m.button3 ||
        code === m.button4 || code === m.button5 || code === m.button6 ||
        code === m.start || code === m.coin
      ) {
        return true;
      }
    }
    return false;
  }

  // ── Private: gamepad events ───────────────────────────────────────────────

  private onGamepadConnected(e: GamepadEvent): void {
    if (this.gamepadIndices[0] === null) {
      this.gamepadIndices[0] = e.gamepad.index;
    } else if (this.gamepadIndices[1] === null) {
      this.gamepadIndices[1] = e.gamepad.index;
    }
  }

  private onGamepadDisconnected(e: GamepadEvent): void {
    if (this.gamepadIndices[0] === e.gamepad.index) {
      this.gamepadIndices[0] = null;
    } else if (this.gamepadIndices[1] === e.gamepad.index) {
      this.gamepadIndices[1] = null;
    }
  }

  private getGamepad(player: number): Gamepad | null {
    const idx = this.gamepadIndices[player === 1 ? 1 : 0];
    if (idx === null) return null;
    const gamepads = navigator.getGamepads();
    return gamepads[idx] ?? null;
  }

  // ── Private: read port logic ──────────────────────────────────────────────

  /**
   * Read the low byte of INx (directions + buttons 1-3).
   * Active-LOW: start with 0xFF, clear bits for pressed buttons.
   */
  private readPlayerLow(player: number): number {
    let value = 0xFF;
    const m = this.mappings[player === 1 ? 1 : 0];
    const gp = this.getGamepad(player);

    // Bit 0: Right
    if (this.keyState.has(m.right) || this.isGamepadRight(gp)) {
      value &= ~(1 << 0);
    }
    // Bit 1: Left
    if (this.keyState.has(m.left) || this.isGamepadLeft(gp)) {
      value &= ~(1 << 1);
    }
    // Bit 2: Down
    if (this.keyState.has(m.down) || this.isGamepadDown(gp)) {
      value &= ~(1 << 2);
    }
    // Bit 3: Up
    if (this.keyState.has(m.up) || this.isGamepadUp(gp)) {
      value &= ~(1 << 3);
    }
    // Bit 4: Button 1 (LP)
    if (this.keyState.has(m.button1) || this.isGamepadButton(gp, GP_BUTTON_A)) {
      value &= ~(1 << 4);
    }
    // Bit 5: Button 2 (MP)
    if (this.keyState.has(m.button2) || this.isGamepadButton(gp, GP_BUTTON_B)) {
      value &= ~(1 << 5);
    }
    // Bit 6: Button 3 (HP)
    if (this.keyState.has(m.button3) || this.isGamepadButton(gp, GP_BUTTON_X)) {
      value &= ~(1 << 6);
    }
    // Bit 7: unused — stays 1

    return value;
  }

  /**
   * Read the high byte of INx (buttons 4-6).
   * Active-LOW.
   */
  private readPlayerHigh(player: number): number {
    let value = 0xFF;
    const m = this.mappings[player === 1 ? 1 : 0];
    const gp = this.getGamepad(player);

    // Bit 0: Button 4 (LK)
    if (this.keyState.has(m.button4) || this.isGamepadButton(gp, GP_BUTTON_Y)) {
      value &= ~(1 << 0);
    }
    // Bit 1: Button 5 (MK)
    if (this.keyState.has(m.button5) || this.isGamepadButton(gp, GP_BUTTON_LB)) {
      value &= ~(1 << 1);
    }
    // Bit 2: Button 6 (HK)
    if (this.keyState.has(m.button6) || this.isGamepadButton(gp, GP_BUTTON_RB)) {
      value &= ~(1 << 2);
    }
    // Bits 3-7: unused — stay 1

    return value;
  }

  /**
   * Read the system port IN2 (coins, starts, service, test).
   * Active-LOW.
   */
  private readSystem(): number {
    let value = 0xFF;

    // P1 mappings for coin/start P1, P2 mappings for coin/start P2
    const m1 = this.mappings[0];
    const m2 = this.mappings[1];
    const gp1 = this.getGamepad(0);
    const gp2 = this.getGamepad(1);

    // Bit 0: Coin 1
    if (this.keyState.has(m1.coin) || this.isGamepadButton(gp1, GP_SELECT)) {
      value &= ~(1 << 0);
    }
    // Bit 1: Coin 2
    if (this.keyState.has(m2.coin) || this.isGamepadButton(gp2, GP_SELECT)) {
      value &= ~(1 << 1);
    }
    // Bit 2: Service — not mapped
    // Bit 3: Unknown
    // Bit 4: Start 1
    if (this.keyState.has(m1.start) || this.isGamepadButton(gp1, GP_START)) {
      value &= ~(1 << 4);
    }
    // Bit 5: Start 2
    if (this.keyState.has(m2.start) || this.isGamepadButton(gp2, GP_START)) {
      value &= ~(1 << 5);
    }
    // Bits 6-7: unused — stay 1

    return value;
  }

  // ── Private: gamepad helpers ──────────────────────────────────────────────

  private isGamepadButton(gp: Gamepad | null, index: number): boolean {
    if (gp === null) return false;
    const btn = gp.buttons[index];
    return btn !== undefined && btn.pressed;
  }

  private isGamepadUp(gp: Gamepad | null): boolean {
    if (gp === null) return false;
    // D-pad button
    if (this.isGamepadButton(gp, GP_DPAD_UP)) return true;
    // Left stick Y axis (negative = up)
    const axis = gp.axes[1];
    return axis !== undefined && axis < -AXIS_THRESHOLD;
  }

  private isGamepadDown(gp: Gamepad | null): boolean {
    if (gp === null) return false;
    if (this.isGamepadButton(gp, GP_DPAD_DOWN)) return true;
    const axis = gp.axes[1];
    return axis !== undefined && axis > AXIS_THRESHOLD;
  }

  private isGamepadLeft(gp: Gamepad | null): boolean {
    if (gp === null) return false;
    if (this.isGamepadButton(gp, GP_DPAD_LEFT)) return true;
    const axis = gp.axes[0];
    return axis !== undefined && axis < -AXIS_THRESHOLD;
  }

  private isGamepadRight(gp: Gamepad | null): boolean {
    if (gp === null) return false;
    if (this.isGamepadButton(gp, GP_DPAD_RIGHT)) return true;
    const axis = gp.axes[0];
    return axis !== undefined && axis > AXIS_THRESHOLD;
  }
}
