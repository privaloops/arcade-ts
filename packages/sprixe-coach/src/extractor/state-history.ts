import type { GameState } from '../types';

const DEFAULT_WINDOW_SECONDS = 5;
const FRAME_RATE = 60;

export interface RepeatedMove {
  /** The 32-bit animation pointer — move signature resolved via moveName(). */
  animPtr: number;
  /** How many distinct times it was thrown in the window. */
  count: number;
}

export interface DerivedMetrics {
  avgDistance: number;
  p2RetreatCount: number;
  p1SpecialCount: number;
  p2SpecialCount: number;
  p2TimeInAir: number;
  p1DamageDealt: number;
  p2DamageDealt: number;
  windowMs: number;
  /**
   * The single attack_id each player has thrown the most this window
   * — but only if they repeated it at least 3 times. Null otherwise.
   * Used by the commentator to catch "he's mashing the same move".
   */
  p1RepeatedMove: RepeatedMove | null;
  p2RepeatedMove: RepeatedMove | null;
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
        p1RepeatedMove: null,
        p2RepeatedMove: null,
      };
    }

    let distSum = 0;
    let p2Retreats = 0;
    let p1Specials = 0;
    let p2Specials = 0;
    let p2AirFrames = 0;
    let p1Damage = 0;
    let p2Damage = 0;
    const p1MoveCounts = new Map<number, number>();
    const p2MoveCounts = new Map<number, number>();

    let prevP2X = snap[0]?.p2.x ?? 0;
    let prev: GameState | null = null;

    for (const s of snap) {
      const dx = Math.abs(s.p1.x - s.p2.x);
      distSum += dx;

      if (s.p2.x - prevP2X > 2) p2Retreats++;
      prevP2X = s.p2.x;

      if (s.p2.isAirborne) p2AirFrames++;

      if (prev) {
        // Count each attacking:false→true transition as one move launched.
        // The animPtr at that edge is the move's signature — use it as
        // the histogram key so "same move spammed 3 times" is visible.
        if (!prev.p1.attacking && s.p1.attacking) {
          p1Specials++;
          p1MoveCounts.set(s.p1.animPtr, (p1MoveCounts.get(s.p1.animPtr) ?? 0) + 1);
        }
        if (!prev.p2.attacking && s.p2.attacking) {
          p2Specials++;
          p2MoveCounts.set(s.p2.animPtr, (p2MoveCounts.get(s.p2.animPtr) ?? 0) + 1);
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
      p1RepeatedMove: pickMostRepeated(p1MoveCounts),
      p2RepeatedMove: pickMostRepeated(p2MoveCounts),
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

const REPEAT_THRESHOLD = 3;

function pickMostRepeated(counts: Map<number, number>): RepeatedMove | null {
  let top: RepeatedMove | null = null;
  for (const [animPtr, count] of counts) {
    if (count < REPEAT_THRESHOLD) continue;
    if (!top || count > top.count) top = { animPtr, count };
  }
  return top;
}
