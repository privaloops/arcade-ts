import type { CharacterId } from '../types';

/**
 * Map each animation-pointer signature to a human-readable move name.
 *
 * In SF2 there is no single "move id" byte. Each character's current
 * move is identified by a 32-bit big-endian pointer at P1_BASE+0x1A,
 * which points into the animation-frame table. The pointer's value at
 * the frame where `attacking` transitions to true = the move signature.
 *
 * Tables are built by in-game calibration — see CALIBRATION.md.
 *
 * Multi-frame animations advance the pointer by +0x18 per frame, so
 * only the STARTUP pointer is canonical. Any pointer matching
 * `base + k*0x18` for small k is the same move mid-animation; we only
 * store the startup values and callers match on exact equality.
 */

const RYU_MOVES: Record<number, string> = {
  // Standing normals
  0x0005FBA2: 'standing jab',
  0x0005FCCA: 'standing strong',
  0x0005FDF2: 'standing fierce',
  0x0005FF02: 'standing short',
  0x00060012: 'standing forward',
  0x00060122: 'standing roundhouse',

  // Crouching normals (partial)
  0x000601B6: 'crouching jab',
  0x0006043A: 'sweep',        // crouching roundhouse (HK + DOWN)

  // Jumping normals (partial)
  0x000607FE: 'jumping jab',
  0x00060832: 'jumping strong',
  0x000608DE: 'jumping fierce',

  // Specials — Hadouken (qcf+P)
  0x00060CCE: 'Hadouken jab',
  0x00060D32: 'Hadouken strong',
  0x00060D96: 'Hadouken fierce',

  // Specials — Shoryuken (F,D,DF+P)
  0x00060DFA: 'Shoryuken jab',
  0x00060EA6: 'Shoryuken strong',
  0x00060F52: 'Shoryuken fierce',

  // Specials — Tatsumaki (qcb+K). All 3 forces share the same startup
  // pointer and diverge at frame 3-4 of the active phase; we only label
  // the startup for the MVP.
  0x00060FFE: 'Tatsumaki',
};

const HONDA_MOVES: Record<number, string> = {
  // Calibration pending — run the demo in 2P vs Honda and log P2 anim_ptr.
};

const BISON_MOVES: Record<number, string> = {
  // Calibration pending — 2P mode with Bison on P2 side.
};

const CHARACTER_MOVE_TABLES: Partial<Record<CharacterId, Record<number, string>>> = {
  ryu: RYU_MOVES,
  'e-honda': HONDA_MOVES,
  bison: BISON_MOVES,
};

/** Resolve an animation-pointer signature to a move name, or null if unknown. */
export function moveName(charId: CharacterId, animPtr: number): string | null {
  const table = CHARACTER_MOVE_TABLES[charId];
  return table?.[animPtr] ?? null;
}

/** Pretty label used in prompts — includes the ptr so Claude can cross-check. */
export function formatMove(charId: CharacterId, animPtr: number): string {
  const name = moveName(charId, animPtr);
  const ptrHex = `0x${animPtr.toString(16).toUpperCase().padStart(8, '0')}`;
  return name ? `${name} (${ptrHex})` : `unknown move (${ptrHex})`;
}
