import { readFileSync } from "node:fs";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import JSZip from "jszip";
import type { Page } from "@playwright/test";

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

export interface SeedRecord {
  id: string;
  system: "cps1" | "neogeo";
  kind?: "game" | "bios";
  /** Base64-encoded ROM zip bytes. Default: empty 4-byte placeholder. */
  zipB64?: string;
}

/**
 * Clear the 'roms' store and seed N records in a single transaction.
 * Skips deleteDatabase() because the app keeps a RomDB connection
 * alive, which would block the delete indefinitely.
 *
 * Pass `zipB64` for any record whose emulator is actually going to be
 * launched — PlayingScreen.create() calls identifyRom() on the bytes,
 * so a 4-byte placeholder would throw InvalidRomError.
 */
export async function resetAndSeedRomDB(
  page: Page,
  records: SeedRecord[],
): Promise<void> {
  await page.evaluate((rows) => {
    function b64ToBuf(b64: string): ArrayBuffer {
      const bin = atob(b64);
      const out = new Uint8Array(bin.length);
      for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
      return out.buffer;
    }
    return new Promise<void>((resolve, reject) => {
      const req = indexedDB.open("sprixe-arcade");
      req.onupgradeneeded = () => {
        const db = req.result;
        if (!db.objectStoreNames.contains("roms")) {
          db.createObjectStore("roms", { keyPath: "id" });
        }
      };
      req.onsuccess = () => {
        const db = req.result;
        const tx = db.transaction("roms", "readwrite");
        const store = tx.objectStore("roms");
        store.clear();
        for (const r of rows) {
          const zipData = r.zipB64 ? b64ToBuf(r.zipB64) : new ArrayBuffer(4);
          store.put({
            id: r.id,
            system: r.system,
            kind: r.kind ?? "game",
            zipData,
            addedAt: Date.now(),
            lastPlayedAt: 0,
            playCount: 0,
            favorite: false,
            size: zipData.byteLength,
          });
        }
        tx.oncomplete = () => {
          db.close();
          resolve();
        };
        tx.onerror = () => reject(tx.error);
      };
      req.onerror = () => reject(req.error);
    });
  }, records);
}

/**
 * Load tests/fixtures/test.zip as a base64 string so it can be passed
 * through page.evaluate() into IndexedDB.
 */
export function loadFixtureCps1Rom(): { id: string; zipB64: string } {
  const p = resolve(
    __dirname,
    "../../../../packages/sprixe-frontend/tests/fixtures/test.zip",
  );
  const bytes = readFileSync(p);
  const b64 = Buffer.from(bytes).toString("base64");
  return { id: "test", zipB64: b64 };
}

/**
 * Build a minimal Neo-Geo-shaped ZIP recognised by isNeoGeoRom (sees
 * the NNN-p1.p1 / NNN-c1.c1 pair). The bytes are zero-padded — the
 * point is only to make identifyRom() return system=neogeo so the
 * neogeo-runner runs its BIOS lookup. Used by tests that need a real
 * identification pass without shipping a genuine ROM.
 */
export async function buildMockNeoGeoGameZipB64(): Promise<string> {
  const zip = new JSZip();
  const pad = (size: number) => new Uint8Array(size);
  zip.file("201-p1.p1", pad(1024));
  zip.file("201-c1.c1", pad(1024));
  zip.file("201-c2.c2", pad(1024));
  zip.file("201-s1.s1", pad(1024));
  zip.file("201-m1.m1", pad(1024));
  zip.file("201-v1.v1", pad(1024));
  const blob = await zip.generateAsync({ type: "nodebuffer" });
  return blob.toString("base64");
}
