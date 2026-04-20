import type { GameState, AIMacroState } from '../types';
import type { StateHistory, DerivedMetrics } from '../extractor/state-history';

export interface MacroClassification {
  state: AIMacroState;
  triggers: string[];
}

const HP_DESPERATION = 0.2;
const HP_DEFENSIVE = 0.4;
const DIST_ZONING = 140;
const DIST_RUSH = 100;
const RETREAT_TELEPORT = 3;

/**
 * Classify the CPU's (p2) current macro-state from the live game state
 * plus derived trends over the last ~5s. Rules are ordered so the most
 * specific pattern wins when several would match.
 */
export function classifyCpuMacroState(
  current: GameState,
  history: StateHistory,
): MacroClassification {
  const derived = history.derive();
  const p2 = current.p2;
  const maxHp = p2.maxHp || 176;
  const hpPct = p2.hp / maxHp;
  const dist = Math.abs(current.p1.x - current.p2.x);
  const triggers: string[] = [];

  if (hpPct < HP_DESPERATION) {
    triggers.push(`hp=${Math.round(hpPct * 100)}%`);
    return { state: 'desperation', triggers };
  }

  if (derived.p2RetreatCount >= RETREAT_TELEPORT && derived.windowMs < 2500) {
    triggers.push(`retreat_x${derived.p2RetreatCount}_in_${Math.round(derived.windowMs)}ms`);
    return { state: 'teleport_setup', triggers };
  }

  if (isCornerPressure(current)) {
    triggers.push('p1_cornered', `dist=${Math.round(dist)}`);
    return { state: 'corner_pressure', triggers };
  }

  if (hpPct < HP_DEFENSIVE && derived.p2SpecialCount === 0) {
    triggers.push(`hp=${Math.round(hpPct * 100)}%`, 'no_recent_specials');
    return { state: 'defensive', triggers };
  }

  if (isApproaching(current, history) && dist < DIST_RUSH + 100) {
    triggers.push(`dist=${Math.round(dist)}`, 'approaching');
    return { state: 'rush', triggers };
  }

  if (derived.p2RetreatCount >= 2 && dist > DIST_ZONING) {
    triggers.push(`dist=${Math.round(dist)}`, `retreat_x${derived.p2RetreatCount}`);
    return { state: 'charge_building', triggers };
  }

  if (dist >= DIST_ZONING && derived.p2SpecialCount <= 1) {
    triggers.push(`dist=${Math.round(dist)}`);
    return { state: 'zoning', triggers };
  }

  return { state: 'idle', triggers: [`dist=${Math.round(dist)}`] };
}

function isCornerPressure(state: GameState): boolean {
  const { p1, p2 } = state;
  const dist = Math.abs(p1.x - p2.x);
  if (dist > 160) return false;
  // "Corner" in the SF2 world space: P1 X close to a hard bound.
  // With our empirical bounds (80..900), within 80px of either edge.
  const near = p1.x < 180 || p1.x > 800;
  return near;
}

function isApproaching(state: GameState, history: StateHistory): boolean {
  const snap = history.snapshot();
  if (snap.length < 10) return false;
  const older = snap[Math.max(0, snap.length - 30)]!;
  const olderDist = Math.abs(older.p1.x - older.p2.x);
  const curDist = Math.abs(state.p1.x - state.p2.x);
  return olderDist - curDist > 40;
}

export { DerivedMetrics };
