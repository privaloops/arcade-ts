import type { GameState } from '../../types';
import type { VirtualButton } from '../input-sequencer';

/**
 * Per-frame context a mode can rely on when deciding its action. The
 * ModeManager computes these on each tick so individual modes don't
 * have to duplicate edge detection for jumps, fireballs etc.
 */
export interface ModeContext {
  /** Frames since P1's last stateByte transition to 0x04 (jumping).
   *  null = P1 not jumping recently. Useful for anti-air timing. */
  p1JustJumpedFramesAgo: number | null;
  /** Frames since P1's last special startup (state transition to 0x0C).
   *  null = no recent special. */
  p1LastSpecialFramesAgo: number | null;
  /** True while the input sequencer is mid-motion — the mode is
   *  expected to back off and let the motion complete. */
  sequencerBusy: boolean;
  /** Frames elapsed since the previous motion finished. Modes use this
   *  as a cooldown to avoid spamming (e.g. 60 frames between fireballs). */
  framesSinceLastMove: number;
  /** Monotonic frame counter kept by the ModeManager. */
  frameIdx: number;
}

export interface ModeOutput {
  /** Buttons to hold THIS frame. Ignored if queueMotion is set. */
  held?: readonly VirtualButton[];
  /** Name of a motion in motions.ts to queue. Takes over the sequencer
   *  for its duration (~6-10 frames). */
  queueMotion?: string;
  /** Dev-log tag explaining why this tick decided what it did. */
  reason?: string;
}

export interface Mode {
  readonly name: string;
  readonly description: string;
  onTick(state: GameState, ctx: ModeContext): ModeOutput;
}
