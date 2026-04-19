/**
 * CPS-1 runner — wraps @sprixe/engine's Emulator behind the
 * EmulatorRunner interface. Instantiated by the system registry; the
 * PlayingScreen never imports the engine directly.
 */

import { Emulator } from "@sprixe/engine/emulator";
import type { EmulatorRunner } from "./emulator-runner";
import type { EngineGamepadMappingPatch } from "../input/mapping-store";

export interface Cps1RunnerOptions {
  canvas: HTMLCanvasElement;
  romBuffer: ArrayBuffer;
  /** Partial CPS1 gamepad mapping to merge onto the engine's defaults. */
  gamepadMapping?: EngineGamepadMappingPatch;
}

export async function createCps1Runner(opts: Cps1RunnerOptions): Promise<EmulatorRunner> {
  const emu = new Emulator(opts.canvas);
  await emu.loadRomFromBuffer(opts.romBuffer);
  // initAudio() tolerates missing AudioContext user-gesture — it just
  // logs + leaves the emulator silent rather than throwing.
  await emu.initAudio();
  applyGamepadMappingPatch(emu.getInputManager(), opts.gamepadMapping);

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
    destroy: () => emu.destroy(),
  };
}

type InputManagerLike = {
  getGamepadMapping(player: number): Record<string, number>;
  setGamepadMapping(player: number, mapping: Record<string, number>): void;
};

function applyGamepadMappingPatch(
  input: InputManagerLike | unknown,
  patch?: EngineGamepadMappingPatch,
): void {
  if (!patch || Object.keys(patch).length === 0) return;
  const im = input as InputManagerLike;
  im.setGamepadMapping(0, { ...im.getGamepadMapping(0), ...patch });
}
