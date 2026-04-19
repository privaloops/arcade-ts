/**
 * Neo-Geo runner — wraps @sprixe/engine's NeoGeoEmulator.
 *
 * Unlike CPS-1, Neo-Geo requires a system BIOS (neogeo.zip) that is
 * copyright SNK and cannot ship with the app. The runner fetches the
 * BIOS bytes from RomDB by its canonical MAME id ("neogeo") before
 * handing them to the engine; if no such record exists, it throws
 * MissingBiosError so the UI can show a per-system upload prompt.
 *
 * saveState is not wired yet — the engine doesn't expose a snapshot
 * API for Neo-Geo (Phase 2.10 / Phase 5).
 */

import { NeoGeoEmulator } from "@sprixe/engine/neogeo-emulator";
import { WebGLRenderer } from "@sprixe/engine/video/renderer-webgl";
import { Renderer } from "@sprixe/engine/video/renderer";
import type { RendererInterface } from "@sprixe/engine/types";
import type { RomDB } from "../storage/rom-db";
import type { EmulatorRunner } from "./emulator-runner";
import type { EngineGamepadMappingPatch } from "../input/mapping-store";
import { MissingBiosError } from "./errors";

export interface NeoGeoRunnerOptions {
  canvas: HTMLCanvasElement;
  romBuffer: ArrayBuffer;
  romDb: RomDB;
  gamepadMapping?: EngineGamepadMappingPatch;
}

const BIOS_ID = "neogeo";

export async function createNeoGeoRunner(opts: NeoGeoRunnerOptions): Promise<EmulatorRunner> {
  const biosRec = await opts.romDb.get(BIOS_ID);
  if (!biosRec) {
    throw new MissingBiosError("neogeo", BIOS_ID);
  }

  let renderer: RendererInterface;
  try {
    renderer = new WebGLRenderer(opts.canvas);
  } catch {
    renderer = new Renderer(opts.canvas);
  }
  const emu = new NeoGeoEmulator(opts.canvas, renderer);
  await emu.loadRomFromBuffer(opts.romBuffer, biosRec.zipData);
  await emu.initAudio();
  if (opts.gamepadMapping && Object.keys(opts.gamepadMapping).length > 0) {
    const im = emu.getInputManager();
    im.setGamepadMapping(0, { ...im.getGamepadMapping(0), ...opts.gamepadMapping });
  }

  return {
    start: () => emu.start(),
    stop: () => emu.stop(),
    pause: () => { emu.pause(); emu.suspendAudio(); },
    resume: () => { emu.resume(); emu.resumeAudio(); },
    isPaused: () => emu.isPaused(),
    isRunning: () => emu.isRunning(),
    resumeAudio: () => emu.resumeAudio(),
    setVolume: (level: number) => emu.setVolume(level),
    // saveState / loadState intentionally omitted — engine lacks the API.
    destroy: () => emu.stop(),
  };
}
