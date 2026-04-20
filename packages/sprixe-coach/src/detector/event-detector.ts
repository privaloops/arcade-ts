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

  detect(current: GameState, history: StateHistory): CoachEvent[] {
    const out: CoachEvent[] = [];
    const prev = this.prev;
    const active = isMatchActive(current);

    // Fire round_start the first time both fighters hold real HP.
    if (active && !this.matchHasStarted) {
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
      const wasIdle = prev[side].currentAttackId === null;
      const nowAttacking = curr[side].currentAttackId !== null;
      if (wasIdle && nowAttacking) {
        out.push({
          type: 'special_startup',
          frameIdx: curr.frameIdx,
          timestampMs: curr.timestampMs,
          importance: IMPORTANCE.moderate,
          player: side,
          character: curr[side].charId,
          attackId: curr[side].currentAttackId ?? 0,
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
  return state.p1.hp > 0 && state.p2.hp > 0 && state.p1.x > 100 && state.p2.x > 100;
}

function damageImportance(damage: number, victimHpPct: number): number {
  if (victimHpPct < 0.2) return IMPORTANCE.critical;
  if (damage >= 30) return IMPORTANCE.important;
  if (damage >= 15) return IMPORTANCE.moderate;
  return IMPORTANCE.minor;
}
