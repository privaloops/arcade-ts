import { describe, it, expect } from 'vitest';
import { StateHistory } from '../extractor/state-history';
import type { GameState, CPUState, CharacterState } from '../types';

function makeChar(overrides: Partial<CharacterState> = {}): CharacterState {
  return {
    hp: 176,
    maxHp: 176,
    x: 100,
    y: 0,
    charId: 'ryu',
    animState: 0,
    stunCounter: 0,
    comboCount: 0,
    isBlocking: false,
    isJumping: false,
    isCrouching: false,
    isAirborne: false,
    animPtr: 0,
    stateByte: 0,
    attacking: false,
    ...overrides,
  };
}

function makeCpu(overrides: Partial<CPUState> = {}): CPUState {
  return {
    ...makeChar(),
    aiState: 'idle',
    chargeCounter: 0,
    retreatCounter: 0,
    lastSpecialFrame: -1,
    ...overrides,
  };
}

function makeState(frameIdx: number, p1: Partial<CharacterState>, p2: Partial<CPUState>, tsMs: number): GameState {
  return {
    frameIdx,
    timestampMs: tsMs,
    p1: makeChar(p1),
    p2: makeCpu(p2),
    timer: 99,
    roundNumber: 1,
    roundPhase: 'fight',
  };
}

describe('StateHistory', () => {
  it('keeps only the last N frames (ring buffer)', () => {
    const h = new StateHistory(1); // 60 frames
    for (let i = 0; i < 100; i++) {
      h.push(makeState(i, {}, {}, i * 16));
    }
    expect(h.size()).toBe(60);
    expect(h.latest()?.frameIdx).toBe(99);
    expect(h.snapshot()[0]?.frameIdx).toBe(40);
  });

  it('computes avg distance between players over the window', () => {
    const h = new StateHistory(1);
    h.push(makeState(0, { x: 100 }, { x: 200 }, 0));
    h.push(makeState(1, { x: 100 }, { x: 300 }, 16));
    h.push(makeState(2, { x: 100 }, { x: 400 }, 33));
    expect(h.derive().avgDistance).toBeCloseTo(200, 0); // (100+200+300)/3
  });

  it('counts P2 retreats (positive X delta)', () => {
    const h = new StateHistory(1);
    h.push(makeState(0, {}, { x: 100 }, 0));
    h.push(makeState(1, {}, { x: 130 }, 16));  // retreat +30
    h.push(makeState(2, {}, { x: 125 }, 33));  // advance
    h.push(makeState(3, {}, { x: 180 }, 50));  // retreat +55
    expect(h.derive().p2RetreatCount).toBe(2);
  });

  it('detects damage dealt by each player', () => {
    const h = new StateHistory(1);
    h.push(makeState(0, { hp: 176 }, { hp: 176 }, 0));
    h.push(makeState(1, { hp: 176 }, { hp: 156 }, 16));  // P1 hit P2 for 20
    h.push(makeState(2, { hp: 150 }, { hp: 156 }, 33));  // P2 hit P1 for 26
    const d = h.derive();
    expect(d.p1DamageDealt).toBe(20);
    expect(d.p2DamageDealt).toBe(26);
  });

  it('returns zeros when fewer than 2 states pushed', () => {
    const h = new StateHistory(5);
    expect(h.derive().avgDistance).toBe(0);
    h.push(makeState(0, {}, {}, 0));
    expect(h.derive().avgDistance).toBe(0);
  });
});
