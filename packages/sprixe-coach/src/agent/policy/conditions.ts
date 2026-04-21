import type { GameState } from '../../types';
import type { ConditionId } from './types';

/**
 * Per-frame derived state maintained by the PolicyRunner. Primitives
 * read from it to classify what's happening without repeating edge
 * detection on every rule.
 *
 * In 2P SF2 mode: P1 is on the left (lower x), P2 on the right (higher
 * x). P2 faces LEFT. So from P2's POV, "P1 approaching me" means P1's
 * x is INCREASING (moving right toward us).
 */
export interface ConditionContext {
  prevState: GameState | null;
  /** Frame at which P1 last rose into the jump state (0x04), or null. */
  p1LastJumpFrame: number | null;
  /** Frame at which P1 last started a special (rising edge into 0x0C). */
  p1LastSpecialFrame: number | null;
  /** Frame at which a normal attack just ended (1→0 transition on attacking while stateByte was 0x0A). */
  p1LastNormalEndFrame: number | null;
  /** Signed dx of P1 vs previous frame. Positive = P1 moving right (toward P2). */
  p1Dx: number;
  /** Smoothed horizontal drift while P1 is airborne. */
  p1JumpDrift: number;
  frameIdx: number;
}

const MAX_HP = 144;

export function evaluateCondition(
  id: ConditionId,
  state: GameState,
  ctx: ConditionContext,
): boolean {
  const dist = Math.abs(state.p1.x - state.p2.x);

  switch (id) {
    // ── Distance ──
    case 'dist_close':       return dist < 80;
    case 'dist_mid':         return dist >= 80 && dist < 180;
    case 'dist_far':         return dist >= 180 && dist < 280;
    case 'dist_fullscreen':  return dist >= 280;

    // ── P1 movement ──
    case 'p1_idle':
      return state.p1.stateByte === 0x00 && !state.p1.attacking;
    case 'p1_walking_forward':
      return state.p1.stateByte === 0x02 && ctx.p1Dx > 0.3;
    case 'p1_walking_back':
      return state.p1.stateByte === 0x02 && ctx.p1Dx < -0.3;
    case 'p1_crouching':
      return state.p1.stateByte === 0x06;
    case 'p1_jump_forward':
      return state.p1.stateByte === 0x04 && ctx.p1JumpDrift > 0.5;
    case 'p1_jump_back':
      return state.p1.stateByte === 0x04 && ctx.p1JumpDrift < -0.5;
    case 'p1_jump_neutral':
      return state.p1.stateByte === 0x04 && Math.abs(ctx.p1JumpDrift) <= 0.5;

    // ── P1 attacks ──
    case 'p1_attacking_normal':
      return state.p1.attacking && state.p1.stateByte === 0x0A;
    case 'p1_attacking_special':
      return state.p1.attacking && state.p1.stateByte === 0x0C;
    case 'fireball_flying':
      return ctx.p1LastSpecialFrame !== null
        && (ctx.frameIdx - ctx.p1LastSpecialFrame) > 0
        && (ctx.frameIdx - ctx.p1LastSpecialFrame) < 70;
    case 'p1_whiffed_special':
      // Special finished but P1 is still in recovery — punish window.
      return ctx.p1LastSpecialFrame !== null
        && (ctx.frameIdx - ctx.p1LastSpecialFrame) > 20
        && (ctx.frameIdx - ctx.p1LastSpecialFrame) < 40
        && !state.p1.attacking;
    case 'p1_recovery_normal':
      // Normal attack just finished — 12-frame window to punish the whiff.
      return ctx.p1LastNormalEndFrame !== null
        && (ctx.frameIdx - ctx.p1LastNormalEndFrame) > 0
        && (ctx.frameIdx - ctx.p1LastNormalEndFrame) < 12
        && !state.p1.attacking;

    // ── Status ──
    case 'p1_stunned':  return state.p1.stunCounter > 32;
    case 'me_stunned':  return state.p2.stunCounter > 32;

    // ── Position ──
    case 'cornered_me':   return state.p2.x < 120 || state.p2.x > 880;
    case 'cornered_them': return state.p1.x < 120 || state.p1.x > 880;
    case 'midscreen': {
      const meCornered  = state.p2.x < 120 || state.p2.x > 880;
      const themCornered = state.p1.x < 120 || state.p1.x > 880;
      return !meCornered && !themCornered;
    }

    // ── HP ──
    case 'hp_lead_big':     return (state.p2.hp - state.p1.hp) > 50;
    case 'hp_lead_small':   return (state.p2.hp - state.p1.hp) > 10 && (state.p2.hp - state.p1.hp) <= 50;
    case 'hp_neutral':      return Math.abs(state.p2.hp - state.p1.hp) <= 10;
    case 'hp_behind_small': return (state.p1.hp - state.p2.hp) > 10 && (state.p1.hp - state.p2.hp) <= 50;
    case 'hp_behind_big':   return (state.p1.hp - state.p2.hp) > 50;
    case 'near_death_me':   return state.p2.hp > 0 && state.p2.hp < MAX_HP * 0.2;
    case 'near_death_them': return state.p1.hp > 0 && state.p1.hp < MAX_HP * 0.2;

    // ── Timer ──
    case 'round_start': return state.timer > 95;
    case 'timer_low':   return state.timer > 0 && state.timer < 20;
  }
}

/**
 * Update the per-frame derived context. Called by PolicyRunner before
 * evaluating any rule for this frame.
 */
export function updateConditionContext(
  ctx: ConditionContext,
  state: GameState,
  frameIdx: number,
): void {
  if (ctx.prevState) {
    const rawDx = state.p1.x - ctx.prevState.p1.x;
    ctx.p1Dx = rawDx;
    if (state.p1.stateByte === 0x04) {
      // Smooth the air drift — jumps often warp x on the first frame.
      ctx.p1JumpDrift = ctx.p1JumpDrift * 0.7 + rawDx * 0.3;
    } else {
      ctx.p1JumpDrift = 0;
    }
    if (state.p1.stateByte === 0x04 && ctx.prevState.p1.stateByte !== 0x04) {
      ctx.p1LastJumpFrame = frameIdx;
      ctx.p1JumpDrift = 0;
    }
    if (state.p1.stateByte === 0x0C && state.p1.attacking
        && (ctx.prevState.p1.stateByte !== 0x0C || !ctx.prevState.p1.attacking)) {
      ctx.p1LastSpecialFrame = frameIdx;
    }
    // Detect 1→0 transition of attacking on a normal (stateByte was 0x0A).
    if (ctx.prevState.p1.attacking && !state.p1.attacking
        && ctx.prevState.p1.stateByte === 0x0A) {
      ctx.p1LastNormalEndFrame = frameIdx;
    }
  }
  ctx.prevState = state;
  ctx.frameIdx = frameIdx;
}

export function createConditionContext(): ConditionContext {
  return {
    prevState: null,
    p1LastJumpFrame: null,
    p1LastSpecialFrame: null,
    p1LastNormalEndFrame: null,
    p1Dx: 0,
    p1JumpDrift: 0,
    frameIdx: 0,
  };
}
