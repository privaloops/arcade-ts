/**
 * rom-source — translate RomDB records into GameEntry browser cards.
 *
 * Metadata resolution:
 *   1. Look up the MAME description in @sprixe/engine's CPS1 catalogue
 *      (235 parent + clone entries).
 *   2. Parse a year out of the MAME description trailer (e.g.
 *      "(World 900227)" → 1990). Heuristic — may return null.
 *   3. Neo-Geo doesn't ship a bundled catalogue yet; fall back to a
 *      small built-in map for the popular titles, then to the raw id
 *      when the set is unknown.
 *   4. Publisher: CPS-1 is always "Capcom"; Neo-Geo varies per game,
 *      the lookup returns the known publisher or "SNK" as default.
 *
 * When the CDN media pipeline is wired (Phase 4) we'll prefer its
 * screenshot + video URLs over placeholders; Phase 2 keeps the
 * existing placeholder SVGs.
 */

import type { GameEntry, System } from "./games";
import type { RomRecord } from "../storage/rom-db";
import {
  CPS1_GAME_CATALOG,
  type CPS1GameEntry,
} from "@sprixe/engine/game-catalog";

const cps1Index = new Map<string, CPS1GameEntry>();
for (const entry of CPS1_GAME_CATALOG) cps1Index.set(entry.name, entry);

interface NeoGeoMeta {
  title: string;
  year: string;
  publisher: string;
}

const NEOGEO_META: Record<string, NeoGeoMeta> = {
  mslug:   { title: "Metal Slug",              year: "1996", publisher: "Nazca" },
  mslug2:  { title: "Metal Slug 2",            year: "1998", publisher: "SNK" },
  mslugx:  { title: "Metal Slug X",            year: "1999", publisher: "SNK" },
  mslug3:  { title: "Metal Slug 3",            year: "2000", publisher: "SNK" },
  kof97:   { title: "The King of Fighters '97", year: "1997", publisher: "SNK" },
  kof98:   { title: "The King of Fighters '98", year: "1998", publisher: "SNK" },
  kof99:   { title: "The King of Fighters '99", year: "1999", publisher: "SNK" },
  aof:     { title: "Art of Fighting",          year: "1992", publisher: "SNK" },
  aof2:    { title: "Art of Fighting 2",        year: "1994", publisher: "SNK" },
  samsho:  { title: "Samurai Shodown",          year: "1993", publisher: "SNK" },
  samsho2: { title: "Samurai Shodown II",       year: "1994", publisher: "SNK" },
  fatfury: { title: "Fatal Fury",               year: "1991", publisher: "SNK" },
  rbff1:   { title: "Real Bout Fatal Fury",     year: "1995", publisher: "SNK" },
  garou:   { title: "Garou: Mark of the Wolves", year: "1999", publisher: "SNK" },
  lastblad:{ title: "The Last Blade",           year: "1997", publisher: "SNK" },
};

/** Strip the trailing parenthesised qualifier from a MAME description. */
function cleanTitle(description: string): string {
  const idx = description.indexOf("(");
  if (idx < 0) return description.trim();
  return description.slice(0, idx).trim();
}

/** Extract the year from a MAME description trailer like "(World 900227)" → "1990". */
function extractYear(description: string): string | null {
  const m = description.match(/\((?:[^)]*?)(\d{2})(\d{4})\)/);
  if (!m) return null;
  const yy = parseInt(m[1]!, 10);
  // MAME date prefixes use 2-digit years; 80-99 → 1980s/1990s, 00-29 → 2000s/2020s.
  const century = yy >= 80 ? 1900 : 2000;
  return String(century + yy);
}

/**
 * Map a RomRecord into the GameEntry shape rendered by the browser.
 *
 * Always returns a valid entry — missing metadata falls back to the
 * raw id for title and defaults (Capcom + 1991 for CPS-1, SNK +
 * unknown for Neo-Geo) for the rest.
 */
export function romRecordToGameEntry(record: RomRecord): GameEntry {
  const system: System = record.system;
  if (system === "cps1") {
    const catalog = cps1Index.get(record.id);
    const title = catalog ? cleanTitle(catalog.description) : record.id;
    const year = catalog ? extractYear(catalog.description) ?? "1991" : "1991";
    return {
      id: record.id,
      title,
      year,
      publisher: "Capcom",
      system,
      screenshotUrl: "/media/placeholder-cps1.svg",
      videoUrl: null,
      favorite: record.favorite,
    };
  }

  const meta = NEOGEO_META[record.id];
  return {
    id: record.id,
    title: meta?.title ?? record.id,
    year: meta?.year ?? "1990",
    publisher: meta?.publisher ?? "SNK",
    system,
    screenshotUrl: "/media/placeholder-neogeo.svg",
    videoUrl: null,
    favorite: record.favorite,
  };
}
