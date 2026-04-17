/**
 * Sprixe Auto-Save — IndexedDB persistence with debounce.
 *
 * One auto-save slot per game. Stores the same JSON structure as .sprixe files.
 * Debounced at 2 seconds after the last modification.
 */

import type { RomStore } from '@sprixe/engine/rom-store';
import type { CapturedPose } from './sprite-analyzer';
import { buildSaveData } from './sprixe-save';

const DB_NAME = 'sprixe';
const DB_VERSION = 1;
const STORE_NAME = 'autosave';
const DEBOUNCE_MS = 2000;

// ---------------------------------------------------------------------------
// IndexedDB helpers
// ---------------------------------------------------------------------------

function openDb(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, DB_VERSION);
    req.onupgradeneeded = () => {
      const db = req.result;
      if (!db.objectStoreNames.contains(STORE_NAME)) {
        db.createObjectStore(STORE_NAME);
      }
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

function idbGet<T>(db: IDBDatabase, key: string): Promise<T | undefined> {
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE_NAME, 'readonly');
    const req = tx.objectStore(STORE_NAME).get(key);
    req.onsuccess = () => resolve(req.result as T | undefined);
    req.onerror = () => reject(req.error);
  });
}

function idbPut(db: IDBDatabase, key: string, value: unknown): Promise<void> {
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE_NAME, 'readwrite');
    const req = tx.objectStore(STORE_NAME).put(value, key);
    req.onsuccess = () => resolve();
    req.onerror = () => reject(req.error);
  });
}

function idbDelete(db: IDBDatabase, key: string): Promise<void> {
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE_NAME, 'readwrite');
    const req = tx.objectStore(STORE_NAME).delete(key);
    req.onsuccess = () => resolve();
    req.onerror = () => reject(req.error);
  });
}

function autoSaveKey(gameName: string): string {
  return `sprixe-autosave-${gameName}`;
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

/** Load auto-save data (returns the raw JSON string, or null) */
export async function loadAutoSave(gameName: string): Promise<string | null> {
  const db = await openDb();
  const data = await idbGet<string>(db, autoSaveKey(gameName));
  db.close();
  return data ?? null;
}

/** Clear auto-save for a game */
export async function clearAutoSave(gameName: string): Promise<void> {
  const db = await openDb();
  await idbDelete(db, autoSaveKey(gameName));
  db.close();
}

/** Save to IndexedDB (called by the debounced trigger) */
async function writeAutoSave(gameName: string, json: string): Promise<void> {
  const db = await openDb();
  await idbPut(db, autoSaveKey(gameName), json);
  db.close();
}

// ---------------------------------------------------------------------------
// Debounced auto-save manager
// ---------------------------------------------------------------------------

let debounceTimer: ReturnType<typeof setTimeout> | null = null;

/**
 * Schedule an auto-save. Debounced: only fires 2s after the last call.
 * Call this after every ROM modification (tile edit, palette edit, sample replace).
 */
export function scheduleAutoSave(romStore: RomStore, poses: CapturedPose[]): void {
  if (debounceTimer !== null) {
    clearTimeout(debounceTimer);
  }
  debounceTimer = setTimeout(() => {
    debounceTimer = null;
    const data = buildSaveData(romStore, poses);
    // Don't save if no ROM modifications (poses alone don't justify a restore prompt)
    const gfx = data.diffs.graphics?.length ?? 0;
    const prg = data.diffs.program?.length ?? 0;
    const oki = data.diffs.oki?.length ?? 0;
    if (gfx + prg + oki === 0) return;
    const json = JSON.stringify(data);
    writeAutoSave(romStore.name, json).catch(err => {
      console.warn('[Sprixe] Auto-save failed:', err);
    });
  }, DEBOUNCE_MS);
}
