import type { Mode } from './types';

/**
 * Zoner patient. Keeps the opponent at arm's length, spams Hadouken
 * for chip/distance, anti-airs jumps, blocks close pressure.
 *
 * Win condition: opponent gets frustrated and jumps in predictably.
 * Loss condition: cornered, or outlasted on the timer.
 */
export const TurtleSpaceControl: Mode = {
  name: 'TURTLE_SPACE_CONTROL',
  description: 'Zoner patient: Hadouken à distance, anti-air sur jump, block close.',

  onTick(state, ctx) {
    const dist = Math.abs(state.p1.x - state.p2.x);
    const justJumped = ctx.p1JustJumpedFramesAgo !== null
      && ctx.p1JustJumpedFramesAgo < 4;

    // Priority 1 — anti-air Shoryu on the rising edge of a jump in range.
    if (justJumped && dist > 40 && dist < 160) {
      return { queueMotion: 'shoryukenJab', reason: 'anti-air jump' };
    }

    // Priority 2a — P1 just launched a projectile (Hadouken). Block
    // for the full travel window — the fireball entity isn't tracked
    // on P1's attacking flag so we gate on recency of the special
    // startup. 70 frames (~1.2s) covers a fireball crossing from any
    // distance in SF2.
    if (ctx.p1LastSpecialFramesAgo !== null && ctx.p1LastSpecialFramesAgo < 70) {
      return { held: ['down', 'right'], reason: 'block incoming projectile' };
    }

    // Priority 2b — block when P1 attacks close.
    if (state.p1.attacking && dist < 120) {
      return { held: ['down', 'right'], reason: 'block crouch close' };
    }

    // Priority 3 — fireball zoning at range. 90-frame cooldown (1.5s)
    // so we don't spam Hadoukens back-to-back like a bot.
    if (dist > 180 && ctx.framesSinceLastMove > 90) {
      return { queueMotion: 'hadoukenJab', reason: 'zoning fireball' };
    }

    // Priority 4 — reclaim distance when too close and not attacking.
    if (dist < 150) {
      return { held: ['right'], reason: 'walk back to distance' };
    }

    return { reason: 'neutral wait' };
  },
};
