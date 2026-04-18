/**
 * Identify whether a ROM ArrayBuffer is a CPS-1 or Neo-Geo MAME ZIP.
 *
 * Reuses @sprixe/engine's two canonical identification helpers:
 *   - identifyGame(fileNames) — CPS-1 game defs
 *   - isNeoGeoRom(fileNames) — Neo-Geo naming heuristics
 *
 * No emulator is instantiated; this is a pure ArrayBuffer → System
 * resolution suitable for running during a WebRTC transfer so the host
 * can route the ROM to the right store and reject incompatible uploads
 * before they hit IndexedDB.
 */

import JSZip from "jszip";
import { identifyGame } from "@sprixe/engine/memory/rom-loader";
import { isNeoGeoRom } from "@sprixe/engine/memory/neogeo-rom-loader";
import { InvalidRomError, UnsupportedSystemError } from "./errors";

export type System = "cps1" | "neogeo";

export interface Identification {
  system: System;
  fileNames: readonly string[];
  /** ROM set name (e.g. "sf2", "mslug"). Not available for generic Neo-Geo sets. */
  setName: string | null;
}

export async function identifyRom(data: ArrayBuffer): Promise<Identification> {
  let zip: JSZip;
  try {
    zip = await JSZip.loadAsync(data);
  } catch (e) {
    throw new InvalidRomError("Not a valid ZIP archive", e);
  }

  const fileNames = Object.keys(zip.files).filter((name) => !zip.files[name]!.dir);
  if (fileNames.length === 0) {
    throw new InvalidRomError("ZIP archive is empty");
  }

  // Neo-Geo first: CPS-1 game ids can sometimes accidentally match a
  // Neo-Geo set name prefix, but isNeoGeoRom checks for the distinctive
  // program/m1/v1 layering which CPS-1 sets don't have.
  if (isNeoGeoRom(fileNames)) {
    return { system: "neogeo", fileNames, setName: null };
  }

  const cps1Def = identifyGame(fileNames);
  if (cps1Def !== null) {
    return { system: "cps1", fileNames, setName: cps1Def.name };
  }

  throw new UnsupportedSystemError(
    `Unknown ROM system. First files: ${fileNames.slice(0, 5).join(", ")}`,
    fileNames
  );
}
