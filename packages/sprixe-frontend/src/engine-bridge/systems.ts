/**
 * Registry of supported arcade systems. A single entry declares how to
 * build a runner from a canvas + ROM buffer, plus whether that system
 * requires a BIOS lookup against RomDB. Adding a new system is a one-line
 * change; PlayingScreen never branches on `system`.
 */

import type { RomDB } from "../storage/rom-db";
import type { EmulatorRunner } from "./emulator-runner";
import type { System } from "./identify";
import type { InputMapping } from "../input/mapping-store";
import { createCps1Runner } from "./cps1-runner";
import { createNeoGeoRunner } from "./neogeo-runner";

export interface CreateRunnerOptions {
  canvas: HTMLCanvasElement;
  romBuffer: ArrayBuffer;
  romDb: RomDB;
  /** User-captured mapping (P1 + optional P2). Runners merge it on top
   *  of the engine's defaults for both gamepad and keyboard. */
  mapping?: InputMapping | null;
  /** Maps Settings > Audio > Latency to the AudioContext latencyHint. */
  latencyHint?: AudioContextLatencyCategory;
}

export interface SystemSpec {
  /** Optional RomDB id fetched as BIOS before building the runner. */
  requiredBios?: string;
  createRunner(opts: CreateRunnerOptions): Promise<EmulatorRunner>;
}

const SYSTEMS: Record<System, SystemSpec> = {
  cps1: {
    createRunner: ({ canvas, romBuffer, mapping, latencyHint }) =>
      createCps1Runner({
        canvas,
        romBuffer,
        ...(mapping ? { mapping } : {}),
        ...(latencyHint ? { latencyHint } : {}),
      }),
  },
  neogeo: {
    requiredBios: "neogeo",
    createRunner: (opts) => createNeoGeoRunner(opts),
  },
};

export function getSystemSpec(system: System): SystemSpec {
  return SYSTEMS[system];
}

export async function createRunner(
  system: System,
  opts: CreateRunnerOptions,
): Promise<EmulatorRunner> {
  return SYSTEMS[system].createRunner(opts);
}
