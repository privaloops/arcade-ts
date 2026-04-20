import type { GameState, CharacterId } from '../types';
import type { StateHistory } from '../extractor/state-history';

/**
 * Per-character predictive rules for the coach.
 *
 * The architecture is a registry of character-specific predictors with
 * a generic fallback. Adding a new opponent is a matter of writing one
 * function and registering it in CHAR_PREDICTORS below.
 *
 * Documentation of each character's tells lives in
 * `src/llm/knowledge-base/opponents/*.md` — keep the code rules and the
 * markdown in sync; the LLM will be shown the markdown at prompt time.
 */

export interface OpponentPrediction {
  /** Free-form action name used by the LLM prompt, e.g. "psycho_crusher" */
  action: string;
  /** How far ahead of the predicted action we're firing, in ms. */
  preNoticeMs: number;
  /** 0..1 — fed into event importance. */
  confidence: number;
  /** Short human-readable cause, stitched into the LLM context. */
  reason: string;
}

type Predictor = (curr: GameState, history: StateHistory) => OpponentPrediction[];

// ── Shared thresholds ────────────────────────────────────────────────────────

const DESPERATION_HP = 0.2;

// ── Generic fallback (every opponent) ────────────────────────────────────────

function predictGeneric(curr: GameState, history: StateHistory): OpponentPrediction[] {
  const out: OpponentPrediction[] = [];
  const derived = history.derive();
  const dist = Math.abs(curr.p1.x - curr.p2.x);
  const hpPct = curr.p2.hp / (curr.p2.maxHp || 176);

  if (hpPct < DESPERATION_HP && dist < 260) {
    out.push({
      action: 'aggression',
      preNoticeMs: 1000,
      confidence: 0.45,
      reason: `HP ${Math.round(hpPct * 100)}% — desperation swing`,
    });
  }

  if (derived.p2RetreatCount >= 3 && derived.windowMs < 2500 && dist < 200) {
    out.push({
      action: 'reposition',
      preNoticeMs: 600,
      confidence: 0.5,
      reason: `retreated ${derived.p2RetreatCount}× in ${Math.round(derived.windowMs)}ms`,
    });
  }

  return out;
}

// ── M. Bison ─────────────────────────────────────────────────────────────────

function predictBison(curr: GameState, history: StateHistory): OpponentPrediction[] {
  const derived = history.derive();
  const out: OpponentPrediction[] = [];
  const dist = Math.abs(curr.p1.x - curr.p2.x);
  const bisonHpPct = curr.p2.hp / (curr.p2.maxHp || 176);
  const ryuHpPct = curr.p1.hp / (curr.p1.maxHp || 176);

  if (derived.p2RetreatCount >= 3 && derived.windowMs < 2500) {
    out.push({
      action: 'teleport',
      preNoticeMs: 400,
      confidence: 0.75,
      reason: `retreated ${derived.p2RetreatCount}× in ${Math.round(derived.windowMs)}ms`,
    });
  }

  if (dist >= 150 && dist <= 340 && derived.p2SpecialCount === 0 && derived.p2RetreatCount >= 1) {
    out.push({
      action: 'psycho_crusher',
      preNoticeMs: 700,
      confidence: 0.6,
      reason: `mid-range ${Math.round(dist)}px + charging back`,
    });
  }

  if (dist < 140 && derived.p2RetreatCount <= 1 && derived.p2SpecialCount === 0) {
    out.push({
      action: 'scissor_kick',
      preNoticeMs: 500,
      confidence: 0.55,
      reason: `close-range ${Math.round(dist)}px pressure`,
    });
  }

  if (dist > 280 && derived.p1SpecialCount >= 1) {
    out.push({
      action: 'head_stomp',
      preNoticeMs: 600,
      confidence: 0.55,
      reason: 'P1 full-screen + fireball thrown',
    });
  }

  if (dist > 180 && dist < 300 && derived.p1SpecialCount >= 2 && curr.p1.y === 0) {
    out.push({
      action: 'slide',
      preNoticeMs: 300,
      confidence: 0.5,
      reason: 'P1 zoning at mid range — Bison slide window',
    });
  }

  if (bisonHpPct < 0.2 && dist > 120 && dist < 260) {
    out.push({
      action: 'head_stomp',
      preNoticeMs: 800,
      confidence: 0.5,
      reason: `Bison low HP ${Math.round(bisonHpPct * 100)}% desperation`,
    });
  }

  if (ryuHpPct > 0.5 && bisonHpPct < 0.5 && (curr.p2.x < 150 || curr.p2.x > 830)) {
    out.push({
      action: 'punish_window',
      preNoticeMs: 1000,
      confidence: 0.4,
      reason: 'Bison cornered — punish window',
    });
  }

  return out;
}

// ── E. Honda ─────────────────────────────────────────────────────────────────

function predictEhonda(curr: GameState, history: StateHistory): OpponentPrediction[] {
  const derived = history.derive();
  const out: OpponentPrediction[] = [];
  const dist = Math.abs(curr.p1.x - curr.p2.x);
  const hondaHpPct = curr.p2.hp / (curr.p2.maxHp || 176);

  // Sumo Headbutt: Honda's signature full-screen punish on zoning. If
  // Ryu is far and just threw a fireball, Honda will headbutt through it
  // on reaction.
  if (dist > 220 && derived.p1SpecialCount >= 1) {
    out.push({
      action: 'sumo_headbutt',
      preNoticeMs: 500,
      confidence: 0.7,
      reason: 'full-screen + Ryu fireball — headbutt punish',
    });
  }

  // Hundred Hand Slap: close-range rapid pressure. When Honda is in jab
  // range and not moving, he spams HHS.
  if (dist < 120 && derived.p2RetreatCount === 0) {
    out.push({
      action: 'hundred_hand_slap',
      preNoticeMs: 400,
      confidence: 0.6,
      reason: `close ${Math.round(dist)}px — HHS window`,
    });
  }

  // Sumo Splash (jumping body press): Honda's anti-air and approach tool.
  // He reacts to Ryu jumps by jumping himself.
  if (curr.p1.y > 0 && dist < 220) {
    out.push({
      action: 'sumo_splash',
      preNoticeMs: 300,
      confidence: 0.55,
      reason: 'P1 in air — splash anti-air attempt',
    });
  }

  // Command throw (Oicho): close, grounded, both fighters close.
  if (dist < 60 && curr.p1.y === 0 && curr.p2.y === 0) {
    out.push({
      action: 'oicho_throw',
      preNoticeMs: 300,
      confidence: 0.5,
      reason: 'touching + grounded — command throw risk',
    });
  }

  // Patient walk-in: Honda at mid range with HP advantage tends to close
  // the distance slowly.
  if (dist > 180 && dist < 320 && hondaHpPct > 0.5 && derived.p2SpecialCount === 0) {
    out.push({
      action: 'walk_in',
      preNoticeMs: 1200,
      confidence: 0.5,
      reason: 'mid-range + HP lead — approaching',
    });
  }

  return out;
}

// ── Registry ─────────────────────────────────────────────────────────────────

const CHAR_PREDICTORS: Partial<Record<CharacterId, Predictor>> = {
  bison: predictBison,
  'e-honda': predictEhonda,
};

export function predictOpponentActions(
  curr: GameState,
  history: StateHistory,
): OpponentPrediction[] {
  const specific = CHAR_PREDICTORS[curr.p2.charId];
  const specifics = specific ? specific(curr, history) : [];
  const generic = predictGeneric(curr, history);
  return [...specifics, ...generic];
}

export function hasSpecificPredictor(charId: CharacterId): boolean {
  return charId in CHAR_PREDICTORS;
}
