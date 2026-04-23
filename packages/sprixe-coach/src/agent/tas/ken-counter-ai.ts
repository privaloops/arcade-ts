import type { GameState } from '../../types';
import type { ActionId } from '../policy/types';
import {
  InputSequencer,
  type VirtualButton,
  type VirtualInputChannel,
  type InputFrame,
} from '../input-sequencer';
import { resolveMotion } from '../policy/actions';
import { actionForAnimPtr } from './move-map';
import { pickPunish } from './punish-engine';
import type { KenSnapshot, OpponentSnapshot } from './punish-sim';

/**
 * Ken counter-AI — per-frame decision loop with two modes.
 *
 *   PUNISH mode — opponent is committed (stateByte ∈ {0x0A, 0x0C}).
 *     Snapshot his animPtr + position, call `pickPunish`, execute the
 *     damage-optimal response from the hierarchy.
 *
 *   NEUTRAL mode — nobody is attacking. Simple rule for v1:
 *     - dist > NEUTRAL_ZONE_DIST  → hadouken_jab (zoning).
 *     - dist ≤ NEUTRAL_ZONE_DIST  → idle (Ken waits).
 *     This already covers "I'm walking forward and crossing into his
 *     fireball range": Ken fireballs → I get hit or must block/jump.
 *
 * The per-frame gate (cooldown + state=0x00 + sequencer free) is the
 * same for both modes; only the decision function differs.
 */

/** Minimum frames between two fires. Covers the duration of Ken's
 *  longest immediate response so we don't spam inputs while his own
 *  attack is still animating. */
const COOLDOWN_FRAMES = 18;

/** Opponent state bytes that mean "committed to a move we can punish". */
const OPPONENT_ATTACK_STATES: ReadonlySet<number> = new Set([0x0A, 0x0C]);

/** Centre-to-centre distance (px) at which Ken prefers zoning with a
 *  fireball over waiting. Below this, Ken stays idle in v1 neutral;
 *  a future pass will surface ground pokes via pickPunish-static. */
const NEUTRAL_ZONE_DIST = 120;

export class KenCounterAi {
  private readonly sequencer: InputSequencer;
  private lastCounterFrame = -Infinity;

  constructor(private readonly channel: VirtualInputChannel) {
    this.sequencer = new InputSequencer(channel);
    console.log('[ken-counter-ai] armed — per-frame decision loop (punish + neutral zone)');
  }

  onVblank(state: GameState, rom: Uint8Array): void {
    this.sequencer.tick();

    // Shared gate: Ken must be free to act this frame.
    if (this.sequencer.busy) return;
    if (state.frameIdx - this.lastCounterFrame < COOLDOWN_FRAMES) return;
    if (state.p2.stateByte !== 0x00) return;

    const ken: KenSnapshot = {
      x: state.p2.x,
      y: state.p2.posY ?? 0,
      facingLeft: state.p2.facingLeft ?? false,
      hp: state.p2.hp,
    };

    // ── PUNISH mode ─────────────────────────────────────────────────
    // Opponent is committed to a move. Every frame while he's locked
    // we re-evaluate and fire the highest-deltaHp response, letting
    // pickPunish handle the hierarchy + death-guard + trade math.
    if (OPPONENT_ATTACK_STATES.has(state.p1.stateByte)) {
      const moveName = actionForAnimPtr(state.p1.charId, state.p1.animPtr);
      if (!moveName) return;        // transient animPtr; retry next frame
      const opponent: OpponentSnapshot = {
        x: state.p1.x,
        y: state.p1.posY ?? 0,
        facingLeft: state.p1.facingLeft ?? false,
        animPtrAtMoveStart: state.p1.animPtr,
        framesSinceMoveStart: 0,
        moveName,
        hitboxPtr: state.p1.hitboxPtr ?? 0,
      };
      const decision = pickPunish(opponent, ken, rom);
      if (!decision) {
        console.log(
          `[ken-counter-ai] f=${state.frameIdx} vs ${moveName} — empty candidate pool, block fallback`,
        );
        this.executeMotion('block_crouch', state);
        this.lastCounterFrame = state.frameIdx;
        return;
      }
      const action = decision.option.sequence[0]!;
      console.log(
        `[ken-counter-ai] f=${state.frameIdx} PUNISH vs ${moveName}`
        + ` → ${decision.option.id} (${action}, deltaHp=${decision.deltaHp > 0 ? '+' : ''}${decision.deltaHp},`
        + ` dmg=${decision.option.damage}, taken=${decision.simResult.kenDamageTaken})`,
      );
      this.executeMotion(action, state);
      this.lastCounterFrame = state.frameIdx;
      return;
    }

    // ── NEUTRAL mode ────────────────────────────────────────────────
    // Nobody is attacking. v1 rule: hadouken at distance (zone the
    // opponent), idle within the poke zone. A future pass will call a
    // "static" variant of pickPunish here to surface sweep/cMK/sHP
    // when the opponent's idle hurtboxes are in range.
    const dist = Math.abs(state.p1.x - state.p2.x);
    if (dist > NEUTRAL_ZONE_DIST) {
      console.log(
        `[ken-counter-ai] f=${state.frameIdx} NEUTRAL zone dist=${dist} → hadouken_jab`,
      );
      this.executeMotion('hadouken_jab', state);
      this.lastCounterFrame = state.frameIdx;
    }
    // dist ≤ NEUTRAL_ZONE_DIST: stay idle in v1; we let the punish
    // branch catch any commitment the opponent makes next.
  }

  reset(): void {
    this.sequencer.clear();
    this.channel.releaseAll();
    this.lastCounterFrame = -Infinity;
  }

  /** True when the counter-AI pushed an action during the given frame.
   *  Used by the coach controller to arbitrate with the offence LLM:
   *  both modules share the same virtual-P2 channel, so the LLM must
   *  yield the frame when the counter just wrote to it. */
  firedOnFrame(frameIdx: number): boolean {
    return this.lastCounterFrame === frameIdx;
  }

  private executeMotion(action: ActionId, state: GameState): void {
    const result = resolveMotion(action);
    const facingLeft = state.p2.x >= state.p1.x;
    if (result.kind === 'motion') {
      this.sequencer.push(flipFrames(result.frames, facingLeft));
    } else if (result.kind === 'held') {
      this.sequencer.push([{
        held: flipButtons(result.held, facingLeft),
        frames: result.frames,
      }]);
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
