import { describe, it, expect } from 'vitest';
import { pickPunish } from '../agent/tas/punish-engine';
import type { KenSnapshot, OpponentSnapshot } from '../agent/tas/punish-sim';

/**
 * Black-box tests for the punish engine. We don't mock the JSON data
 * files — the test uses the real hierarchy + captured trajectories
 * shipped with the repo, combined with a synthetic ROM whose opponent
 * move geometry is controlled.
 *
 * Synthetic ROM layout mirrors punish-sim.test.ts: animation frames at
 * 0x10000 + N*stride, hitbox subtable at 0x20000 with 0x100 offset.
 */
import { SF2HF_BOX_SPECS, ATTACK_BOX_SPEC, FRAME_STRIDE } from '../agent/tas/box-predictor';

const RYU_ANIM_BASE = 0x10000;
const RYU_HITBOX_PTR = 0x20000;

function makeRom(): Uint8Array { return new Uint8Array(0x30000); }

function writeSignedWordBE(rom: Uint8Array, addr: number, value: number): void {
  const raw = value < 0 ? value + 0x10000 : value;
  rom[addr] = (raw >> 8) & 0xFF;
  rom[addr + 1] = raw & 0xFF;
}

function setupRyuSweepRom(attackBox: { valX: number; radX: number }, hurtLegs: { valX: number; radX: number }): Uint8Array {
  const rom = makeRom();
  for (const spec of SF2HF_BOX_SPECS) {
    writeSignedWordBE(rom, RYU_HITBOX_PTR + spec.addrTable, 0x100);
  }
  for (let f = 0; f < 40; f++) {
    const ptr = RYU_ANIM_BASE + f * FRAME_STRIDE;
    // Attackbox slot (low — sweep extends at ground level).
    rom[ptr + ATTACK_BOX_SPEC.idPtr] = 1;
    const atkAddr = RYU_HITBOX_PTR + 0x100 + 1 * ATTACK_BOX_SPEC.idSpace;
    rom[atkAddr] = attackBox.valX & 0xFF;
    rom[atkAddr + 1] = 10;
    rom[atkAddr + 2] = attackBox.radX;
    rom[atkAddr + 3] = 10;
    // Hurt_legs slot (also low, extended when sweeping).
    const legSpec = SF2HF_BOX_SPECS.find((s) => s.kind === 'hurt_legs')!;
    rom[ptr + legSpec.idPtr] = 2;
    const legAddr = RYU_HITBOX_PTR + 0x100 + 2 * legSpec.idSpace;
    rom[legAddr] = hurtLegs.valX & 0xFF;
    rom[legAddr + 1] = 10;
    rom[legAddr + 2] = hurtLegs.radX;
    rom[legAddr + 3] = 15;
    // Hurt_body slot (higher — Ken's cHP uppercut hits the torso).
    // Positioned at cy≈50 in math convention, halfH=30 → Y range
    // [20, 80], overlapping Ken cHP attackbox (cy=85, halfH=30 →
    // [55, 115]) in the [55, 80] slice.
    const bodySpec = SF2HF_BOX_SPECS.find((s) => s.kind === 'hurt_body')!;
    rom[ptr + bodySpec.idPtr] = 3;
    const bodyAddr = RYU_HITBOX_PTR + 0x100 + 3 * bodySpec.idSpace;
    rom[bodyAddr] = 10;
    rom[bodyAddr + 1] = 50;
    rom[bodyAddr + 2] = 20;
    rom[bodyAddr + 3] = 30;
  }
  return rom;
}

function opponentSweepAt(x: number): OpponentSnapshot {
  return {
    x, y: 0, facingLeft: false,
    animPtrAtMoveStart: RYU_ANIM_BASE,
    framesSinceMoveStart: 0,
    moveName: 'sweep',
    hitboxPtr: RYU_HITBOX_PTR,
  };
}

describe('pickPunish — full engine integration', () => {
  it('picks the highest deltaHp option when Ken is in range to punish', () => {
    // Ryu sweep short attackbox, wide leg hurtbox → Ken cHP can
    // connect without absorbing damage. The damage-ranked hierarchy
    // should climb past blocks/evasions to a real punish.
    const rom = setupRyuSweepRom({ valX: 20, radX: 15 }, { valX: 30, radX: 25 });
    const opponent = opponentSweepAt(500);
    const ken: KenSnapshot = { x: 600, y: 0, facingLeft: true, hp: 144 };
    const decision = pickPunish(opponent, ken, rom);
    expect(decision).not.toBeNull();
    // Should choose an option that actually deals damage, not a
    // zero-deltaHp block.
    expect(decision!.deltaHp).toBeGreaterThan(0);
    expect(decision!.simResult.connects).toBe(true);
  });

  it('falls back to block when every offensive option whiffs', () => {
    // Ken is out of range for every grounded normal; only block_crouch
    // remains viable (deltaHp=0). Jumps would also register as pure
    // evasion, so block or jump can win ties — but both are zero-
    // deltaHp fallbacks, which is the expected degenerate outcome.
    const rom = setupRyuSweepRom({ valX: 20, radX: 15 }, { valX: 30, radX: 25 });
    const opponent = opponentSweepAt(100);
    const ken: KenSnapshot = { x: 900, y: 0, facingLeft: true, hp: 144 };
    const decision = pickPunish(opponent, ken, rom);
    expect(decision).not.toBeNull();
    expect(decision!.deltaHp).toBe(0);
    // Must be a safe fallback (block or pure evade).
    const first = decision!.option.sequence[0]!;
    expect(['block_crouch', 'block_stand', 'jump_back', 'jump_neutral', 'empty_jump']).toContain(first);
  });

  it('death-guard: rejects a trade that would kill Ken', () => {
    // Construct a scenario where the only connecting option requires
    // a trade that would kill Ken. Ryu sweep with a huge forward
    // attackbox (hits any ground option). Ken sitting at low HP.
    const rom = setupRyuSweepRom({ valX: 80, radX: 60 }, { valX: 30, radX: 25 });
    const opponent = opponentSweepAt(500);
    const ken: KenSnapshot = { x: 600, y: 30, facingLeft: true, hp: 10 };
    const decision = pickPunish(opponent, ken, rom);
    // Either a safe option (block/evade with damage=0) or null.
    if (decision) {
      expect(decision.simResult.kenDamageTaken).toBeLessThan(ken.hp);
    }
  });
});
