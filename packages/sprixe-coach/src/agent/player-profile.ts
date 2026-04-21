import type { GameState } from '../types';
import type { DerivedMetrics } from '../extractor/state-history';
import { moveName } from '../detector/move-names';

/**
 * Rolling-window profile of the 10 most recent seconds. Fed to the
 * Claude strategist so it can base mode decisions on the actual flow
 * of the match rather than a single instant.
 */
export interface PlayerProfile {
  p1: {
    /** Move name → count over the window. Unknown animPtrs grouped under 'unknown'. */
    moves: Record<string, number>;
    jumpCount: number;
    fireballCount: number;
    attackCount: number;
    /** Classified style from the frequencies above. */
    style: PlayerStyle;
  };
  p2Self: {
    moves: Record<string, number>;
    predictability: 'low' | 'medium' | 'high';
  };
  avgDistance: number;
  /** p2.hp - p1.hp. Positive = AI ahead. */
  hpAdvantage: number;
  timer: number;
  round: number;
  /** Which side (if any) is literally against a wall. */
  cornered: 'p1' | 'p2' | null;
}

export type PlayerStyle =
  | 'zoner'       // fireballs ≫ close engagements
  | 'rusher'      // jumps + close attacks dominate
  | 'turtle'      // few attacks, defensive
  | 'mashing'     // same move repeated often
  | 'mixed'       // balanced
  | 'unknown';    // not enough data

const WINDOW_MS = 10_000;
const CORNER_X_LEFT = 120;
const CORNER_X_RIGHT = 880;

interface MoveEvent { tsMs: number; name: string; }

/**
 * Observes GameState transitions and maintains the PlayerProfile.
 * observe() must be called at 60Hz; snapshot() can be called less
 * often (the strategist polls at ~0.2 Hz).
 */
export class PlayerProfiler {
  private p1Moves: MoveEvent[] = [];
  private p2Moves: MoveEvent[] = [];
  private p1Jumps: number[] = [];
  private prev: GameState | null = null;

  observe(state: GameState): void {
    const prev = this.prev;
    if (prev) {
      // Edge: attacking false → true on either side.
      if (!prev.p1.attacking && state.p1.attacking) {
        const name = moveName(state.p1.charId, state.p1.animPtr) ?? 'unknown';
        this.p1Moves.push({ tsMs: state.timestampMs, name });
      }
      if (!prev.p2.attacking && state.p2.attacking) {
        const name = moveName(state.p2.charId, state.p2.animPtr) ?? 'unknown';
        this.p2Moves.push({ tsMs: state.timestampMs, name });
      }
      // Edge: P1 starts a jump (stateByte 0x04).
      if (prev.p1.stateByte !== 0x04 && state.p1.stateByte === 0x04) {
        this.p1Jumps.push(state.timestampMs);
      }
    }

    const cutoff = state.timestampMs - WINDOW_MS;
    this.p1Moves = this.p1Moves.filter(e => e.tsMs >= cutoff);
    this.p2Moves = this.p2Moves.filter(e => e.tsMs >= cutoff);
    this.p1Jumps = this.p1Jumps.filter(ts => ts >= cutoff);

    this.prev = state;
  }

  snapshot(state: GameState, derived: DerivedMetrics): PlayerProfile {
    const p1MoveCounts = this.aggregate(this.p1Moves);
    const p2MoveCounts = this.aggregate(this.p2Moves);

    const fireballCount = this.p1Moves.filter(e =>
      e.name.toLowerCase().includes('hadouken') ||
      e.name.toLowerCase().includes('fireball')
    ).length;

    const jumpCount = this.p1Jumps.length;
    const attackCount = this.p1Moves.length;

    const style = classifyStyle(fireballCount, jumpCount, attackCount, p1MoveCounts);
    const predictability = classifyPredictability(p2MoveCounts, this.p2Moves.length);

    return {
      p1: {
        moves: p1MoveCounts,
        jumpCount,
        fireballCount,
        attackCount,
        style,
      },
      p2Self: {
        moves: p2MoveCounts,
        predictability,
      },
      avgDistance: derived.avgDistance,
      hpAdvantage: state.p2.hp - state.p1.hp,
      timer: state.timer,
      round: state.roundNumber,
      cornered:
        state.p1.x < CORNER_X_LEFT || state.p1.x > CORNER_X_RIGHT ? 'p1' :
        state.p2.x < CORNER_X_LEFT || state.p2.x > CORNER_X_RIGHT ? 'p2' :
        null,
    };
  }

  reset(): void {
    this.p1Moves = [];
    this.p2Moves = [];
    this.p1Jumps = [];
    this.prev = null;
  }

  private aggregate(events: MoveEvent[]): Record<string, number> {
    const out: Record<string, number> = {};
    for (const e of events) out[e.name] = (out[e.name] ?? 0) + 1;
    return out;
  }
}

function classifyStyle(
  fireballs: number,
  jumps: number,
  attacks: number,
  moves: Record<string, number>,
): PlayerStyle {
  if (attacks < 2) return 'unknown';
  // Mashing = one single move takes >60% of the total.
  const maxMove = Math.max(...Object.values(moves));
  if (maxMove / attacks > 0.6 && attacks >= 3) return 'mashing';
  if (attacks < 3) return 'turtle';
  const fireballRatio = fireballs / attacks;
  const jumpRatio = jumps / Math.max(attacks, 1);
  if (fireballRatio > 0.5) return 'zoner';
  if (jumpRatio > 0.4) return 'rusher';
  return 'mixed';
}

function classifyPredictability(
  moves: Record<string, number>,
  total: number,
): 'low' | 'medium' | 'high' {
  if (total < 3) return 'low';
  const values = Object.values(moves);
  const maxCount = Math.max(...values);
  const ratio = maxCount / total;
  if (ratio > 0.7) return 'high';
  if (ratio > 0.45) return 'medium';
  return 'low';
}
