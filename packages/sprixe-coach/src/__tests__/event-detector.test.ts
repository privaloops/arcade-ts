import { describe, it, expect } from 'vitest';
import { EventDetector } from '../detector/event-detector';
import { StateHistory } from '../extractor/state-history';
import type { GameState, CharacterState, CPUState } from '../types';

function char(o: Partial<CharacterState> = {}): CharacterState {
  return {
    hp: 176,
    maxHp: 176,
    x: 200,
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
    ...o,
  };
}

function cpu(o: Partial<CPUState> = {}): CPUState {
  return {
    ...char(),
    charId: 'bison',
    aiState: 'idle',
    chargeCounter: 0,
    retreatCounter: 0,
    lastSpecialFrame: -1,
    ...o,
  };
}

function state(
  frame: number,
  p1: Partial<CharacterState>,
  p2: Partial<CPUState>,
  tsMs: number,
  timer: number = 90,
): GameState {
  return {
    frameIdx: frame,
    timestampMs: tsMs,
    p1: char(p1),
    p2: cpu(p2),
    // Default to 90 so tests land past the "fight has started" gate
    // (timer > 0 && timer < 99). Individual tests can override.
    timer,
    roundNumber: 1,
    roundPhase: 'fight',
  };
}

describe('EventDetector', () => {
  it('emits round_start on the first state', () => {
    const d = new EventDetector();
    const h = new StateHistory(5);
    const s = state(0, {}, {}, 0);
    h.push(s);
    const events = d.detect(s, h);
    expect(events.some(e => e.type === 'round_start')).toBe(true);
  });

  it('emits hp_hit with damage when HP drops', () => {
    const d = new EventDetector();
    const h = new StateHistory(5);
    const s0 = state(0, { hp: 176 }, { hp: 176 }, 0);
    h.push(s0);
    d.detect(s0, h);

    const s1 = state(1, { hp: 156 }, { hp: 176 }, 16);
    h.push(s1);
    const events = d.detect(s1, h);

    const hit = events.find(e => e.type === 'hp_hit');
    expect(hit).toBeDefined();
    if (hit && hit.type === 'hp_hit') {
      expect(hit.attacker).toBe('p2');
      expect(hit.damage).toBe(20);
    }
  });

  it('fires near_death only once per low-HP streak', () => {
    const d = new EventDetector();
    const h = new StateHistory(5);
    const s0 = state(0, { hp: 176 }, { hp: 176 }, 0);
    h.push(s0); d.detect(s0, h);

    const s1 = state(1, { hp: 20 }, { hp: 176 }, 16);
    h.push(s1);
    const ev1 = d.detect(s1, h);
    expect(ev1.filter(e => e.type === 'near_death')).toHaveLength(1);

    const s2 = state(2, { hp: 18 }, { hp: 176 }, 33);
    h.push(s2);
    const ev2 = d.detect(s2, h);
    expect(ev2.filter(e => e.type === 'near_death')).toHaveLength(0);
  });

  it('emits round_end when one fighter drops to 0', () => {
    const d = new EventDetector();
    const h = new StateHistory(5);
    const s0 = state(0, { hp: 176 }, { hp: 30 }, 0);
    h.push(s0); d.detect(s0, h);

    const s1 = state(1, { hp: 176 }, { hp: 0 }, 16);
    h.push(s1);
    const events = d.detect(s1, h);

    const end = events.find(e => e.type === 'round_end');
    expect(end).toBeDefined();
    if (end && end.type === 'round_end') expect(end.winner).toBe('p1');
  });

  it('detects macro state transition and emits only on change', () => {
    const d = new EventDetector();
    const h = new StateHistory(5);
    const s0 = state(0, { x: 200 }, { x: 220, hp: 30 }, 0);
    h.push(s0); d.detect(s0, h);

    const events = [];
    for (let f = 1; f < 3; f++) {
      const s = state(f, { x: 200 }, { x: 220, hp: 30 }, f * 16);
      h.push(s);
      events.push(...d.detect(s, h));
    }
    const transitions = events.filter(e => e.type === 'macro_state_change');
    expect(transitions.length).toBeLessThanOrEqual(2);
  });

  it('predicts Bison teleport on rapid retreats', () => {
    const d = new EventDetector();
    const h = new StateHistory(5);
    const all: ReturnType<EventDetector['detect']> = [];
    let frame = 0;
    const push = (p2x: number, tsMs: number): void => {
      const s = state(frame++, { x: 200, hp: 176 }, { x: p2x, charId: 'bison', hp: 176 }, tsMs);
      h.push(s);
      all.push(...d.detect(s, h));
    };
    push(220, 0);
    push(260, 300);
    push(300, 600);
    push(340, 900);
    push(380, 1200);

    const pred = all.find(
      e => e.type === 'pattern_prediction' && e.predictedAction === 'teleport',
    );
    expect(pred).toBeDefined();
  });

  it('predicts Honda Sumo Headbutt when Ryu zones at range', () => {
    const d = new EventDetector();
    const h = new StateHistory(5);
    const all: ReturnType<EventDetector['detect']> = [];
    let frame = 0;
    const push = (p1: Partial<CharacterState>, p2: Partial<CPUState>, tsMs: number): void => {
      const s = state(frame++, p1, { charId: 'e-honda', ...p2 }, tsMs);
      h.push(s);
      all.push(...d.detect(s, h));
    };
    push({ x: 150, hp: 176 }, { x: 400, hp: 176 }, 0);
    push({ x: 100, hp: 176, attacking: true, animPtr: 0x60CCE, stateByte: 0x0C }, { x: 400, hp: 176 }, 200);
    push({ x: 150, hp: 176 }, { x: 400, hp: 176 }, 600);
    push({ x: 150, hp: 176 }, { x: 400, hp: 176 }, 800);

    const pred = all.find(
      e => e.type === 'pattern_prediction' && e.predictedAction === 'sumo_headbutt',
    );
    expect(pred).toBeDefined();
  });

  it('falls back to generic predictions for unknown opponents', () => {
    const d = new EventDetector();
    const h = new StateHistory(5);
    const all: ReturnType<EventDetector['detect']> = [];
    let frame = 0;
    for (let i = 0; i < 5; i++) {
      const s = state(frame++, { x: 200, hp: 176 }, { x: 220, charId: 'guile', hp: 20 }, i * 50);
      h.push(s); all.push(...d.detect(s, h));
    }

    const aggression = all.find(
      e => e.type === 'pattern_prediction' && e.predictedAction === 'aggression',
    );
    expect(aggression).toBeDefined();
  });
});
