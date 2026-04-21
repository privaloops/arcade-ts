import type { Mode } from './types';

/**
 * Close-range pressure. Walks forward, jab-pressures, still anti-airs
 * (critical reflex kept across every mode) and blocks incoming
 * projectiles since you can't rush into a Hadouken.
 *
 * Win condition: corner the opponent, wake-up pressure.
 * Loss condition: opponent reads the rush and whiff-punishes every
 * walk-in.
 */
export const RushDownCorner: Mode = {
  name: 'RUSH_DOWN_CORNER',
  description: 'Pression close : walk forward, jabs, block projectiles.',

  onTick(state, ctx) {
    const dist = Math.abs(state.p1.x - state.p2.x);
    const justJumped = ctx.p1JustJumpedFramesAgo !== null
      && ctx.p1JustJumpedFramesAgo < 4;

    // Priority 1 — anti-air (cross-mode critical reflex).
    if (justJumped && dist > 40 && dist < 160) {
      return { queueMotion: 'shoryukenJab', reason: 'anti-air jump' };
    }

    // Priority 2 — block projectile (state=0x0C special anim on P1).
    if (state.p1.attacking && state.p1.stateByte === 0x0C && dist > 100) {
      return { held: ['down', 'right'], reason: 'block fireball' };
    }

    // Priority 3 — close jab pressure when tight. 45-frame cooldown so
    // the jabs have space to land and we can chain something else.
    if (dist < 60 && ctx.framesSinceLastMove > 45) {
      return { queueMotion: 'standingJab', reason: 'close jab pressure' };
    }

    // Priority 4 — walk forward aggressively to close the gap.
    if (dist > 80) {
      return { held: ['left'], reason: 'walk forward' };
    }

    return { reason: 'neutral close' };
  },
};
