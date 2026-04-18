/**
 * MediaCache — IndexedDB Blob cache keyed by media id (§3.10).
 *
 * Screenshots + MP4 clips are fetched from a CDN (Phase 4.3) and
 * cached here so the browser doesn't re-download every time the
 * user re-selects a game. Lives in the same 'sprixe-arcade'
 * database as RomDB and SaveStateDB so the storage quota view in
 * Settings > Storage can tally everything in one query.
 *
 * Schema bumped to v3 in this module — onupgradeneeded creates the
 * 'media' store alongside 'roms' and 'savestates' if they're not
 * already present (so a fresh install gets all three in one upgrade,
 * and an existing install just adds 'media').
 */

const DB_NAME = "sprixe-arcade";
const DB_VERSION = 4; // Phase 4b.2c: bumped to heal v3 DBs that landed without 'media'
const STORE_MEDIA = "media";

export interface MediaRecord {
  key: string;
  blob: Blob;
  addedAt: number;
}

export class MediaCache {
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
        if (!db.objectStoreNames.contains("savestates")) {
          const states = db.createObjectStore("savestates", { keyPath: "key" });
          states.createIndex("gameId", "gameId");
        }
        if (!db.objectStoreNames.contains(STORE_MEDIA)) {
          db.createObjectStore(STORE_MEDIA, { keyPath: "key" });
        }
      };
      req.onsuccess = () => resolve(req.result);
      req.onerror = () => reject(req.error ?? new Error("MediaCache open failed"));
    });
    return this.dbPromise;
  }

  close(): void {
    if (!this.dbPromise) return;
    const p = this.dbPromise;
    this.dbPromise = null;
    p.then((db) => db.close()).catch(() => {});
  }

  async get(key: string): Promise<Blob | null> {
    const db = await this.open();
    return new Promise<Blob | null>((resolve, reject) => {
      const tx = db.transaction(STORE_MEDIA, "readonly");
      const req = tx.objectStore(STORE_MEDIA).get(key);
      req.onsuccess = () => {
        const row = req.result as MediaRecord | undefined;
        resolve(row ? row.blob : null);
      };
      req.onerror = () => reject(req.error ?? new Error("MediaCache.get failed"));
    });
  }

  async put(key: string, blob: Blob): Promise<void> {
    const db = await this.open();
    return new Promise<void>((resolve, reject) => {
      const tx = db.transaction(STORE_MEDIA, "readwrite");
      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(tx.error ?? new Error("MediaCache.put failed"));
      tx.objectStore(STORE_MEDIA).put({ key, blob, addedAt: Date.now() });
    });
  }

  async delete(key: string): Promise<void> {
    const db = await this.open();
    return new Promise<void>((resolve, reject) => {
      const tx = db.transaction(STORE_MEDIA, "readwrite");
      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(tx.error ?? new Error("MediaCache.delete failed"));
      tx.objectStore(STORE_MEDIA).delete(key);
    });
  }

  async totalSize(): Promise<number> {
    const db = await this.open();
    return new Promise<number>((resolve, reject) => {
      const tx = db.transaction(STORE_MEDIA, "readonly");
      const req = tx.objectStore(STORE_MEDIA).getAll();
      req.onsuccess = () => {
        const rows = (req.result ?? []) as MediaRecord[];
        resolve(rows.reduce((sum, r) => sum + r.blob.size, 0));
      };
      req.onerror = () => reject(req.error ?? new Error("MediaCache.totalSize failed"));
    });
  }
}
