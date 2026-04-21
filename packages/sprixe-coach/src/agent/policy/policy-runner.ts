import type { GameState } from '../../types';
import { InputSequencer, type VirtualButton, type VirtualInputChannel, type InputFrame } from '../input-sequencer';
import type { ConditionId, Policy, Rule } from './types';
import {
  createConditionContext,
  evaluateCondition,
  updateConditionContext,
  type ConditionContext,
} from './conditions';
import { resolveAction } from './actions';

/**
 * Executes a Policy — a weighted rule set authored by Claude or
 * hardcoded as a default. At each vblank:
 *   1. Update the derived condition context (p1 dx, last jump/special frames).
 *   2. Evaluate all rules, keep the ones whose conditions all match.
 *   3. Filter to the highest-priority group (anti-air > status > defense > neutral).
 *   4. Weighted-random pick one rule.
 *   5. Execute its action via InputSequencer.
 *
 * If the sequencer is busy executing a previous motion, we just tick
 * it and wait — no new decisions during a Hadouken wind-up.
 */
export class PolicyRunner {
  private policy: Policy;
  private readonly sequencer: InputSequencer;
  private readonly channel: VirtualInputChannel;
  private readonly ctx: ConditionContext;
  private frameIdx = 0;
  private lastDecisionLog = '';
  // Facing direction locked at the moment a motion is pushed. If P2
  // was on the RIGHT (facing LEFT = the default orientation for the
  // motion library), we push inputs unchanged. If P2 was on the LEFT
  // (facing RIGHT after a cross-up), we swap every 'left'↔'right' so
  // qcf becomes a real qcf regardless of which side we're on.
  private pushedFacing: 'left' | 'right' = 'left';

  constructor(channel: VirtualInputChannel, initialPolicy: Policy) {
    this.channel = channel;
    this.sequencer = new InputSequencer(channel);
    this.policy = initialPolicy;
    this.ctx = createConditionContext();
  }

  setPolicy(policy: Policy): void {
    this.policy = policy;
    console.log(`[ai-fighter] policy updated: ${policy.plan_tag ?? 'untagged'} (${policy.rules.length} rules)`);
  }

  getPolicy(): Policy { return this.policy; }

  onVblank(state: GameState): void {
    this.frameIdx++;
    updateConditionContext(this.ctx, state, this.frameIdx);

    // INTERRUPT: if an urgent defensive situation appears while we're
    // running a motion, drop it and re-decide immediately. Without this
    // the AI finishes its current poke while the opponent is hitting
    // it in the face.
    const dist = Math.abs(state.p1.x - state.p2.x);
    const shouldInterrupt = this.sequencer.busy && (
      // incoming jump from close — need anti-air NOW
      (state.p1.stateByte === 0x04 && dist < 180 && this.ctx.p1Dx > 0) ||
      // P1 throws a normal / special at close range — need to block
      (state.p1.attacking && dist < 140)
    );
    if (shouldInterrupt) {
      this.sequencer.clear();
    }

    if (this.sequencer.busy) {
      this.sequencer.tick();
      return;
    }

    const matched: Rule[] = [];
    for (const rule of this.policy.rules) {
      if (rule.if.every(c => evaluateCondition(c, state, this.ctx))) {
        matched.push(rule);
      }
    }

    if (matched.length === 0) {
      const fb = this.policy.fallback?.do;
      if (fb) this.execute(fb, state);
      else this.channel.releaseAll();
      return;
    }

    // Priority filtering: keep only rules from the most urgent group.
    const priorityTop = Math.max(...matched.map(r => rulePriority(r.if)));
    const topRules = matched.filter(r => rulePriority(r.if) === priorityTop);

    const chosen = weightedPick(topRules);
    if (!chosen) {
      this.channel.releaseAll();
      return;
    }

    const logKey = `${chosen.if.join('+')}→${chosen.do}`;
    if (logKey !== this.lastDecisionLog) {
      console.log(`[ai-fighter] ${chosen.if.join('+')} → ${chosen.do} (w=${chosen.weight}, outcome=${chosen.outcome ?? '-'})`);
      this.lastDecisionLog = logKey;
    }

    this.execute(chosen.do, state);
  }

  reset(): void {
    this.sequencer.clear();
    this.channel.releaseAll();
    this.ctx.prevState = null;
    this.ctx.p1LastJumpFrame = null;
    this.ctx.p1LastSpecialFrame = null;
    this.ctx.p1Dx = 0;
    this.ctx.p1JumpDrift = 0;
  }

  private execute(actionId: string, state: GameState): void {
    const result = resolveAction(actionId as Parameters<typeof resolveAction>[0]);
    // Determine which side we face RIGHT NOW. If P2.x > P1.x we're
    // on the right, facing LEFT — the default orientation for the
    // motion library. Otherwise we got crossed up and must flip.
    const facingLeft = state.p2.x >= state.p1.x;
    this.pushedFacing = facingLeft ? 'left' : 'right';

    if (result.kind === 'motion') {
      this.sequencer.push(flipFrames(result.frames, facingLeft));
    } else if (result.kind === 'held') {
      this.sequencer.push([{ held: flipButtons(result.held, facingLeft), frames: result.frames }]);
    }
    this.sequencer.tick();
  }
}

function flipButtons(buttons: readonly VirtualButton[], facingLeft: boolean): readonly VirtualButton[] {
  if (facingLeft) return buttons;
  return buttons.map(b => (b === 'left' ? 'right' : b === 'right' ? 'left' : b));
}

function flipFrames(frames: readonly InputFrame[], facingLeft: boolean): InputFrame[] {
  if (facingLeft) return frames.map(f => ({ ...f }));
  return frames.map(f => ({ ...f, held: flipButtons(f.held, false) }));
}

/**
 * Priority groups — higher = more urgent. When several rules match,
 * only the highest-group rules participate in the weighted draw.
 * This keeps anti-air mandatory and prevents rush-in from being
 * picked when a jump-in is incoming.
 */
function rulePriority(conds: readonly ConditionId[]): number {
  // CRITICAL: anti-air jump incoming
  if (conds.includes('p1_jump_forward') && (conds.includes('dist_close') || conds.includes('dist_mid'))) return 100;
  // URGENT: survival / capitalize
  if (conds.includes('me_stunned')) return 90;
  if (conds.includes('p1_stunned')) return 85;
  if (conds.includes('p1_whiffed_special')) return 80;
  // OPPORTUNITY: free punish window after a normal
  if (conds.includes('p1_recovery_normal')) return 75;
  // DEFENSIVE: incoming projectile / attack
  if (conds.includes('fireball_flying')) return 70;
  if (conds.includes('p1_attacking_special')) return 65;
  // Normals are long-lasting (~30 frames). Keep above cornered_them=50
  // so we actually defend when P1 counter-attacks from the corner,
  // but below cornered_me=60 so escape stays top priority.
  if (conds.includes('p1_attacking_normal')) return 55;
  // POSITIONAL
  if (conds.includes('cornered_me')) return 60;
  if (conds.includes('cornered_them')) return 50;
  // NEUTRAL
  return 10;
}

function weightedPick<T extends { weight: number }>(items: readonly T[]): T | null {
  if (items.length === 0) return null;
  const total = items.reduce((sum, r) => sum + r.weight, 0);
  if (total <= 0) return items[0] ?? null;
  let threshold = Math.random() * total;
  for (const it of items) {
    threshold -= it.weight;
    if (threshold <= 0) return it;
  }
  return items[items.length - 1] ?? null;
}
