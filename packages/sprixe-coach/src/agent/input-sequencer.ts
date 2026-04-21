// Local structural definition of the engine's virtual input channel so
// this package's rootDir stays sealed. TypeScript's structural typing
// matches this against the real VirtualInputChannel class at the call
// site in sprixe-frontend without needing an import.
export type VirtualButton =
  | 'up' | 'down' | 'left' | 'right'
  | 'button1' | 'button2' | 'button3'
  | 'button4' | 'button5' | 'button6';

export interface VirtualInputChannel {
  press(button: VirtualButton): void;
  release(button: VirtualButton): void;
  releaseAll(): void;
  setHeld(buttons: readonly VirtualButton[]): void;
  isPressed(button: VirtualButton): boolean;
}

export interface InputFrame {
  held: readonly VirtualButton[];
  /** Duration in frames (60Hz). Default 1. */
  frames?: number;
}

/**
 * Consumes queued input frames one per vblank, pushing them to the
 * virtual channel. When the queue is empty, releases every button
 * (neutral state).
 *
 * SF2 motion inputs (qcf+P, charge F+P, etc.) are enqueued as a
 * sequence of 4-8 frames — this yields a reproducible special move
 * with no reliance on setTimeout drift.
 */
export class InputSequencer {
  private queue: VirtualButton[][] = [];

  constructor(private readonly channel: VirtualInputChannel) {}

  push(sequence: readonly InputFrame[]): void {
    for (const f of sequence) {
      const n = f.frames ?? 1;
      const held = [...f.held];
      for (let i = 0; i < n; i++) this.queue.push([...held]);
    }
  }

  /** Advance one frame. Call from the vblank callback. */
  tick(): void {
    const next = this.queue.shift();
    if (next !== undefined) {
      this.channel.setHeld(next);
    } else {
      this.channel.releaseAll();
    }
  }

  clear(): void {
    this.queue = [];
    this.channel.releaseAll();
  }

  /** Remaining queued frames. */
  get pending(): number { return this.queue.length; }

  /** True while a sequence is in flight. */
  get busy(): boolean { return this.queue.length > 0; }
}
