/**
 * CPS-1 runner — wraps @sprixe/engine's Emulator behind the
 * EmulatorRunner interface. Instantiated by the system registry; the
 * PlayingScreen never imports the engine directly.
 */

import { Emulator } from "@sprixe/engine/emulator";
import type { EmulatorRunner } from "./emulator-runner";
import type { InputMapping } from "../input/mapping-store";
import { applyUserMapping } from "./apply-mapping";

export interface Cps1RunnerOptions {
  canvas: HTMLCanvasElement;
  romBuffer: ArrayBuffer;
  /** User-captured mapping (P1 + optional P2). */
  mapping?: InputMapping | null;
}

export async function createCps1Runner(opts: Cps1RunnerOptions): Promise<EmulatorRunner> {
  const emu = new Emulator(opts.canvas);
  await emu.loadRomFromBuffer(opts.romBuffer);
  // initAudio() tolerates missing AudioContext user-gesture — it just
  // logs + leaves the emulator silent rather than throwing.
  await emu.initAudio();
  applyUserMapping(emu.getInputManager(), opts.mapping ?? null);

  return {
    start: () => emu.start(),
    stop: () => emu.stop(),
    // pause / resume also gate the audio so the music actually stops
    // while the pause overlay is open — `Emulator.pause()` alone only
    // freezes the CPU loop, the audio worker keeps streaming its
    // buffered samples on its own thread.
    pause: () => { emu.pause(); emu.suspendAudio(); },
    resume: () => { emu.resume(); emu.resumeAudio(); },
    isPaused: () => emu.isPaused(),
    isRunning: () => emu.isRunning(),
    getEngineFrames: () => emu.getFrameCount(),
    resumeAudio: () => emu.resumeAudio(),
    setVolume: (level: number) => emu.setVolume(level),
    saveState: () => emu.exportStateAsBuffer(),
    loadState: (buf: ArrayBuffer) => emu.importStateFromBuffer(buf),
    getWorkRam: () => emu.getWorkRam(),
    setVblankCallback: (cb) => emu.setVblankCallback(cb),
    destroy: () => emu.destroy(),
  };
}
