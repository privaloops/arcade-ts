/**
 * Player → device assignment storage.
 *
 * The engine's InputManager persists this under `cps1-gamepad-devices`
 * as `[p1GamepadId | null, p2GamepadId | null]`. `null` means "this
 * player plays on keyboard". The frontend Settings tab writes to the
 * same key so assignments take effect on the next InputManager
 * construction (next game launch), same pattern as autofire-store.
 *
 * We only deal with gamepad *ids* here; the engine rematches the id to
 * a live `navigator.getGamepads()` index at connection time.
 */

import type { PlayerIndex } from "./autofire-store";

const STORAGE_KEY = "cps1-gamepad-devices";

export type DeviceKind = "keyboard" | "gamepad";

export interface PlayerAssignment {
  kind: DeviceKind;
  /** Only meaningful when kind === "gamepad". */
  gamepadId: string | null;
}

export const DEFAULT_ASSIGNMENT: PlayerAssignment = { kind: "keyboard", gamepadId: null };

type StoredTuple = [string | null, string | null];

function readRaw(): StoredTuple {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return [null, null];
    const parsed = JSON.parse(raw) as unknown;
    if (!Array.isArray(parsed)) return [null, null];
    return [
      typeof parsed[0] === "string" ? parsed[0] : null,
      typeof parsed[1] === "string" ? parsed[1] : null,
    ];
  } catch {
    return [null, null];
  }
}

function writeRaw(tuple: StoredTuple): void {
  try { localStorage.setItem(STORAGE_KEY, JSON.stringify(tuple)); } catch { /* quota */ }
}

function fromSlot(id: string | null): PlayerAssignment {
  if (id === null) return { ...DEFAULT_ASSIGNMENT };
  return { kind: "gamepad", gamepadId: id };
}

export function loadPlayerAssignments(): [PlayerAssignment, PlayerAssignment] {
  const [p1, p2] = readRaw();
  return [fromSlot(p1), fromSlot(p2)];
}

export function loadPlayerAssignment(player: PlayerIndex): PlayerAssignment {
  return loadPlayerAssignments()[player];
}

export function savePlayerAssignment(player: PlayerIndex, assignment: PlayerAssignment): void {
  const current = readRaw();
  const slot = assignment.kind === "gamepad" ? assignment.gamepadId : null;
  current[player] = slot;
  // A single gamepad can't drive both players — if we just pinned a
  // gamepad to this slot, clear any duplicate assignment on the other.
  const other: PlayerIndex = player === 0 ? 1 : 0;
  if (slot !== null && current[other] === slot) {
    current[other] = null;
  }
  writeRaw(current);
}

/**
 * Convenience: list connected gamepads as `{ index, id }` for UI
 * dropdowns. Filters out null slots that `navigator.getGamepads()`
 * returns for disconnected indices.
 */
export function listConnectedGamepads(): Array<{ index: number; id: string }> {
  if (typeof navigator === "undefined" || !navigator.getGamepads) return [];
  const raw = navigator.getGamepads();
  const out: Array<{ index: number; id: string }> = [];
  for (const gp of raw) {
    if (gp && gp.connected) out.push({ index: gp.index, id: gp.id });
  }
  return out;
}

/** Friendly short name — strips the vendor/product id from gamepad.id. */
export function prettyGamepadName(id: string): string {
  const paren = id.indexOf(" (");
  return (paren >= 0 ? id.slice(0, paren) : id).trim();
}
