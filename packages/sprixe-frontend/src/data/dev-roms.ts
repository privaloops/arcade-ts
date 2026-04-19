/**
 * Dev-only bootstrap — pulls the sibling sprixe-edit ROM catalogue
 * through the vite middleware (`/__dev-roms/*`) into IndexedDB on
 * first boot. Production builds never hit this code: the endpoint 404s
 * without the vite plugin, so `fetchManifest` returns an empty list
 * and `bootstrapDevRoms` becomes a no-op.
 */

import type { RomPipeline } from "../p2p/rom-pipeline";
import type { RomRecord } from "../storage/rom-db";
import type { Toast } from "../ui/toast";

interface ManifestEntry {
  system: string;
  file: string;
  path: string;
  size: number;
}

async function fetchManifest(): Promise<ManifestEntry[]> {
  try {
    const resp = await fetch("/__dev-roms/manifest.json");
    if (!resp.ok) return [];
    const data = (await resp.json()) as unknown;
    return Array.isArray(data) ? (data as ManifestEntry[]) : [];
  } catch {
    return [];
  }
}

export async function bootstrapDevRoms(
  pipeline: RomPipeline,
  toast: Toast,
): Promise<RomRecord[]> {
  const manifest = await fetchManifest();
  if (manifest.length === 0) return [];

  toast.show("success", `Importing ${manifest.length} dev ROMs…`);
  const records: RomRecord[] = [];
  let ok = 0;
  let failed = 0;

  for (const entry of manifest) {
    try {
      const resp = await fetch(entry.path);
      if (!resp.ok) { failed += 1; continue; }
      const data = await resp.arrayBuffer();
      const { record } = await pipeline.process({ name: entry.file, data });
      records.push(record);
      ok += 1;
    } catch (e) {
      failed += 1;
      console.warn(`[dev-roms] ${entry.file} skipped:`, e);
    }
  }

  const msg = failed > 0
    ? `Imported ${ok} / ${manifest.length} dev ROMs (${failed} skipped)`
    : `Imported ${ok} dev ROMs`;
  toast.show(failed > 0 ? "error" : "success", msg);
  return records;
}
