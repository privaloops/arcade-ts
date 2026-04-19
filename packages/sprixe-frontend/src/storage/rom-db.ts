/**
 * RomDB — IndexedDB-backed store for uploaded ROMs.
 *
 * Database: `sprixe-arcade` (v1)
 * Object store: `roms` (keyPath: id, no autoincrement)
 *
 * The frontend consumes ROMs exclusively through this store: the ROM
 * upload flow writes here, the browser screen reads its catalogue from
 * here, and the playing flow pulls `zipData` back to feed the emulator.
 *
 * Error handling: QuotaExceededError is rethrown as-is so the upload UI
 * can show a "Storage full" message. All other DB errors surface with
 * their original `name` / `message` preserved.
 */

export type System = "cps1" | "neogeo";
export type RomKind = "game" | "bios";

export interface RomRecord {
  /** MAME ROM set name — stable id across the app. */
  id: string;
  system: System;
  /**
   * Distinguish playable games from system BIOS (e.g. Neo-Geo's
   * `neogeo.zip`). BIOS records are filtered out of the browser list
   * and fetched on demand by the matching runner.
   */
  kind: RomKind;
  /** Raw ZIP bytes. Binary ArrayBuffer, never base64. */
  zipData: ArrayBuffer;
  /** Unix ms timestamp. */
  addedAt: number;
  /** Unix ms timestamp. 0 means never played. */
  lastPlayedAt: number;
  playCount: number;
  favorite: boolean;
  /** Size in bytes — redundant with zipData.byteLength but avoids fetching the blob for the browser list. */
  size: number;
}

export type RomRecordInput =
  | RomRecord
  | (Omit<RomRecord, "addedAt" | "lastPlayedAt" | "playCount" | "favorite" | "size" | "kind"> & {
      kind?: RomKind;
      addedAt?: number;
      lastPlayedAt?: number;
      playCount?: number;
      favorite?: boolean;
      size?: number;
    });

const DB_NAME = "sprixe-arcade";
// v5 (2026-04 Phase 2 real-emulator wiring): RomRecord gains a `kind`
// field to distinguish games from system BIOS. Migration runs inside
// onupgradeneeded and tags every pre-existing record as `kind: "game"`
// so the list() default filter still surfaces them.
// v4 (Phase 4b.2c) healed databases left at v3 without the 'media'
// store. The idempotent onupgradeneeded creates whichever of the three
// stores is missing, so bumping the version re-runs the creation block
// and repairs the schema.
const DB_VERSION = 5;
const STORE_ROMS = "roms";

export class RomDB {
  private dbPromise: Promise<IDBDatabase> | null = null;

  constructor(private readonly dbName: string = DB_NAME) {}

  /** Open or upgrade the database. Idempotent. */
  async open(): Promise<IDBDatabase> {
    if (this.dbPromise) return this.dbPromise;
    this.dbPromise = new Promise<IDBDatabase>((resolve, reject) => {
      const req = indexedDB.open(this.dbName, DB_VERSION);
      req.onupgradeneeded = (event) => {
        const db = req.result;
        const tx = req.transaction;
        const oldVersion = event.oldVersion;
        // Shared schema creation — any module that opens the DB first
        // lands all three stores so a later module's open() at v4 is
        // a no-op upgrade. See src/state/save-state-db.ts +
        // src/media/media-cache.ts for their own store contracts.
        if (!db.objectStoreNames.contains(STORE_ROMS)) {
          const store = db.createObjectStore(STORE_ROMS, { keyPath: "id" });
          store.createIndex("lastPlayedAt", "lastPlayedAt");
          store.createIndex("system", "system");
        }
        if (!db.objectStoreNames.contains("savestates")) {
          const store = db.createObjectStore("savestates", { keyPath: "key" });
          store.createIndex("gameId", "gameId");
        }
        if (!db.objectStoreNames.contains("media")) {
          db.createObjectStore("media", { keyPath: "key" });
        }
        // v4 → v5: tag legacy records with kind="game" so list()'s
        // default game-only filter keeps surfacing them.
        if (oldVersion > 0 && oldVersion < 5 && tx) {
          const store = tx.objectStore(STORE_ROMS);
          const cursorReq = store.openCursor();
          cursorReq.onsuccess = () => {
            const cursor = cursorReq.result;
            if (!cursor) return;
            const rec = cursor.value as RomRecord & { kind?: RomKind };
            if (!rec.kind) {
              rec.kind = "game";
              cursor.update(rec);
            }
            cursor.continue();
          };
        }
      };
      req.onsuccess = () => resolve(req.result);
      req.onerror = () => reject(req.error ?? new Error("Failed to open RomDB"));
    });
    return this.dbPromise;
  }

  /** Close + drop the cached handle. Useful in tests to simulate reconnection. */
  close(): void {
    if (!this.dbPromise) return;
    const p = this.dbPromise;
    this.dbPromise = null;
    p.then((db) => db.close()).catch(() => {});
  }

  async put(record: RomRecordInput): Promise<void> {
    const db = await this.open();
    const now = Date.now();
    const full: RomRecord = {
      ...record,
      kind: record.kind ?? "game",
      addedAt: record.addedAt ?? now,
      lastPlayedAt: record.lastPlayedAt ?? 0,
      playCount: record.playCount ?? 0,
      favorite: record.favorite ?? false,
      size: record.size ?? record.zipData.byteLength,
    };
    return new Promise<void>((resolve, reject) => {
      const tx = db.transaction(STORE_ROMS, "readwrite");
      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(tx.error ?? new Error("put() failed"));
      tx.onabort = () => reject(tx.error ?? new Error("put() aborted"));
      tx.objectStore(STORE_ROMS).put(full);
    });
  }

  async get(id: string): Promise<RomRecord | null> {
    const db = await this.open();
    return new Promise<RomRecord | null>((resolve, reject) => {
      const tx = db.transaction(STORE_ROMS, "readonly");
      const req = tx.objectStore(STORE_ROMS).get(id);
      req.onsuccess = () => resolve((req.result as RomRecord | undefined) ?? null);
      req.onerror = () => reject(req.error ?? new Error("get() failed"));
    });
  }

  async delete(id: string): Promise<void> {
    const db = await this.open();
    return new Promise<void>((resolve, reject) => {
      const tx = db.transaction(STORE_ROMS, "readwrite");
      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(tx.error ?? new Error("delete() failed"));
      tx.objectStore(STORE_ROMS).delete(id);
    });
  }

  /**
   * List ROMs ordered by lastPlayedAt descending (most recently played
   * first). Never-played entries (lastPlayedAt===0) sort to the bottom,
   * tied entries sort by addedAt descending.
   *
   * Filters by `kind` (default "game") so the browser list never
   * surfaces BIOS records. Pass `kind: undefined` (explicit) to list
   * everything (used by the storage-usage views in Settings).
   */
  async list(opts: { kind?: RomKind | null } = {}): Promise<RomRecord[]> {
    const kind = opts.kind === null ? null : (opts.kind ?? "game");
    const db = await this.open();
    const all = await new Promise<RomRecord[]>((resolve, reject) => {
      const tx = db.transaction(STORE_ROMS, "readonly");
      const req = tx.objectStore(STORE_ROMS).getAll();
      req.onsuccess = () => resolve((req.result as RomRecord[] | undefined) ?? []);
      req.onerror = () => reject(req.error ?? new Error("list() failed"));
    });
    const filtered = kind === null ? all : all.filter((r) => (r.kind ?? "game") === kind);
    return filtered.sort((a, b) => {
      if (a.lastPlayedAt !== b.lastPlayedAt) return b.lastPlayedAt - a.lastPlayedAt;
      return b.addedAt - a.addedAt;
    });
  }

  /** Increment playCount + update lastPlayedAt. Cheap read-modify-write. */
  async markPlayed(id: string): Promise<void> {
    const db = await this.open();
    return new Promise<void>((resolve, reject) => {
      const tx = db.transaction(STORE_ROMS, "readwrite");
      const store = tx.objectStore(STORE_ROMS);
      const req = store.get(id);
      req.onsuccess = () => {
        const record = req.result as RomRecord | undefined;
        if (!record) {
          resolve();
          return;
        }
        record.lastPlayedAt = Date.now();
        record.playCount += 1;
        store.put(record);
      };
      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(tx.error ?? new Error("markPlayed() failed"));
    });
  }

  async setFavorite(id: string, favorite: boolean): Promise<void> {
    const db = await this.open();
    return new Promise<void>((resolve, reject) => {
      const tx = db.transaction(STORE_ROMS, "readwrite");
      const store = tx.objectStore(STORE_ROMS);
      const req = store.get(id);
      req.onsuccess = () => {
        const record = req.result as RomRecord | undefined;
        if (!record) {
          resolve();
          return;
        }
        record.favorite = favorite;
        store.put(record);
      };
      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(tx.error ?? new Error("setFavorite() failed"));
    });
  }

  /** Total bytes stored across all roms — O(n) over the store. */
  async totalSize(): Promise<number> {
    const rows = await this.list();
    return rows.reduce((sum, r) => sum + r.size, 0);
  }
}
