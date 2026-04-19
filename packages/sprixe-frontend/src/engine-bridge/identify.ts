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
export type Kind = "game" | "bios";

export interface Identification {
  system: System;
  kind: Kind;
  fileNames: readonly string[];
  /** ROM set name (e.g. "sf2", "mslug", "neogeo" for the BIOS). Not available for generic Neo-Geo game sets. */
  setName: string | null;
}

/**
 * Neo-Geo BIOS ZIPs contain the MVS/AES system ROMs (sp-s2.sp1 etc.)
 * but none of the per-game {NNN}-p1.p1 / C-ROM pairs that
 * isNeoGeoRom() keys off of. Checking for either sp-s{2,}.sp1 lets
 * us recognise an upload of the user's own neogeo.zip.
 */
function isNeoGeoBios(fileNames: readonly string[]): boolean {
  const lower = fileNames.map((n) => n.toLowerCase());
  return lower.some((n) => /^sp-s2?\.sp1$/.test(n) || n === "sp-j3.sp1" || n === "asia-s3.rom");
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

  // BIOS first — a Neo-Geo BIOS ZIP has no NNN-p1.p1 pair, so
  // isNeoGeoRom() would otherwise reject it as unknown.
  if (isNeoGeoBios(fileNames)) {
    return { system: "neogeo", kind: "bios", fileNames, setName: "neogeo" };
  }

  // Neo-Geo games: CPS-1 game ids can sometimes accidentally match a
  // Neo-Geo set name prefix, but isNeoGeoRom checks for the distinctive
  // program/m1/v1 layering which CPS-1 sets don't have.
  if (isNeoGeoRom(fileNames)) {
    return { system: "neogeo", kind: "game", fileNames, setName: null };
  }

  const cps1Def = identifyGame(fileNames);
  if (cps1Def !== null) {
    return { system: "cps1", kind: "game", fileNames, setName: cps1Def.name };
  }

  throw new UnsupportedSystemError(
    `Unknown ROM system. First files: ${fileNames.slice(0, 5).join(", ")}`,
    fileNames
  );
}
