/**
 * SettingsStore — arcade preferences persisted to localStorage (§2.8).
 *
 * Shape is versioned so future migrations can read the old payload,
 * transform it, and rewrite under the new version without losing
 * user data. Validation is hand-rolled (no Zod dep) — it walks the
 * expected keys + types and rejects anything unexpected by returning
 * the defaults plus whatever partial fields survived.
 */

export const STORAGE_KEY = "sprixe.settings.v1";

export type AspectRatio = "4:3" | "16:9" | "stretch";
export type AudioLatency = "low" | "medium" | "high";

export interface SettingsV1 {
  version: 1;
  display: {
    crtFilter: boolean;
    aspectRatio: AspectRatio;
    integerScaling: boolean;
    scanlineOpacity: number; // 0..1
    tate: boolean;
  };
  audio: {
    masterVolume: number; // 0..100
    latency: AudioLatency;
  };
}

export const DEFAULT_SETTINGS: SettingsV1 = {
  version: 1,
  display: {
    crtFilter: false,
    aspectRatio: "4:3",
    integerScaling: true,
    scanlineOpacity: 0.5,
    tate: false,
  },
  audio: {
    masterVolume: 80,
    latency: "medium",
  },
};

/** Deep partial so update() can accept {audio: {masterVolume: 50}}. */
export type SettingsPatch = {
  [K in keyof SettingsV1]?: K extends "version" ? never : Partial<SettingsV1[K]>;
};

type Listener = (settings: SettingsV1) => void;

export class SettingsStore {
  private settings: SettingsV1;
  private readonly listeners = new Set<Listener>();
  private readonly storage: Storage;

  constructor(storage: Storage = globalThis.localStorage) {
    this.storage = storage;
    this.settings = this.load();
  }

  get(): Readonly<SettingsV1> {
    return this.settings;
  }

  /** Replace the entire snapshot atomically. Validates + persists. */
  replace(next: SettingsV1): void {
    this.settings = sanitize(next);
    this.persist();
    this.emit();
  }

  /** Deep-merge patch into the current settings. */
  update(patch: SettingsPatch): void {
    const next: SettingsV1 = {
      version: 1,
      display: { ...this.settings.display, ...(patch.display ?? {}) },
      audio: { ...this.settings.audio, ...(patch.audio ?? {}) },
    };
    this.replace(next);
  }

  /** Wipe stored settings and go back to DEFAULT_SETTINGS. */
  reset(): void {
    this.replace(clone(DEFAULT_SETTINGS));
  }

  onChange(cb: Listener): () => void {
    this.listeners.add(cb);
    return () => {
      this.listeners.delete(cb);
    };
  }

  private load(): SettingsV1 {
    const raw = this.safeGet();
    if (!raw) return clone(DEFAULT_SETTINGS);
    try {
      const parsed = JSON.parse(raw) as { version?: unknown };
      if (parsed?.version === 1) return sanitize(parsed as SettingsV1);
      // Phase 4.1 is v1; future migrations plug in here.
    } catch { /* malformed JSON — fall through to defaults */ }
    return clone(DEFAULT_SETTINGS);
  }

  private persist(): void {
    try {
      this.storage.setItem(STORAGE_KEY, JSON.stringify(this.settings));
    } catch { /* quota / storage unavailable — best-effort */ }
  }

  private safeGet(): string | null {
    try { return this.storage.getItem(STORAGE_KEY); }
    catch { return null; }
  }

  private emit(): void {
    for (const l of this.listeners) l(this.settings);
  }
}

function clone(s: SettingsV1): SettingsV1 {
  return {
    version: 1,
    display: { ...s.display },
    audio: { ...s.audio },
  };
}

/** Reject foreign keys, coerce out-of-range values, fill missing fields. */
function sanitize(input: SettingsV1): SettingsV1 {
  const d = input.display ?? {};
  const a = input.audio ?? {};

  const aspect: AspectRatio = (["4:3", "16:9", "stretch"] as const).includes(d.aspectRatio)
    ? (d.aspectRatio)
    : DEFAULT_SETTINGS.display.aspectRatio;
  const latency: AudioLatency = (["low", "medium", "high"] as const).includes(a.latency)
    ? (a.latency)
    : DEFAULT_SETTINGS.audio.latency;

  return {
    version: 1,
    display: {
      crtFilter: typeof d.crtFilter === "boolean" ? d.crtFilter : DEFAULT_SETTINGS.display.crtFilter,
      aspectRatio: aspect,
      integerScaling:
        typeof d.integerScaling === "boolean" ? d.integerScaling : DEFAULT_SETTINGS.display.integerScaling,
      scanlineOpacity: clamp(
        typeof d.scanlineOpacity === "number" ? d.scanlineOpacity : DEFAULT_SETTINGS.display.scanlineOpacity,
        0,
        1
      ),
      tate: typeof d.tate === "boolean" ? d.tate : DEFAULT_SETTINGS.display.tate,
    },
    audio: {
      masterVolume: clamp(
        Math.round(typeof a.masterVolume === "number" ? a.masterVolume : DEFAULT_SETTINGS.audio.masterVolume),
        0,
        100
      ),
      latency,
    },
  };
}

function clamp(n: number, min: number, max: number): number {
  if (Number.isNaN(n)) return min;
  return Math.min(Math.max(n, min), max);
}
