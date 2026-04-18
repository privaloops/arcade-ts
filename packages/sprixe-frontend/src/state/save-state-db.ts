/**
 * SaveStateDB — IndexedDB backend for per-game save states.
 *
 * @sprixe/edit persists save states to localStorage (4 slots per game,
 * ~250 KB each encoded as base64). Arcade frontend needs binary
 * snapshots (CPU + RAM + VRAM packed into a single ArrayBuffer), so we
 * store raw buffers keyed by `${gameId}:${slot}` in the same
 * 'sprixe-arcade' database that already owns the ROM store.
 *
 * Migration: if localStorage still holds the old keys
 * `sprixe-savestate-{gameId}-{slot}` (base64-encoded), migrateFromLocal
 * Storage() decodes + writes them into IDB and removes the originals
 * so a user who upgraded from the edit app doesn't lose their slots.
 */

const DB_NAME = "sprixe-arcade";
const STORE_STATES = "savestates";
const DB_VERSION = 2; // bumped from 1 to add the savestates store

/** Number of slots available per game (§2.6). */
export const SLOT_COUNT = 4;

export interface SaveStateRecord {
  gameId: string;
  slot: number;
  data: ArrayBuffer;
  timestamp: number;
}

export interface SlotInfo {
  slot: number;
  timestamp: number;
  size: number;
}

function slotKey(gameId: string, slot: number): string {
  return `${gameId}:${slot}`;
}

export class SaveStateDB {
  private dbPromise: Promise<IDBDatabase> | null = null;

  constructor(private readonly dbName: string = DB_NAME) {}

  async open(): Promise<IDBDatabase> {
    if (this.dbPromise) return this.dbPromise;
    this.dbPromise = new Promise<IDBDatabase>((resolve, reject) => {
      const req = indexedDB.open(this.dbName, DB_VERSION);
      req.onupgradeneeded = () => {
        const db = req.result;
        if (!db.objectStoreNames.contains("roms")) {
          const roms = db.createObjectStore("roms", { keyPath: "id" });
          roms.createIndex("lastPlayedAt", "lastPlayedAt");
          roms.createIndex("system", "system");
        }
        if (!db.objectStoreNames.contains(STORE_STATES)) {
          const states = db.createObjectStore(STORE_STATES, { keyPath: "key" });
          states.createIndex("gameId", "gameId");
        }
      };
      req.onsuccess = () => resolve(req.result);
      req.onerror = () => reject(req.error ?? new Error("Failed to open SaveStateDB"));
    });
    return this.dbPromise;
  }

  close(): void {
    if (!this.dbPromise) return;
    const p = this.dbPromise;
    this.dbPromise = null;
    p.then((db) => db.close()).catch(() => {});
  }

  async save(gameId: string, slot: number, data: ArrayBuffer): Promise<void> {
    if (slot < 0 || slot >= SLOT_COUNT) {
      throw new RangeError(`slot ${slot} is out of range [0, ${SLOT_COUNT})`);
    }
    const db = await this.open();
    return new Promise<void>((resolve, reject) => {
      const tx = db.transaction(STORE_STATES, "readwrite");
      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(tx.error ?? new Error("save() failed"));
      tx.objectStore(STORE_STATES).put({
        key: slotKey(gameId, slot),
        gameId,
        slot,
        data,
        timestamp: Date.now(),
      });
    });
  }

  async load(gameId: string, slot: number): Promise<SaveStateRecord | null> {
    const db = await this.open();
    return new Promise<SaveStateRecord | null>((resolve, reject) => {
      const tx = db.transaction(STORE_STATES, "readonly");
      const req = tx.objectStore(STORE_STATES).get(slotKey(gameId, slot));
      req.onsuccess = () => {
        const row = req.result as (SaveStateRecord & { key: string }) | undefined;
        if (!row) return resolve(null);
        const { gameId: g, slot: s, data, timestamp } = row;
        resolve({ gameId: g, slot: s, data, timestamp });
      };
      req.onerror = () => reject(req.error ?? new Error("load() failed"));
    });
  }

  async delete(gameId: string, slot: number): Promise<void> {
    const db = await this.open();
    return new Promise<void>((resolve, reject) => {
      const tx = db.transaction(STORE_STATES, "readwrite");
      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(tx.error ?? new Error("delete() failed"));
      tx.objectStore(STORE_STATES).delete(slotKey(gameId, slot));
    });
  }

  async listSlots(gameId: string): Promise<SlotInfo[]> {
    const db = await this.open();
    return new Promise<SlotInfo[]>((resolve, reject) => {
      const tx = db.transaction(STORE_STATES, "readonly");
      const index = tx.objectStore(STORE_STATES).index("gameId");
      const req = index.getAll(gameId);
      req.onsuccess = () => {
        const rows = (req.result ?? []) as SaveStateRecord[];
        resolve(
          rows
            .map((r) => ({ slot: r.slot, timestamp: r.timestamp, size: r.data.byteLength }))
            .sort((a, b) => a.slot - b.slot)
        );
      };
      req.onerror = () => reject(req.error ?? new Error("listSlots() failed"));
    });
  }

  /**
   * Scan localStorage for `sprixe-savestate-{gameId}-{slot}` keys,
   * decode the base64 payload, persist to IDB, and clean up the
   * originals. Idempotent — safe to call on every boot.
   *
   * Returns the number of states migrated.
   */
  async migrateFromLocalStorage(): Promise<number> {
    const pattern = /^sprixe-savestate-(.+)-(\d+)$/;
    const toMigrate: { gameId: string; slot: number; key: string; data: ArrayBuffer }[] = [];
    for (let i = 0; i < localStorage.length; i++) {
      const key = localStorage.key(i);
      if (!key) continue;
      const match = pattern.exec(key);
      if (!match) continue;
      const raw = localStorage.getItem(key);
      if (!raw) continue;
      try {
        const data = base64ToBuffer(raw);
        toMigrate.push({ gameId: match[1]!, slot: Number(match[2]!), key, data });
      } catch {
        // Malformed payload — skip so the migration stays best-effort.
      }
    }

    for (const entry of toMigrate) {
      await this.save(entry.gameId, entry.slot, entry.data);
      localStorage.removeItem(entry.key);
    }
    return toMigrate.length;
  }
}

function base64ToBuffer(b64: string): ArrayBuffer {
  const bin = atob(b64);
  const out = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
  return out.buffer;
}
