import type { GameState, AIMacroState } from '../types';
import type { StateHistory } from '../extractor/state-history';
import {
  type CoachEvent,
  IMPORTANCE,
  SCREEN_BOUNDS,
} from './events';
import { classifyCpuMacroState } from './macro-state';
import { predictOpponentActions } from './opponent-patterns';

const NEAR_DEATH_PCT = 0.15;
const LOW_HP_PCT = 0.3;
const CORNER_MARGIN = 60;

const PREDICTION_COOLDOWN_MS = 2500;

/**
 * Stateful detector: fed with each new GameState + current history,
 * emits atomic events by diffing against the previous state, plus
 * macro-state transitions and Bison predictions.
 *
 * Gated on `isMatchActive` — during the intro / loading / KO sequences
 * both fighters read HP=0 and we must not emit desperation/aggression
 * noise. A single `round_start` fires the first time the match actually
 * opens (HP jumps from 0 to >0 on both sides).
 */
export class EventDetector {
  private prev: GameState | null = null;
  private lastCpuState: AIMacroState = 'idle';
  private cornerActive: { p1: boolean; p2: boolean } = { p1: false, p2: false };
  private nearDeathFired: { p1: boolean; p2: boolean } = { p1: false, p2: false };
  private lowHpFired: { p1: boolean; p2: boolean } = { p1: false, p2: false };
  private matchHasStarted = false;
  private lastPredictionAtMs: Map<string, number> = new Map();

  // Tendency counters surfaced to the commentator through a dedicated
  // getContext() getter.
  private p1Streak = 0;
  private p2Streak = 0;
  private streakFiredAt = { p1: 0, p2: 0 };
  private lastHitAtMs: number | null = null;
  private stunActive: { p1: boolean; p2: boolean } = { p1: false, p2: false };

  // We only fire round_start once the "Fight!" intro has actually played,
  // which we detect by watching the in-game timer tick down for the first
  // time. Before that the HP is valid but the fighters are still frozen
  // on their intro poses and anything the commentator says is premature.
  private seenFirstTimerTick = false;
  private prevTimer: number | null = null;
  // Timer warning dedup — remember the last second we fired at so we
  // don't spam one event per frame during the 20→0 countdown. Reset to
  // null on new match / round so the next countdown can fire again.
  private timerWarnedAtSec: number | null = null;
  private timerCriticalAtSec: number | null = null;

  detect(current: GameState, history: StateHistory): CoachEvent[] {
    const out: CoachEvent[] = [];

    // Reset per-match state when the CPU character changes — either a
    // new boss in the arcade ladder or returning to the menu. Without
    // this, round_start never re-fires (matchHasStarted stays true) and
    // the briefing is skipped for the next opponent. We keep
    // briefedOpponents across the session so the SAME boss isn't
    // re-briefed if you fight them again later.
    if (this.prev && current.p2.charId !== 'unknown'
        && this.prev.p2.charId !== 'unknown'
        && current.p2.charId !== this.prev.p2.charId) {
      this.matchHasStarted = false;
      this.seenFirstTimerTick = false;
      this.prevTimer = null;
      this.nearDeathFired = { p1: false, p2: false };
      this.lowHpFired = { p1: false, p2: false };
      this.cornerActive = { p1: false, p2: false };
      this.p1Streak = 0;
      this.p2Streak = 0;
      this.streakFiredAt = { p1: 0, p2: 0 };
      this.timerWarnedAtSec = null;
      this.timerCriticalAtSec = null;
    }

    const prev = this.prev;
    const active = isMatchActive(current);

    // Watch for the first timer decrement — this is our signal that the
    // "Fight!" intro has ended and the clock is actually running.
    if (this.prevTimer !== null && current.timer < this.prevTimer && current.timer > 0) {
      this.seenFirstTimerTick = true;
    }
    if (current.timer > 0 && current.timer < 99) {
      // Started in the middle (rare, e.g. save-state load). Accept it.
      this.seenFirstTimerTick = true;
    }

    // Timer warnings — fire once each per round when the countdown crosses
    // 20s (warning) and 10s (critical). Reset on new round (HP rebound).
    if (active && current.timer > 0) {
      if (current.timer <= 20 && current.timer > 10
          && this.timerWarnedAtSec !== current.timer
          && (this.timerWarnedAtSec === null || this.timerWarnedAtSec < current.timer)) {
        out.push({
          type: 'timer_warning',
          frameIdx: current.frameIdx,
          timestampMs: current.timestampMs,
          importance: IMPORTANCE.moderate,
          secondsLeft: current.timer,
        });
        this.timerWarnedAtSec = current.timer;
      }
      if (current.timer <= 10
          && this.timerCriticalAtSec !== current.timer
          && (this.timerCriticalAtSec === null || this.timerCriticalAtSec < current.timer)) {
        out.push({
          type: 'timer_critical',
          frameIdx: current.frameIdx,
          timestampMs: current.timestampMs,
          importance: IMPORTANCE.important,
          secondsLeft: current.timer,
        });
        this.timerCriticalAtSec = current.timer;
      }
    }

    this.prevTimer = current.timer;

    // Fire round_start once HP is valid AND the fight is really underway.
    if (active && !this.matchHasStarted && this.seenFirstTimerTick) {
      out.push({
        type: 'round_start',
        frameIdx: current.frameIdx,
        timestampMs: current.timestampMs,
        importance: IMPORTANCE.urgent,
        roundNumber: current.roundNumber,
      });
      this.matchHasStarted = true;
    }

    const prevActive = prev ? isMatchActive(prev) : false;
    // Diff-based detectors keep firing on the active→inactive edge so the
    // KO and round end are captured instead of being gated away.
    if (prev && (active || prevActive)) {
      this.detectHpChanges(prev, current, out);
      this.detectSpecials(prev, current, out);
      this.detectCombos(prev, current, out);
      this.detectRoundBoundaries(prev, current, out);
      this.detectCornerTrap(current, out);
      this.detectStun(prev, current, out);
    }

    if (active) {
      this.detectMacroStateTransition(current, history, out);
      this.detectPredictions(current, history, out);
    }

    this.prev = current;
    return out;
  }

  reset(): void {
    this.prev = null;
    this.lastCpuState = 'idle';
    this.cornerActive = { p1: false, p2: false };
    this.nearDeathFired = { p1: false, p2: false };
    this.lowHpFired = { p1: false, p2: false };
    this.matchHasStarted = false;
    this.lastPredictionAtMs.clear();
    this.p1Streak = 0;
    this.p2Streak = 0;
    this.streakFiredAt = { p1: 0, p2: 0 };
    this.lastHitAtMs = null;
    this.stunActive = { p1: false, p2: false };
    this.seenFirstTimerTick = false;
    this.prevTimer = null;
    this.timerWarnedAtSec = null;
    this.timerCriticalAtSec = null;
  }

  getLastCpuMacroState(): AIMacroState {
    return this.lastCpuState;
  }

  /** Aggregated tendency counters useful for commentary. */
  getContext(nowMs: number): {
    p1HitStreak: number;
    p2HitStreak: number;
    msSinceLastHit: number;
  } {
    return {
      p1HitStreak: this.p1Streak,
      p2HitStreak: this.p2Streak,
      msSinceLastHit: this.lastHitAtMs === null ? Infinity : nowMs - this.lastHitAtMs,
    };
  }

  private detectHpChanges(prev: GameState, curr: GameState, out: CoachEvent[]): void {
    for (const side of ['p1', 'p2'] as const) {
      const prevHp = prev[side].hp;
      const currHp = curr[side].hp;
      const maxHp = curr[side].maxHp || 176;
      if (currHp < prevHp && prevHp > 0) {
        const damage = prevHp - currHp;
        const attacker = side === 'p1' ? 'p2' : 'p1';
        const hpPct = currHp / maxHp;
        out.push({
          type: 'hp_hit',
          frameIdx: curr.frameIdx,
          timestampMs: curr.timestampMs,
          importance: damageImportance(damage, hpPct),
          attacker,
          damage,
          victimHpAfter: currHp,
          victimHpPercent: hpPct,
        });

        // Streak bookkeeping: attacker's chain grows, victim's resets.
        this.lastHitAtMs = curr.timestampMs;
        if (attacker === 'p1') {
          this.p1Streak++;
          this.p2Streak = 0;
          if (this.p1Streak >= 3 && this.streakFiredAt.p1 < this.p1Streak) {
            out.push({
              type: 'hit_streak',
              frameIdx: curr.frameIdx,
              timestampMs: curr.timestampMs,
              importance: this.p1Streak >= 4 ? IMPORTANCE.important : IMPORTANCE.moderate,
              attacker: 'p1',
              count: this.p1Streak,
            });
            this.streakFiredAt.p1 = this.p1Streak;
          }
        } else {
          this.p2Streak++;
          this.p1Streak = 0;
          if (this.p2Streak >= 3 && this.streakFiredAt.p2 < this.p2Streak) {
            out.push({
              type: 'hit_streak',
              frameIdx: curr.frameIdx,
              timestampMs: curr.timestampMs,
              importance: this.p2Streak >= 4 ? IMPORTANCE.important : IMPORTANCE.moderate,
              attacker: 'p2',
              count: this.p2Streak,
            });
            this.streakFiredAt.p2 = this.p2Streak;
          }
        }
      }

      const pct = currHp / maxHp;
      if (pct <= NEAR_DEATH_PCT && !this.nearDeathFired[side] && currHp > 0) {
        out.push({
          type: 'near_death',
          frameIdx: curr.frameIdx,
          timestampMs: curr.timestampMs,
          importance: IMPORTANCE.critical,
          victim: side,
          hpPercent: pct,
        });
        this.nearDeathFired[side] = true;
      } else if (pct > NEAR_DEATH_PCT + 0.1) {
        this.nearDeathFired[side] = false;
      }

      if (pct <= LOW_HP_PCT && pct > NEAR_DEATH_PCT && !this.lowHpFired[side]) {
        out.push({
          type: 'low_hp_warning',
          frameIdx: curr.frameIdx,
          timestampMs: curr.timestampMs,
          importance: IMPORTANCE.moderate,
          victim: side,
          hpPercent: pct,
        });
        this.lowHpFired[side] = true;
      } else if (pct > LOW_HP_PCT + 0.1) {
        this.lowHpFired[side] = false;
      }
    }
  }

  private detectSpecials(prev: GameState, curr: GameState, out: CoachEvent[]): void {
    for (const side of ['p1', 'p2'] as const) {
      // Edge-detect the attacking flag (+0x18B = 0x01). Captures the
      // animPtr at the exact startup frame — that value is the move
      // signature used by moveName().
      if (!prev[side].attacking && curr[side].attacking) {
        const stateByte = curr[side].stateByte;
        // state=0x0C = special move (Hadouken/Shoryu/Tatsu), state=0x0A
        // = normal. Specials are narrative beats; normals are background
        // noise — drop their importance so the commentator doesn't spam.
        const importance = stateByte === 0x0C ? IMPORTANCE.moderate : IMPORTANCE.minor;
        out.push({
          type: 'special_startup',
          frameIdx: curr.frameIdx,
          timestampMs: curr.timestampMs,
          importance,
          player: side,
          character: curr[side].charId,
          animPtr: curr[side].animPtr,
          stateByte,
        });
      }
    }
  }

  private detectCombos(prev: GameState, curr: GameState, out: CoachEvent[]): void {
    for (const side of ['p1', 'p2'] as const) {
      const prevCombo = prev[side].comboCount;
      const currCombo = curr[side].comboCount;
      if (currCombo > prevCombo && currCombo >= 2) {
        out.push({
          type: 'combo_connect',
          frameIdx: curr.frameIdx,
          timestampMs: curr.timestampMs,
          importance: currCombo >= 4 ? IMPORTANCE.important : IMPORTANCE.moderate,
          attacker: side,
          hits: currCombo,
        });
      }
    }
  }

  private detectRoundBoundaries(prev: GameState, curr: GameState, out: CoachEvent[]): void {
    if (curr.roundNumber !== prev.roundNumber) {
      out.push({
        type: 'round_start',
        frameIdx: curr.frameIdx,
        timestampMs: curr.timestampMs,
        importance: IMPORTANCE.urgent,
        roundNumber: curr.roundNumber,
      });
    }
    // HP jump back up = probable new round (the phase address is unreliable).
    if (curr.p1.hp > prev.p1.hp + 50 || curr.p2.hp > prev.p2.hp + 50) {
      this.nearDeathFired = { p1: false, p2: false };
      this.lowHpFired = { p1: false, p2: false };
      // Let the countdown warnings fire again on the fresh timer.
      this.timerWarnedAtSec = null;
      this.timerCriticalAtSec = null;
    }
    // Round ended when one fighter drops to 0 while the other is still alive.
    const p1Ko = prev.p1.hp > 0 && curr.p1.hp === 0;
    const p2Ko = prev.p2.hp > 0 && curr.p2.hp === 0;
    if (p1Ko !== p2Ko) {
      out.push({
        type: 'round_end',
        frameIdx: curr.frameIdx,
        timestampMs: curr.timestampMs,
        importance: IMPORTANCE.urgent,
        winner: p1Ko ? 'p2' : 'p1',
      });
      out.push({
        type: 'knockdown',
        frameIdx: curr.frameIdx,
        timestampMs: curr.timestampMs,
        importance: IMPORTANCE.important,
        victim: p1Ko ? 'p1' : 'p2',
      });
    }
  }

  private detectStun(prev: GameState, curr: GameState, out: CoachEvent[]): void {
    for (const side of ['p1', 'p2'] as const) {
      const prevStun = prev[side].stunCounter;
      const currStun = curr[side].stunCounter;
      // Rising edge: stun timer moves from 0 to a meaningful value.
      if (!this.stunActive[side] && currStun > prevStun && currStun >= 32) {
        out.push({
          type: 'stunned',
          frameIdx: curr.frameIdx,
          timestampMs: curr.timestampMs,
          importance: IMPORTANCE.important,
          victim: side,
        });
        this.stunActive[side] = true;
      } else if (currStun === 0) {
        this.stunActive[side] = false;
      }
    }
  }

  private detectCornerTrap(curr: GameState, out: CoachEvent[]): void {
    for (const side of ['p1', 'p2'] as const) {
      const x = curr[side].x;
      const cornered = x < SCREEN_BOUNDS.xMin + CORNER_MARGIN || x > SCREEN_BOUNDS.xMax - CORNER_MARGIN;
      if (cornered && !this.cornerActive[side]) {
        out.push({
          type: 'corner_trap',
          frameIdx: curr.frameIdx,
          timestampMs: curr.timestampMs,
          importance: side === 'p1' ? IMPORTANCE.important : IMPORTANCE.moderate,
          victim: side,
          side: x < 400 ? 'left' : 'right',
        });
        this.cornerActive[side] = true;
      } else if (!cornered) {
        this.cornerActive[side] = false;
      }
    }
  }

  private detectMacroStateTransition(curr: GameState, history: StateHistory, out: CoachEvent[]): void {
    const classification = classifyCpuMacroState(curr, history);
    if (classification.state !== this.lastCpuState) {
      out.push({
        type: 'macro_state_change',
        frameIdx: curr.frameIdx,
        timestampMs: curr.timestampMs,
        importance: IMPORTANCE.moderate,
        player: 'p2',
        from: this.lastCpuState,
        to: classification.state,
        triggers: classification.triggers,
      });
      this.lastCpuState = classification.state;
    }
  }

  private detectPredictions(curr: GameState, history: StateHistory, out: CoachEvent[]): void {
    const predictions = predictOpponentActions(curr, history);
    for (const p of predictions) {
      // Deduplicate: suppress the same predicted action if we emitted it
      // within the cooldown window. Without this the detector fires the
      // same warning 60×/second while the condition is true.
      const last = this.lastPredictionAtMs.get(p.action) ?? -Infinity;
      if (curr.timestampMs - last < PREDICTION_COOLDOWN_MS) continue;
      this.lastPredictionAtMs.set(p.action, curr.timestampMs);

      out.push({
        type: 'pattern_prediction',
        frameIdx: curr.frameIdx,
        timestampMs: curr.timestampMs,
        importance: p.confidence >= 0.8 ? IMPORTANCE.important : IMPORTANCE.moderate,
        player: 'p2',
        predictedAction: p.action,
        preNoticeMs: p.preNoticeMs,
        confidence: p.confidence,
        reason: p.reason,
      });
    }
  }
}

function isMatchActive(state: GameState): boolean {
  // Both HP must be real, AND positions must have settled past their
  // transitional phase. Right after HP becomes valid, X briefly reads
  // values under 100 while the sprites warp to their starting spots —
  // that window falsely trips corner_trap because < 180 is "near wall".
  // We also require a real CPU character — bonus stages ("Car Crusher",
  // "Barrel Breaker") leave p2.charId reading as 'unknown' and there's
  // no opponent to commentate against.
  //
  // AND: arcade 1P mode never pairs Ryu with a Ryu mirror, so when both
  // char bytes read the same value it means the p2 slot hasn't been
  // populated yet (boot RAM reads 0x00 = ryu on both). Treat as inactive
  // until they diverge.
  return state.p1.hp > 0 && state.p2.hp > 0
      && state.p1.x > 100 && state.p2.x > 100
      && state.p2.charId !== 'unknown'
      && state.p1.charId !== 'unknown'
      && state.p1.charId !== state.p2.charId;
}

function damageImportance(damage: number, victimHpPct: number): number {
  if (victimHpPct < 0.2) return IMPORTANCE.critical;
  if (damage >= 30) return IMPORTANCE.important;
  if (damage >= 15) return IMPORTANCE.moderate;
  return IMPORTANCE.minor;
}
