import type { GameState, CharacterState, CPUState, CharacterId, RoundPhase, AttackPhase } from '../types';
import { SF2HF_MEMORY_MAP, CHARACTER_ID_TABLE, type MemoryAddress } from './sf2hf-memory-map';

const WORK_RAM_BASE = 0xFF0000;

/**
 * Reads a Work RAM Uint8Array (64KB, mapped to 0xFF0000-0xFFFFFF) and
 * extracts a typed GameState snapshot for SF2 Hyper Fighting.
 *
 * 68000 is big-endian: MSB at lower address.
 */
export class StateExtractor {
  private frameIdx = 0;

  extract(workRam: Uint8Array, nowMs: number): GameState {
    const p1 = this.readCharacterState(workRam, 'p1');
    const p2Base = this.readCharacterState(workRam, 'p2');
    const p2: CPUState = {
      ...p2Base,
      aiState: 'unknown',
      chargeCounter: this.readU16(workRam, SF2HF_MEMORY_MAP.p2_charge_ctr),
      retreatCounter: 0,
      lastSpecialFrame: -1,
    };

    const state: GameState = {
      frameIdx: this.frameIdx++,
      timestampMs: nowMs,
      p1,
      p2,
      timer: this.readTimer(workRam),
      roundNumber: this.readU8(workRam, SF2HF_MEMORY_MAP.round_number),
      roundPhase: this.readRoundPhase(workRam),
    };

    return state;
  }

  reset(): void {
    this.frameIdx = 0;
  }

  private readCharacterState(workRam: Uint8Array, side: 'p1' | 'p2'): CharacterState {
    const map = SF2HF_MEMORY_MAP;
    const hpAddr = side === 'p1' ? map.p1_hp : map.p2_hp;
    const maxHpAddr = side === 'p1' ? map.p1_max_hp : map.p2_max_hp;
    const xAddr = side === 'p1' ? map.p1_x : map.p2_x;
    const yAddr = side === 'p1' ? map.p1_y : map.p2_y;
    const charAddr = side === 'p1' ? map.p1_char_id : map.p2_char_id;
    const animAddr = side === 'p1' ? map.p1_anim_state : map.p2_anim_state;
    const stunAddr = side === 'p1' ? map.p1_stun : map.p2_stun;
    const comboAddr = side === 'p1' ? map.p1_combo : map.p2_combo;
    const attackAddr = side === 'p1' ? map.p1_attack_id : map.p2_attack_id;

    const y = this.readU8(workRam, yAddr);
    const animState = this.readU8(workRam, animAddr);
    const attackId = this.readU8(workRam, attackAddr);

    const hpRaw = this.readU16(workRam, hpAddr);
    const maxHp = this.readU16(workRam, maxHpAddr) || 176;
    const hp = hpRaw > maxHp ? 0 : hpRaw;

    return {
      hp,
      maxHp,
      x: this.readU16(workRam, xAddr),
      y,
      charId: this.decodeCharacterId(this.readU8(workRam, charAddr)),
      animState,
      stunCounter: this.readU16(workRam, stunAddr),
      comboCount: this.readU8(workRam, comboAddr),
      isBlocking: false,
      isJumping: y > 0,
      isCrouching: false,
      isAirborne: y > 0,
      currentAttackId: attackId === 0 ? null : attackId,
      attackPhase: attackId === 0 ? null : this.guessAttackPhase(animState),
    };
  }

  private decodeCharacterId(raw: number): CharacterId {
    return CHARACTER_ID_TABLE[raw] ?? 'unknown';
  }

  private readTimer(workRam: Uint8Array): number {
    const raw = this.readU8(workRam, SF2HF_MEMORY_MAP.timer);
    return ((raw >> 4) & 0xF) * 10 + (raw & 0xF);
  }

  private readRoundPhase(workRam: Uint8Array): RoundPhase {
    const raw = this.readU8(workRam, SF2HF_MEMORY_MAP.round_phase);
    switch (raw) {
      case 0: return 'intro';
      case 1: return 'fight';
      case 2: return 'ko';
      case 3: return 'outro';
      default: return 'fight';
    }
  }

  private guessAttackPhase(_animState: number): AttackPhase {
    return 'active';
  }

  private readU8(workRam: Uint8Array, addr: MemoryAddress): number {
    const off = addr.offset - WORK_RAM_BASE;
    if (off < 0 || off >= workRam.length) return 0;
    return workRam[off] ?? 0;
  }

  private readU16(workRam: Uint8Array, addr: MemoryAddress): number {
    const off = addr.offset - WORK_RAM_BASE;
    if (off < 0 || off + 1 >= workRam.length) return 0;
    return ((workRam[off] ?? 0) << 8) | (workRam[off + 1] ?? 0);
  }

  private readU16Signed(workRam: Uint8Array, addr: MemoryAddress): number {
    const raw = this.readU16(workRam, addr);
    return raw & 0x8000 ? raw - 0x10000 : raw;
  }
}
