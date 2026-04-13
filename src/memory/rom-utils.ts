/**
 * Shared ROM loading utilities — used by both CPS1 and Neo-Geo ROM loaders.
 */

import JSZip from 'jszip';

export interface RomFileEntry {
  name: string;
  data: Uint8Array;
}

/** Extract all files from a ZIP as RomFileEntry[]. */
export async function extractZip(file: File | ArrayBuffer): Promise<RomFileEntry[]> {
  const arrayBuffer = file instanceof ArrayBuffer ? file : await file.arrayBuffer();
  const zip = await JSZip.loadAsync(arrayBuffer);
  const entries: RomFileEntry[] = [];
  const promises: Promise<void>[] = [];

  zip.forEach((relativePath, zipEntry) => {
    if (zipEntry.dir) return;
    // Strip directory prefix — MAME ROMs are sometimes nested
    const name = relativePath.includes('/')
      ? relativePath.substring(relativePath.lastIndexOf('/') + 1)
      : relativePath;
    promises.push(
      zipEntry.async('uint8array').then(data => {
        entries.push({ name, data });
      })
    );
  });

  await Promise.all(promises);
  return entries;
}

/** Build a case-insensitive filename -> data map from extracted entries. */
export function buildFileMap(entries: RomFileEntry[]): Map<string, Uint8Array> {
  const map = new Map<string, Uint8Array>();
  for (const entry of entries) {
    map.set(entry.name.toLowerCase(), entry.data);
  }
  return map;
}
