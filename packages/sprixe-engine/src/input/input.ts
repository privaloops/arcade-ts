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

export const DEFAULT_P1_MAPPING: KeyMapping = {
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

export const DEFAULT_P2_MAPPING: KeyMapping = {
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

// ── Gamepad mapping types ────────────────────────────────────────────────────

export interface GamepadMapping {
  up: number;
  down: number;
  left: number;
  right: number;
  button1: number;  // LP
  button2: number;  // MP
  button3: number;  // HP
  button4: number;  // LK
  button5: number;  // MK
  button6: number;  // HK
  start: number;
  coin: number;
}

export type AutofireKey = "button1" | "button2" | "button3" | "button4" | "button5" | "button6";
const AUTOFIRE_KEYS: AutofireKey[] = ["button1", "button2", "button3", "button4", "button5", "button6"];
const AUTOFIRE_STORAGE_P1 = "cps1-autofire-p1";
const AUTOFIRE_STORAGE_P2 = "cps1-autofire-p2";
const AUTOFIRE_PERIOD = 2; // toggle every N frames (~30Hz at 60fps)

export const DEFAULT_GP_MAPPING: GamepadMapping = {
  up: 12,       // D-pad Up
  down: 13,     // D-pad Down
  left: 14,     // D-pad Left
  right: 15,    // D-pad Right
  button1: 0,   // A → LP
  button2: 1,   // B → MP
  button3: 2,   // X → HP
  button4: 3,   // Y → LK
  button5: 4,   // LB → MK
  button6: 5,   // RB → HK
  start: 9,     // Start
  coin: 8,      // Select → Coin
};

const GP_STORAGE_KEY_P1 = "cps1-gamepad-p1";
const GP_STORAGE_KEY_P2 = "cps1-gamepad-p2";

// Axis threshold for analog sticks used as d-pad
const AXIS_THRESHOLD = 0.5;

// ── Input Manager ───────────────────────────────────────────────────────────

export class InputManager {
  private keyState: Set<string> = new Set();
  private mappings: [KeyMapping, KeyMapping];
  private gamepadMappings: [GamepadMapping, GamepadMapping];
  private autofireFlags: [Set<AutofireKey>, Set<AutofireKey>];
  private autofireCounter = 0;
  // Device assignment per player: null = keyboard only, number = gamepad index
  private playerGamepad: [number | null, number | null] = [null, null];
  // Saved gamepad IDs for reconnection matching
  private savedGamepadIds: [string | null, string | null] = [null, null];
  // Track connected gamepads (gamepadconnected events) since navigator.getGamepads()
  // requires user interaction before returning non-null entries
  private knownGamepads = new Map<number, string>(); // index → short id

  private boundKeyDown: (e: KeyboardEvent) => void;
  private boundKeyUp: (e: KeyboardEvent) => void;
  private boundGamepadConnected: (e: GamepadEvent) => void;
  private boundGamepadDisconnected: (e: GamepadEvent) => void;
  private boundBlur: () => void;

  constructor() {
    this.mappings = [
      { ...DEFAULT_P1_MAPPING },
      { ...DEFAULT_P2_MAPPING },
    ];

    this.gamepadMappings = [
      this.loadGamepadMapping(GP_STORAGE_KEY_P1),
      this.loadGamepadMapping(GP_STORAGE_KEY_P2),
    ];

    this.autofireFlags = [
      this.loadAutofire(AUTOFIRE_STORAGE_P1),
      this.loadAutofire(AUTOFIRE_STORAGE_P2),
    ];

    // Restore saved gamepad IDs for reconnection matching
    try {
      const raw = localStorage.getItem("cps1-gamepad-devices");
      if (raw) this.savedGamepadIds = JSON.parse(raw) as [string | null, string | null];
    } catch { /* corrupted */ }

    this.boundKeyDown = this.onKeyDown.bind(this);
    this.boundKeyUp = this.onKeyUp.bind(this);
    this.boundGamepadConnected = this.onGamepadConnected.bind(this);
    this.boundGamepadDisconnected = this.onGamepadDisconnected.bind(this);
    this.boundBlur = this.onBlur.bind(this);

    window.addEventListener("keydown", this.boundKeyDown);
    window.addEventListener("keyup", this.boundKeyUp);
    window.addEventListener("gamepadconnected", this.boundGamepadConnected);
    window.addEventListener("gamepaddisconnected", this.boundGamepadDisconnected);
    // Clear all stuck keys when page loses focus (alt-tab, DevTools, etc.)
    window.addEventListener("blur", this.boundBlur);
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
   * Reconfigure gamepad mapping for a player (0 = P1, 1 = P2).
   * Persists to localStorage.
   */
  setGamepadMapping(player: number, mapping: GamepadMapping): void {
    const idx = player === 1 ? 1 : 0;
    this.gamepadMappings[idx] = { ...mapping };
    const key = idx === 0 ? GP_STORAGE_KEY_P1 : GP_STORAGE_KEY_P2;
    try { localStorage.setItem(key, JSON.stringify(mapping)); } catch { /* quota */ }
  }

  /**
   * Get current gamepad mapping for a player.
   */
  getGamepadMapping(player: number): GamepadMapping {
    return { ...this.gamepadMappings[player === 1 ? 1 : 0] };
  }

  /**
   * Set autofire state for a button.
   */
  setAutofire(player: number, key: AutofireKey, enabled: boolean): void {
    const idx = player === 1 ? 1 : 0;
    if (enabled) {
      this.autofireFlags[idx].add(key);
    } else {
      this.autofireFlags[idx].delete(key);
    }
    const storageKey = idx === 0 ? AUTOFIRE_STORAGE_P1 : AUTOFIRE_STORAGE_P2;
    try { localStorage.setItem(storageKey, JSON.stringify([...this.autofireFlags[idx]])); } catch { /* quota */ }
  }

  /**
   * Get autofire flags for a player.
   */
  getAutofireFlags(player: number): Set<AutofireKey> {
    return new Set(this.autofireFlags[player === 1 ? 1 : 0]);
  }

  /**
   * Advance the autofire counter by one frame. `isPressed()` uses this
   * to toggle auto-fired buttons on/off every AUTOFIRE_PERIOD frames.
   * CPS-1 drives this from `updateBusPorts`; Neo-Geo has its own port
   * layout and must call `tickAutofire()` explicitly from its own
   * per-frame input refresh.
   */
  tickAutofire(): void {
    this.autofireCounter++;
  }

  /**
   * Update all I/O port bytes on the bus in one call.
   * Call this once per frame before the 68000 runs.
   */
  updateBusPorts(ioPorts: Uint8Array, cpsbRegs?: Uint8Array): void {
    this.tickAutofire();
    // IN1 at 0x800000-0x800007 (MAME: map(0x800000, 0x800007).portr("IN1"))
    // 16-bit port: P2 = high byte (even addr), P1 = low byte (odd addr)
    // Mirrored across 4 word positions.
    const p2Lo = this.readPort(2); // P2 directions + buttons 1-3
    const p1Lo = this.readPort(0); // P1 directions + buttons 1-3
    ioPorts[0] = p2Lo;  // 0x800000 (high byte = P2)
    ioPorts[1] = p1Lo;  // 0x800001 (low byte = P1)
    ioPorts[2] = p2Lo;  // 0x800002 mirror
    ioPorts[3] = p1Lo;  // 0x800003 mirror
    ioPorts[4] = p2Lo;  // 0x800004 mirror
    ioPorts[5] = p1Lo;  // 0x800005 mirror
    ioPorts[6] = p2Lo;  // 0x800006 mirror
    ioPorts[7] = p1Lo;  // 0x800007 mirror

    // System inputs at 0x800018 (via cps1_dsw_r):
    ioPorts[8] = this.readPort(4);  // coins, starts, service (high byte)
    ioPorts[9] = 0xFF;              // low byte = 0xFF

    // Extra buttons (4-6 / kicks) → CPS-B register at offset 0x36 (addr 0x800176)
    // MAME: cps1_in2_r / cps_b_r reads this as 16-bit: P2 high | P1 low
    if (cpsbRegs) {
      const p1Hi = this.readPort(1); // P1 buttons 4-6
      const p2Hi = this.readPort(3); // P2 buttons 4-6
      cpsbRegs[0x36] = p2Hi;  // high byte = P2 kicks
      cpsbRegs[0x37] = p1Hi;  // low byte = P1 kicks
    }
  }

  /**
   * Remove all event listeners. Call when destroying the emulator.
   */
  destroy(): void {
    window.removeEventListener("keydown", this.boundKeyDown);
    window.removeEventListener("keyup", this.boundKeyUp);
    window.removeEventListener("gamepadconnected", this.boundGamepadConnected);
    window.removeEventListener("gamepaddisconnected", this.boundGamepadDisconnected);
    window.removeEventListener("blur", this.boundBlur);
  }

  // ── Private: keyboard events ──────────────────────────────────────────────

  private onKeyDown(e: KeyboardEvent): void {
    // Prevent browser defaults for mapped keys (arrows, etc.)
    if (this.isMappedKey(e.code)) {
      e.preventDefault();
    }
    this.keyState.add(e.code);
    this.updateDebugOverlay();
  }

  private onKeyUp(e: KeyboardEvent): void {
    this.keyState.delete(e.code);
    this.updateDebugOverlay();
  }

  private onBlur(): void {
    this.keyState.clear();
    this.updateDebugOverlay();
  }

  // ── Debug overlay: shows currently pressed keys ─────────────────────────

  private debugOverlay: HTMLDivElement | null = null;

  enableDebugOverlay(): void {
    if (this.debugOverlay) return;
    this.debugOverlay = document.createElement('div');
    this.debugOverlay.style.cssText = 'position:fixed;top:8px;left:8px;background:rgba(0,0,0,0.8);color:#0f0;font:12px monospace;padding:6px 10px;z-index:9999;pointer-events:none;min-width:150px;';
    this.debugOverlay.textContent = 'Keys: (none)';
    document.body.appendChild(this.debugOverlay);
  }

  private updateDebugOverlay(): void {
    if (!this.debugOverlay) return;
    const keys = [...this.keyState];
    this.debugOverlay.textContent = keys.length > 0
      ? `Keys: ${keys.join(' + ')}`
      : 'Keys: (none)';
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
    const idx = e.gamepad.index;
    const gpId = e.gamepad.id;
    this.knownGamepads.set(idx, gpId.split("(")[0]!.trim());
    // If already assigned somewhere, don't touch
    if (this.playerGamepad[0] === idx || this.playerGamepad[1] === idx) return;
    // Try to match saved gamepad ID first
    for (const p of [0, 1] as const) {
      if (this.playerGamepad[p] === null && this.savedGamepadIds[p] && gpId === this.savedGamepadIds[p]) {
        this.setPlayerGamepad(p, idx);
        return;
      }
    }
    // Auto-assign to first player without a gamepad
    if (this.playerGamepad[0] === null) {
      this.setPlayerGamepad(0, idx);
    } else if (this.playerGamepad[1] === null) {
      this.setPlayerGamepad(1, idx);
    }
  }

  private onGamepadDisconnected(e: GamepadEvent): void {
    this.knownGamepads.delete(e.gamepad.index);
    if (this.playerGamepad[0] === e.gamepad.index) this.playerGamepad[0] = null;
    if (this.playerGamepad[1] === e.gamepad.index) this.playerGamepad[1] = null;
  }

  private getGamepad(player: number): Gamepad | null {
    const playerIdx = player === 1 ? 1 : 0;
    const idx = this.playerGamepad[playerIdx];
    const gamepads = navigator.getGamepads();
    if (idx !== null) return gamepads[idx] ?? null;
    // Fallback for P1 only: browsers fire `gamepadconnected` exactly
    // once per pad, so if our listener was attached after the first
    // press (e.g. InputManager is instantiated on game launch), the
    // event was missed and playerGamepad[0] stays null forever. Scan
    // the live gamepads list once — the first connected pad is
    // assigned lazily and pinned. P2 must stay unassigned (null →
    // keyboard-only) so a single pad doesn't drive both players.
    if (playerIdx !== 0) return null;
    const p2Idx = this.playerGamepad[1];
    for (const gp of gamepads) {
      if (!gp || gp.connected === false) continue;
      if (gp.index === p2Idx) continue; // already held by P2
      this.playerGamepad[0] = gp.index;
      this.knownGamepads.set(gp.index, (gp.id.split("(")[0] ?? gp.id).trim());
      return gp;
    }
    return null;
  }

  /** Assign a gamepad to a player. null = keyboard only. */
  setPlayerGamepad(player: number, gamepadIndex: number | null): void {
    const idx = player === 1 ? 1 : 0;
    this.playerGamepad[idx] = gamepadIndex;
    // Save the gamepad ID for reconnection matching
    if (gamepadIndex !== null) {
      const gamepads = navigator.getGamepads();
      const gp = gamepads[gamepadIndex];
      this.savedGamepadIds[idx] = gp?.id ?? null;
    } else {
      this.savedGamepadIds[idx] = null;
    }
    try { localStorage.setItem("cps1-gamepad-devices", JSON.stringify(this.savedGamepadIds)); } catch {}
  }

  /** Get assigned gamepad index for a player (null = keyboard only). */
  getPlayerGamepad(player: number): number | null {
    return this.playerGamepad[player === 1 ? 1 : 0];
  }

  /** Get saved gamepad ID for a player (for display before connection). */
  getSavedGamepadId(player: number): string | null {
    return this.savedGamepadIds[player === 1 ? 1 : 0];
  }

  /** List all connected gamepads (id + index). */
  getConnectedGamepads(): { index: number; id: string }[] {
    // Use knownGamepads (from events) as primary source,
    // supplemented by navigator.getGamepads() if available
    const result = new Map<number, string>();
    for (const [idx, id] of this.knownGamepads) {
      result.set(idx, id);
    }
    try {
      const gamepads = navigator.getGamepads();
      for (const gp of gamepads) {
        if (gp && !result.has(gp.index)) {
          result.set(gp.index, gp.id.split("(")[0]!.trim());
        }
      }
    } catch { /* Secure context required */ }
    return [...result.entries()].map(([index, id]) => ({ index, id }));
  }

  // ── Private: read port logic ──────────────────────────────────────────────

  /** Returns true if a button should register as pressed (respects autofire). */
  private isPressed(player: number, key: AutofireKey, raw: boolean): boolean {
    if (!raw) return false;
    if (this.autofireFlags[player === 1 ? 1 : 0].has(key)) {
      return Math.floor(this.autofireCounter / AUTOFIRE_PERIOD) % 2 === 0;
    }
    return true;
  }

  /**
   * Read the low byte of INx (directions + buttons 1-3).
   * Active-LOW: start with 0xFF, clear bits for pressed buttons.
   */
  private readPlayerLow(player: number): number {
    let value = 0xFF;
    const idx = player === 1 ? 1 : 0;
    const m = this.mappings[idx];
    const gm = this.gamepadMappings[idx];
    const gp = this.getGamepad(player);

    // Directions (no autofire)
    if (this.keyState.has(m.right) || this.isGamepadRight(gp, gm)) value &= ~(1 << 0);
    if (this.keyState.has(m.left) || this.isGamepadLeft(gp, gm))   value &= ~(1 << 1);
    if (this.keyState.has(m.down) || this.isGamepadDown(gp, gm))   value &= ~(1 << 2);
    if (this.keyState.has(m.up) || this.isGamepadUp(gp, gm))       value &= ~(1 << 3);

    // Buttons 1-3 (autofire-aware)
    if (this.isPressed(player, "button1", this.keyState.has(m.button1) || this.isGamepadButton(gp, gm.button1))) {
      value &= ~(1 << 4);
    }
    if (this.isPressed(player, "button2", this.keyState.has(m.button2) || this.isGamepadButton(gp, gm.button2))) {
      value &= ~(1 << 5);
    }
    if (this.isPressed(player, "button3", this.keyState.has(m.button3) || this.isGamepadButton(gp, gm.button3))) {
      value &= ~(1 << 6);
    }

    return value;
  }

  /**
   * Read the high byte of INx (buttons 4-6).
   * Active-LOW.
   */
  private readPlayerHigh(player: number): number {
    let value = 0xFF;
    const idx = player === 1 ? 1 : 0;
    const m = this.mappings[idx];
    const gm = this.gamepadMappings[idx];
    const gp = this.getGamepad(player);

    if (this.isPressed(player, "button4", this.keyState.has(m.button4) || this.isGamepadButton(gp, gm.button4))) {
      value &= ~(1 << 0);
    }
    if (this.isPressed(player, "button5", this.keyState.has(m.button5) || this.isGamepadButton(gp, gm.button5))) {
      value &= ~(1 << 1);
    }
    if (this.isPressed(player, "button6", this.keyState.has(m.button6) || this.isGamepadButton(gp, gm.button6))) {
      value &= ~(1 << 2);
    }

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
    const gm1 = this.gamepadMappings[0];
    const gm2 = this.gamepadMappings[1];
    const gp1 = this.getGamepad(0);
    const gp2 = this.getGamepad(1);

    // Bit 0: Coin 1
    if (this.keyState.has(m1.coin) || this.isGamepadButton(gp1, gm1.coin)) {
      value &= ~(1 << 0);
    }
    // Bit 1: Coin 2
    if (this.keyState.has(m2.coin) || this.isGamepadButton(gp2, gm2.coin)) {
      value &= ~(1 << 1);
    }
    // Bit 2: Service — not mapped
    // Bit 3: Unknown
    // Bit 4: Start 1
    if (this.keyState.has(m1.start) || this.isGamepadButton(gp1, gm1.start)) {
      value &= ~(1 << 4);
    }
    // Bit 5: Start 2
    if (this.keyState.has(m2.start) || this.isGamepadButton(gp2, gm2.start)) {
      value &= ~(1 << 5);
    }
    // Bits 6-7: unused — stay 1

    return value;
  }

  // ── Private: localStorage helpers ────────────────────────────────────────

  private loadGamepadMapping(key: string): GamepadMapping {
    try {
      const raw = localStorage.getItem(key);
      if (raw) {
        const parsed = JSON.parse(raw) as Record<string, unknown>;
        // Validate all expected keys are numbers
        const keys: (keyof GamepadMapping)[] = [
          "up", "down", "left", "right",
          "button1", "button2", "button3", "button4", "button5", "button6",
          "start", "coin",
        ];
        for (const k of keys) {
          if (typeof parsed[k] !== "number") return { ...DEFAULT_GP_MAPPING };
        }
        return parsed as unknown as GamepadMapping;
      }
    } catch { /* corrupted data */ }
    return { ...DEFAULT_GP_MAPPING };
  }

  private loadAutofire(key: string): Set<AutofireKey> {
    try {
      const raw = localStorage.getItem(key);
      if (raw) {
        const arr = JSON.parse(raw) as unknown[];
        const valid = new Set<AutofireKey>();
        for (const v of arr) {
          if (AUTOFIRE_KEYS.includes(v as AutofireKey)) valid.add(v as AutofireKey);
        }
        return valid;
      }
    } catch { /* corrupted data */ }
    return new Set();
  }

  // ── Private: gamepad helpers ──────────────────────────────────────────────

  private isGamepadButton(gp: Gamepad | null, index: number): boolean {
    if (gp === null) return false;
    const btn = gp.buttons[index];
    return btn !== undefined && btn.pressed;
  }

  private isGamepadUp(gp: Gamepad | null, gm: GamepadMapping): boolean {
    if (gp === null) return false;
    if (this.isGamepadButton(gp, gm.up)) return true;
    const axis = gp.axes[1];
    return axis !== undefined && axis < -AXIS_THRESHOLD;
  }

  private isGamepadDown(gp: Gamepad | null, gm: GamepadMapping): boolean {
    if (gp === null) return false;
    if (this.isGamepadButton(gp, gm.down)) return true;
    const axis = gp.axes[1];
    return axis !== undefined && axis > AXIS_THRESHOLD;
  }

  private isGamepadLeft(gp: Gamepad | null, gm: GamepadMapping): boolean {
    if (gp === null) return false;
    if (this.isGamepadButton(gp, gm.left)) return true;
    const axis = gp.axes[0];
    return axis !== undefined && axis < -AXIS_THRESHOLD;
  }

  private isGamepadRight(gp: Gamepad | null, gm: GamepadMapping): boolean {
    if (gp === null) return false;
    if (this.isGamepadButton(gp, gm.right)) return true;
    const axis = gp.axes[0];
    return axis !== undefined && axis > AXIS_THRESHOLD;
  }
}
