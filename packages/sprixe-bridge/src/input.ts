/**
 * InputInjector — turns high-level remote commands into MAME
 * keystrokes, delivered through ydotool which writes to /dev/uinput.
 *
 * The kiosk page can't reach MAME directly while it's in the
 * foreground (Chromium is hidden behind the cage compositor's single
 * window once MAME takes over). Phone RemoteTab commands therefore
 * round-trip through the bridge and land here, which synthesizes the
 * same key events MAME's SDL2 input would have seen from a real
 * keyboard. ydotool is preferred over wtype because uinput-level
 * events bypass the compositor entirely — exactly what we need when
 * MAME owns the screen.
 */
import { spawn } from "node:child_process";

export type RemoteAction = "quit" | "pause" | "save" | "load" | "volume-up" | "volume-down";

/**
 * MAME default key bindings (Linux input event codes from
 * include/uapi/linux/input-event-codes.h). Keep the table here rather
 * than scattering magic numbers — the next time a key needs adding
 * the only edit site is one line.
 */
const KEY_ESC = 1;
const KEY_P = 25;
const KEY_F7 = 65;
const KEY_F8 = 66;
const KEY_LEFTSHIFT = 42;
const KEY_MINUS = 12;
const KEY_EQUAL = 13;

/** A keypress sequence: list of key codes pressed simultaneously and released in reverse. */
type KeySequence = readonly number[];

const ACTION_KEYS: Record<RemoteAction, KeySequence> = {
  quit: [KEY_ESC],
  pause: [KEY_P],
  save: [KEY_LEFTSHIFT, KEY_F7],
  load: [KEY_LEFTSHIFT, KEY_F8],
  // MAME's default UI master volume keys are Insert/Delete with the
  // UI mode active, but - / = work as plain shortcuts on the playing
  // surface. Reasonable approximation that doesn't require toggling
  // the MAME UI mode key.
  "volume-up": [KEY_EQUAL],
  "volume-down": [KEY_MINUS],
};

export type Runner = (cmd: string, args: readonly string[]) => Promise<void>;

const defaultRunner: Runner = (cmd, args) =>
  new Promise<void>((resolve, reject) => {
    const proc = spawn(cmd, [...args], { stdio: "ignore" });
    proc.on("error", reject);
    proc.on("exit", (code) =>
      code === 0 ? resolve() : reject(new Error(`${cmd} exited with code ${code}`))
    );
  });

export interface InputInjectorOptions {
  /** Path to the ydotool binary. Defaults to "ydotool" (PATH lookup). */
  bin?: string;
  /** Override the runner for tests so ydotool is never actually invoked. */
  runner?: Runner;
}

export class InputInjector {
  private readonly bin: string;
  private readonly runner: Runner;

  constructor(options: InputInjectorOptions = {}) {
    this.bin = options.bin ?? "ydotool";
    this.runner = options.runner ?? defaultRunner;
  }

  /**
   * Synthesize the keystrokes for the given action. Press codes
   * together, release in reverse — same shape ydotool's `key` mode
   * accepts (`<keycode>:1` for press, `:0` for release).
   */
  async send(action: RemoteAction): Promise<void> {
    const sequence = ACTION_KEYS[action];
    const args: string[] = ["key"];
    for (const code of sequence) args.push(`${code}:1`);
    for (const code of [...sequence].reverse()) args.push(`${code}:0`);
    await this.runner(this.bin, args);
  }
}
