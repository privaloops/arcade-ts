/**
 * Save State — serialize/deserialize emulator state to/from localStorage.
 *
 * 4 slots per game, keyed by game name. Each slot stores a complete
 * snapshot of CPUs, RAM, VRAM, registers, and audio chip state.
 */

import type { CpuState } from './cpu/m68000';
import type { Z80State } from './cpu/z80';
import type { Z80BusState } from './memory/z80-bus';
import type { OKI6295State } from './audio/oki6295';

// ── Save State format ────────────────────────────────────────────────────

const SAVE_STATE_VERSION = 1;
const NUM_SLOTS = 4;

export interface SaveState {
  version: number;
  gameName: string;
  timestamp: number;
  m68k: CpuState;
  z80: Z80State;
  workRam: string;       // base64
  vram: string;          // base64
  cpsaRegs: string;      // base64
  cpsbRegs: string;      // base64
  ioPorts: string;       // base64
  coinCtrl: string;      // base64
  z80WorkRam: string;    // base64
  z80Bus: Z80BusState;
  oki: OKI6295State | null;
  objBuffer: string;     // base64
  frameCount: number;
  audioWorkerState?: Record<string, unknown> | null;
}

export interface SlotInfo {
  gameName: string;
  timestamp: number;
}

// ── Base64 helpers ────────────────────────────────────────────────────────

export function bufToB64(buf: Uint8Array): string {
  let binary = '';
  for (let i = 0; i < buf.length; i++) {
    binary += String.fromCharCode(buf[i]!);
  }
  return btoa(binary);
}

export function b64ToBuf(b64: string): Uint8Array {
  const binary = atob(b64);
  const buf = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) {
    buf[i] = binary.charCodeAt(i);
  }
  return buf;
}

// ── Int32Array base64 helpers ─────────────────────────────────────────────

function int32ArrayToB64(arr: Int32Array): string {
  return bufToB64(new Uint8Array(arr.buffer, arr.byteOffset, arr.byteLength));
}

function b64ToInt32Array(b64: string): Int32Array {
  const buf = b64ToBuf(b64);
  return new Int32Array(buf.buffer, buf.byteOffset, buf.byteLength / 4);
}

// ── Slot key ──────────────────────────────────────────────────────────────

function slotKey(slot: number): string {
  return `cps1-save-${slot}`;
}

// ── Public API ────────────────────────────────────────────────────────────

/**
 * Serialize CpuState for JSON (Int32Arrays → base64).
 */
function serializeCpuState(state: CpuState): Record<string, unknown> {
  return {
    ...state,
    d: int32ArrayToB64(state.d),
    a: int32ArrayToB64(state.a),
  };
}

function deserializeCpuState(raw: Record<string, unknown>): CpuState {
  return {
    ...raw,
    d: b64ToInt32Array(raw["d"] as string),
    a: b64ToInt32Array(raw["a"] as string),
  } as CpuState;
}

/**
 * Save a state to a localStorage slot.
 */
export function saveToSlot(slot: number, state: SaveState): boolean {
  // Serialize CpuState Int32Arrays to base64 for JSON
  const serializable = {
    ...state,
    m68k: serializeCpuState(state.m68k),
  };

  try {
    const json = JSON.stringify(serializable);
    localStorage.setItem(slotKey(slot), json);
    return true;
  } catch {
    console.error('Save state failed — localStorage may be full');
    return false;
  }
}

/**
 * Load a state from a localStorage slot.
 */
export function loadFromSlot(slot: number): SaveState | null {
  try {
    const json = localStorage.getItem(slotKey(slot));
    if (!json) return null;
    const raw = JSON.parse(json) as Record<string, unknown>;
    if ((raw["version"] as number) !== SAVE_STATE_VERSION) return null;

    // Validate required fields before casting
    if (typeof raw["gameName"] !== 'string' ||
        typeof raw["timestamp"] !== 'number' ||
        typeof raw["workRam"] !== 'string' ||
        typeof raw["vram"] !== 'string' ||
        !raw["m68k"] || !raw["z80"]) {
      return null;
    }

    // Deserialize CpuState
    raw["m68k"] = deserializeCpuState(raw["m68k"] as Record<string, unknown>);

    return raw as unknown as SaveState;
  } catch {
    return null;
  }
}

/**
 * Get slot metadata without loading the full state.
 */
export function getSlotInfo(slot: number): SlotInfo | null {
  try {
    const json = localStorage.getItem(slotKey(slot));
    if (!json) return null;
    // Parse just enough to get metadata
    const raw = JSON.parse(json) as Record<string, unknown>;
    if ((raw["version"] as number) !== SAVE_STATE_VERSION) return null;
    return {
      gameName: raw["gameName"] as string,
      timestamp: raw["timestamp"] as number,
    };
  } catch {
    return null;
  }
}

/**
 * Delete a slot.
 */
export function deleteSlot(slot: number): void {
  localStorage.removeItem(slotKey(slot));
}

/**
 * Get the number of available slots.
 */
export function getNumSlots(): number {
  return NUM_SLOTS;
}

// ── Buffer-based API (arcade frontend / IndexedDB) ───────────────────────

/**
 * Serialize a SaveState to an opaque ArrayBuffer. Mirrors the JSON shape
 * used by saveToSlot() so captures taken from one channel can be
 * re-imported via the other.
 */
export function serializeSaveState(state: SaveState): ArrayBuffer {
  const serializable = { ...state, m68k: serializeCpuState(state.m68k) };
  const json = JSON.stringify(serializable);
  return new TextEncoder().encode(json).buffer as ArrayBuffer;
}

export function deserializeSaveState(buf: ArrayBuffer): SaveState | null {
  try {
    const json = new TextDecoder().decode(new Uint8Array(buf));
    const raw = JSON.parse(json) as Record<string, unknown>;
    if ((raw["version"] as number) !== SAVE_STATE_VERSION) return null;
    if (typeof raw["gameName"] !== 'string' ||
        typeof raw["timestamp"] !== 'number' ||
        typeof raw["workRam"] !== 'string' ||
        typeof raw["vram"] !== 'string' ||
        !raw["m68k"] || !raw["z80"]) {
      return null;
    }
    raw["m68k"] = deserializeCpuState(raw["m68k"] as Record<string, unknown>);
    return raw as unknown as SaveState;
  } catch {
    return null;
  }
}

export { SAVE_STATE_VERSION };
