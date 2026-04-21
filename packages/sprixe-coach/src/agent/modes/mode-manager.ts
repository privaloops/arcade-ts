import type { GameState } from '../../types';
import { InputSequencer, type VirtualInputChannel } from '../input-sequencer';
import { RYU_MOTIONS_FACING_LEFT } from '../motions';
import type { Mode, ModeContext } from './types';

/**
 * Orchestrates the tick loop: reads GameState each vblank, computes the
 * ModeContext, asks the current Mode for an action, and pushes the
 * action to the virtual input channel via the sequencer.
 *
 * Mode switching is done by the strategy layer (Claude, ~5s cadence)
 * via setMode(). In-flight motions are not interrupted — they complete,
 * then the new mode takes over on the next tick.
 */
export class ModeManager {
  private currentMode: Mode;
  private readonly sequencer: InputSequencer;
  private readonly channel: VirtualInputChannel;
  private prevP1State = 0;
  private prevP1Attacking = false;
  private p1LastJumpFrame: number | null = null;
  private p1LastSpecialFrame: number | null = null;
  private lastMoveEndFrame = 0;
  private wasSequencerBusy = false;
  private frameIdx = 0;

  constructor(channel: VirtualInputChannel, initialMode: Mode) {
    this.channel = channel;
    this.sequencer = new InputSequencer(channel);
    this.currentMode = initialMode;
  }

  setMode(mode: Mode): void {
    if (this.currentMode.name === mode.name) return;
    console.log(`[ai-fighter] mode switch: ${this.currentMode.name} → ${mode.name}`);
    this.currentMode = mode;
  }

  getCurrentMode(): Mode { return this.currentMode; }

  onVblank(state: GameState): void {
    this.frameIdx++;

    // Edge detect: P1 rising into a jump.
    if (state.p1.stateByte === 0x04 && this.prevP1State !== 0x04) {
      this.p1LastJumpFrame = this.frameIdx;
    }
    // Edge detect: P1 rising into a special (state 0x0C) and attacking.
    if (state.p1.stateByte === 0x0C && state.p1.attacking && !this.prevP1Attacking) {
      this.p1LastSpecialFrame = this.frameIdx;
    }
    this.prevP1State = state.p1.stateByte;
    this.prevP1Attacking = state.p1.attacking;

    // Track the falling edge of "sequencer busy" — that's the frame a
    // motion just finished. Modes use framesSinceLastMove as a cooldown
    // to avoid re-queueing another motion on the very next tick.
    if (this.wasSequencerBusy && !this.sequencer.busy) {
      this.lastMoveEndFrame = this.frameIdx;
    }
    this.wasSequencerBusy = this.sequencer.busy;

    // While a motion is running, just tick the sequencer — no new
    // decisions (prevents anti-air re-triggering mid-Shoryu).
    if (this.sequencer.busy) {
      this.sequencer.tick();
      return;
    }

    const ctx: ModeContext = {
      p1JustJumpedFramesAgo:
        this.p1LastJumpFrame !== null ? this.frameIdx - this.p1LastJumpFrame : null,
      p1LastSpecialFramesAgo:
        this.p1LastSpecialFrame !== null ? this.frameIdx - this.p1LastSpecialFrame : null,
      sequencerBusy: false,
      framesSinceLastMove: this.frameIdx - this.lastMoveEndFrame,
      frameIdx: this.frameIdx,
    };

    const action = this.currentMode.onTick(state, ctx);

    if (action.queueMotion) {
      const motion = (RYU_MOTIONS_FACING_LEFT as Record<string, ReadonlyArray<import('../input-sequencer').InputFrame>>)[action.queueMotion];
      if (motion) {
        this.sequencer.push(motion);
      } else {
        console.warn(`[ai-fighter] unknown motion requested: ${action.queueMotion}`);
      }
      this.sequencer.tick();
      return;
    }

    if (action.held) {
      this.channel.setHeld(action.held);
    } else {
      this.channel.releaseAll();
    }
  }

  reset(): void {
    this.sequencer.clear();
    this.channel.releaseAll();
    this.prevP1State = 0;
    this.prevP1Attacking = false;
    this.p1LastJumpFrame = null;
    this.p1LastSpecialFrame = null;
    this.lastMoveEndFrame = 0;
    this.wasSequencerBusy = false;
  }
}
