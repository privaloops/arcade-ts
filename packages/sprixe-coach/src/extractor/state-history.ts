import type { GameState } from '../types';

const DEFAULT_WINDOW_SECONDS = 5;
const FRAME_RATE = 60;

export interface DerivedMetrics {
  avgDistance: number;
  p2RetreatCount: number;
  p1SpecialCount: number;
  p2SpecialCount: number;
  p2TimeInAir: number;
  p1DamageDealt: number;
  p2DamageDealt: number;
  windowMs: number;
}

/**
 * Rolling ring buffer of GameStates. Used by the pattern detector to compute
 * time-derivative metrics (movement trends, special frequency, combo flow).
 */
export class StateHistory {
  private readonly capacity: number;
  private buffer: (GameState | null)[];
  private head = 0;
  private count = 0;

  constructor(windowSeconds: number = DEFAULT_WINDOW_SECONDS) {
    this.capacity = Math.max(1, Math.round(windowSeconds * FRAME_RATE));
    this.buffer = new Array<GameState | null>(this.capacity).fill(null);
  }

  push(state: GameState): void {
    this.buffer[this.head] = state;
    this.head = (this.head + 1) % this.capacity;
    if (this.count < this.capacity) this.count++;
  }

  latest(): GameState | null {
    if (this.count === 0) return null;
    const idx = (this.head - 1 + this.capacity) % this.capacity;
    return this.buffer[idx] ?? null;
  }

  /** States from oldest to newest (up to `count` entries). */
  snapshot(): GameState[] {
    const out: GameState[] = [];
    const start = this.count < this.capacity ? 0 : this.head;
    for (let i = 0; i < this.count; i++) {
      const entry = this.buffer[(start + i) % this.capacity];
      if (entry) out.push(entry);
    }
    return out;
  }

  derive(): DerivedMetrics {
    const snap = this.snapshot();
    if (snap.length < 2) {
      return {
        avgDistance: 0,
        p2RetreatCount: 0,
        p1SpecialCount: 0,
        p2SpecialCount: 0,
        p2TimeInAir: 0,
        p1DamageDealt: 0,
        p2DamageDealt: 0,
        windowMs: 0,
      };
    }

    let distSum = 0;
    let p2Retreats = 0;
    let p1Specials = 0;
    let p2Specials = 0;
    let p2AirFrames = 0;
    let p1Damage = 0;
    let p2Damage = 0;

    let prevP2X = snap[0]?.p2.x ?? 0;
    let prev: GameState | null = null;

    for (const s of snap) {
      const dx = Math.abs(s.p1.x - s.p2.x);
      distSum += dx;

      if (s.p2.x - prevP2X > 2) p2Retreats++;
      prevP2X = s.p2.x;

      if (s.p2.isAirborne) p2AirFrames++;

      if (prev) {
        if (s.p1.currentAttackId !== null && prev.p1.currentAttackId !== s.p1.currentAttackId) {
          p1Specials++;
        }
        if (s.p2.currentAttackId !== null && prev.p2.currentAttackId !== s.p2.currentAttackId) {
          p2Specials++;
        }
        if (s.p2.hp < prev.p2.hp) p1Damage += prev.p2.hp - s.p2.hp;
        if (s.p1.hp < prev.p1.hp) p2Damage += prev.p1.hp - s.p1.hp;
      }

      prev = s;
    }

    const first = snap[0]!;
    const last = snap[snap.length - 1]!;
    return {
      avgDistance: distSum / snap.length,
      p2RetreatCount: p2Retreats,
      p1SpecialCount: p1Specials,
      p2SpecialCount: p2Specials,
      p2TimeInAir: (p2AirFrames / FRAME_RATE) * 1000,
      p1DamageDealt: p1Damage,
      p2DamageDealt: p2Damage,
      windowMs: last.timestampMs - first.timestampMs,
    };
  }

  clear(): void {
    this.buffer.fill(null);
    this.head = 0;
    this.count = 0;
  }

  size(): number {
    return this.count;
  }
}
