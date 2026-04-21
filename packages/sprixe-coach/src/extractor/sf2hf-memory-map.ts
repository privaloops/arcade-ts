/**
 * SF2 Hyper Fighting (sf2hf) — 68K Work RAM memory map.
 *
 * All addresses are within Work RAM: 0xFF0000 - 0xFFFFFF (64KB).
 * To index `emulator.getWorkRam()` (a 64KB Uint8Array), subtract 0xFF0000.
 *
 * Sources (all validated):
 *   - FBNeo cheats: https://github.com/finalburnneo/FBNeo-cheats/blob/master/cheats/sf2hf.ini
 *   - MAMECheat forum: mamecheat.co.uk (thread #4103, #12571, #12746)
 *
 * Player structs are at:
 *   P1 base = 0xFF83BE
 *   P2 base = 0xFF86BE   (P1 + 0x300 — "player_space offset" from hitbox viewer)
 *
 * CONFIDENCE:
 *   - "validated" : confirmed in FBNeo or MAMECheat cheat files
 *   - "probable"  : educated guess from player-struct layout, needs local check
 *   - "todo"      : requires MAME debugger / RAM scanner
 */

export interface MemoryAddress {
  offset: number;
  bytes: 1 | 2 | 4;
  confidence: 'validated' | 'probable' | 'todo';
  note?: string;
}

export const P1_BASE = 0xFF83BE;
export const P2_BASE = 0xFF86BE;
export const PLAYER_STRIDE = 0x300;

export const SF2HF_MEMORY_MAP = {
  // ── Player 1 ──────────────────────────────────────────────────────────────
  p1_hp:          { offset: 0xFF83E8, bytes: 2, confidence: 'validated', note: 'Health 0-176 (word, big-endian)' } as MemoryAddress,
  p1_max_hp:      { offset: 0xFF83EA, bytes: 2, confidence: 'probable', note: 'Typically 176 (0xB0) — follows HP word' } as MemoryAddress,
  p1_x:           { offset: 0xFF83C4, bytes: 2, confidence: 'validated', note: 'Screen X (unsigned word, 0-384)' } as MemoryAddress,
  p1_y:           { offset: 0xFF83CA, bytes: 1, confidence: 'validated', note: 'Jump height byte (0 grounded, >0 airborne)' } as MemoryAddress,
  p1_char_id:     { offset: 0xFF864F, bytes: 1, confidence: 'validated', note: 'FBNeo Select Character PL1' } as MemoryAddress,
  p1_anim_state:  { offset: 0xFF83D7, bytes: 1, confidence: 'probable', note: 'Action Speed / anim FSM index' } as MemoryAddress,
  p1_stun:        { offset: 0xFF841A, bytes: 2, confidence: 'validated', note: 'Dizzy timeout word' } as MemoryAddress,
  p1_stun_damage: { offset: 0xFF841C, bytes: 2, confidence: 'validated', note: 'Dizzy damage accumulator' } as MemoryAddress,
  p1_ko_state:    { offset: 0xFF841D, bytes: 1, confidence: 'validated', note: 'FBNeo Never Faint PL1' } as MemoryAddress,
  p1_combo:       { offset: 0xFF870A, bytes: 1, confidence: 'probable', note: 'Hits Keep You Close — may double as combo counter' } as MemoryAddress,
  p1_attack_id:   { offset: 0xFF83DC, bytes: 1, confidence: 'probable', note: 'DEPRECATED — this is the Shot Motion Cancel cooldown (projectile ticker), NOT a general attack id. Kept for back-compat until detector/events are migrated to animPtr.' } as MemoryAddress,
  // Animation frame pointer (+0x1A from P1_BASE). 32-bit big-endian.
  // SF2 identifies the current move via this pointer — there is no
  // single move-id byte. Validated by Jesuszilla/mame-rr-scripts + our
  // own in-game RAM diff (0xFF83DB bumps on every punch/kick).
  p1_anim_ptr:    { offset: 0xFF83D8, bytes: 4, confidence: 'validated', note: 'Animation frame pointer (word-32 BE) — canonical move signature' } as MemoryAddress,
  // State byte (+0x03). 0=neutral, 0x0A/0x0C=kick actions, 0x0E/0x14=hurt/throw.
  p1_state:       { offset: 0xFF83C1, bytes: 1, confidence: 'validated', note: 'Player FSM state byte' } as MemoryAddress,
  // Attacking flag (+0x18B). 0x01 while an attack is in progress.
  p1_attacking:   { offset: 0xFF8549, bytes: 1, confidence: 'validated', note: 'Attacking flag — 0x01 during an attack' } as MemoryAddress,
  p1_rounds_won:  { offset: 0xFF864E, bytes: 1, confidence: 'validated' } as MemoryAddress,

  // ── Player 2 (CPU-controlled in arcade 1P mode) ───────────────────────────
  p2_hp:          { offset: 0xFF86E8, bytes: 2, confidence: 'validated' } as MemoryAddress,
  p2_max_hp:      { offset: 0xFF86EA, bytes: 2, confidence: 'probable' } as MemoryAddress,
  p2_x:           { offset: 0xFF86C4, bytes: 2, confidence: 'validated' } as MemoryAddress,
  p2_y:           { offset: 0xFF86CA, bytes: 1, confidence: 'validated' } as MemoryAddress,
  p2_char_id:     { offset: 0xFF894F, bytes: 1, confidence: 'validated' } as MemoryAddress,
  p2_anim_state:  { offset: 0xFF86D7, bytes: 1, confidence: 'probable' } as MemoryAddress,
  p2_stun:        { offset: 0xFF871A, bytes: 2, confidence: 'validated' } as MemoryAddress,
  p2_stun_damage: { offset: 0xFF871C, bytes: 2, confidence: 'validated' } as MemoryAddress,
  p2_ko_state:    { offset: 0xFF871D, bytes: 1, confidence: 'validated' } as MemoryAddress,
  p2_combo:       { offset: 0xFF840A, bytes: 1, confidence: 'probable' } as MemoryAddress,
  p2_attack_id:   { offset: 0xFF86DC, bytes: 1, confidence: 'probable', note: 'DEPRECATED — see p1_attack_id' } as MemoryAddress,
  p2_anim_ptr:    { offset: 0xFF86D8, bytes: 4, confidence: 'validated' } as MemoryAddress,
  p2_state:       { offset: 0xFF86C1, bytes: 1, confidence: 'validated' } as MemoryAddress,
  p2_attacking:   { offset: 0xFF8849, bytes: 1, confidence: 'validated' } as MemoryAddress,
  p2_rounds_won:  { offset: 0xFF894E, bytes: 1, confidence: 'validated' } as MemoryAddress,

  // ── CPU AI state (Bison-specific, to reverse) ─────────────────────────────
  // Placeholder offsets — REVERSE WITH MAME DEBUGGER before trusting these.
  p2_ai_state:    { offset: 0xFF8900, bytes: 1, confidence: 'todo' } as MemoryAddress,
  p2_charge_ctr:  { offset: 0xFF8902, bytes: 2, confidence: 'todo' } as MemoryAddress,

  // ── Match state ───────────────────────────────────────────────────────────
  timer:          { offset: 0xFF8ABE, bytes: 1, confidence: 'validated', note: 'FBNeo Infinite Time — live BCD timer' } as MemoryAddress,
  round_number:   { offset: 0xFF8109, bytes: 1, confidence: 'todo' } as MemoryAddress,
  round_phase:    { offset: 0xFF810A, bytes: 1, confidence: 'todo' } as MemoryAddress,
} as const;

export type MemoryMapKey = keyof typeof SF2HF_MEMORY_MAP;

/**
 * Character ID mapping (value read at p*_char_id).
 * Based on SF2 standard roster indexing: Ryu=0 ... Bison=B.
 * To validate against FBNeo "Select Character" cheat values.
 */
export const CHARACTER_ID_TABLE: Record<number, import('../types').CharacterId> = {
  0x00: 'ryu',
  0x01: 'e-honda',
  0x02: 'blanka',
  0x03: 'guile',
  0x04: 'ken',
  0x05: 'chun-li',
  0x06: 'zangief',
  0x07: 'dhalsim',
  0x08: 'balrog',
  0x09: 'vega',
  0x0A: 'sagat',
  0x0B: 'bison',
};
