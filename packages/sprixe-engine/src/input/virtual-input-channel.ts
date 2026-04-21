/**
 * Virtual input channel for programmatic control of a player slot.
 *
 * Used by the AI opponent (Claude + deterministic reflexes) to drive P2
 * in 2P-vs-Human mode. When set on InputManager via setVirtualP2(), the
 * channel REPLACES keyboard/gamepad reads for that slot — so a physical
 * 2nd pad plugged in won't fight the AI for control.
 *
 * State is "what's held RIGHT NOW". A higher-level InputSequencer can
 * schedule frame-by-frame button sequences on top of this (for motion
 * inputs like qcf+P).
 */

export type VirtualButton =
  | 'up' | 'down' | 'left' | 'right'
  | 'button1' | 'button2' | 'button3'
  | 'button4' | 'button5' | 'button6';

export class VirtualInputChannel {
  private held = new Set<VirtualButton>();

  /** Replace the held set in one shot. */
  setHeld(buttons: readonly VirtualButton[]): void {
    this.held.clear();
    for (const b of buttons) this.held.add(b);
  }

  press(button: VirtualButton): void { this.held.add(button); }
  release(button: VirtualButton): void { this.held.delete(button); }
  releaseAll(): void { this.held.clear(); }
  isPressed(button: VirtualButton): boolean { return this.held.has(button); }

  /** For debug: dump the current held set as a readable string. */
  snapshot(): string {
    return this.held.size === 0 ? '(none)' : [...this.held].join('+');
  }
}
