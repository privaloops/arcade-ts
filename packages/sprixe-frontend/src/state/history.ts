/**
 * History — recently-played + favorites tracker backed by localStorage.
 *
 * Companion to RomDB: RomDB holds the binary ROMs + per-record counters
 * (lastPlayedAt, playCount, favorite); this store focuses on the small
 * ordered-list views the browser UI wants to render:
 *
 *   - recent: the last N played game ids, newest first, deduplicated,
 *             capped at `maxRecent` (default 20).
 *   - favorites: a stable alphabetically-sorted Set.
 *
 * Keeping it standalone from RomDB means a list refresh doesn't have
 * to walk every binary record just to compute these views.
 */

export const STORAGE_KEY = "sprixe.history.v1";

export interface HistoryPayloadV1 {
  version: 1;
  recent: string[];
  favorites: string[];
}

export const DEFAULT_HISTORY: HistoryPayloadV1 = {
  version: 1,
  recent: [],
  favorites: [],
};

type Listener = (history: HistoryPayloadV1) => void;

export interface HistoryOptions {
  maxRecent?: number;
  storage?: Storage;
}

export class History {
  private readonly maxRecent: number;
  private readonly storage: Storage;
  private state: HistoryPayloadV1;
  private readonly listeners = new Set<Listener>();

  constructor(options: HistoryOptions = {}) {
    this.maxRecent = options.maxRecent ?? 20;
    this.storage = options.storage ?? globalThis.localStorage;
    this.state = this.load();
  }

  markPlayed(gameId: string): void {
    if (!gameId) return;
    const filtered = this.state.recent.filter((id) => id !== gameId);
    filtered.unshift(gameId);
    this.state = {
      version: 1,
      recent: filtered.slice(0, this.maxRecent),
      favorites: [...this.state.favorites],
    };
    this.persist();
    this.emit();
  }

  /** Flip favorite state; returns the new value. */
  toggleFavorite(gameId: string): boolean {
    const favSet = new Set(this.state.favorites);
    const becomesFavorite = !favSet.has(gameId);
    if (becomesFavorite) favSet.add(gameId);
    else favSet.delete(gameId);
    this.state = {
      version: 1,
      recent: [...this.state.recent],
      favorites: Array.from(favSet).sort(),
    };
    this.persist();
    this.emit();
    return becomesFavorite;
  }

  isFavorite(gameId: string): boolean {
    return this.state.favorites.includes(gameId);
  }

  getRecent(): readonly string[] {
    return this.state.recent;
  }

  getFavorites(): readonly string[] {
    return this.state.favorites;
  }

  /** Drops everything (used by Storage > Delete All ROMs). */
  reset(): void {
    this.state = { version: 1, recent: [], favorites: [] };
    this.persist();
    this.emit();
  }

  onChange(cb: Listener): () => void {
    this.listeners.add(cb);
    return () => {
      this.listeners.delete(cb);
    };
  }

  private load(): HistoryPayloadV1 {
    try {
      const raw = this.storage.getItem(STORAGE_KEY);
      if (!raw) return clone(DEFAULT_HISTORY);
      const parsed = JSON.parse(raw) as Partial<HistoryPayloadV1>;
      if (parsed.version !== 1) return clone(DEFAULT_HISTORY);
      return {
        version: 1,
        recent: Array.isArray(parsed.recent)
          ? parsed.recent.filter((v): v is string => typeof v === "string").slice(0, this.maxRecent)
          : [],
        favorites: Array.isArray(parsed.favorites)
          ? Array.from(new Set(parsed.favorites.filter((v): v is string => typeof v === "string"))).sort()
          : [],
      };
    } catch {
      return clone(DEFAULT_HISTORY);
    }
  }

  private persist(): void {
    try {
      this.storage.setItem(STORAGE_KEY, JSON.stringify(this.state));
    } catch { /* storage unavailable — in-memory only */ }
  }

  private emit(): void {
    for (const l of this.listeners) l(this.state);
  }
}

function clone(h: HistoryPayloadV1): HistoryPayloadV1 {
  return { version: 1, recent: [...h.recent], favorites: [...h.favorites] };
}
