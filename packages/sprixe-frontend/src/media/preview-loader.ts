/**
 * PreviewLoader — exposes the cascade of asset URLs for a game card.
 *
 * The network layer is deliberately thin: we no longer `fetch()` +
 * Blob for remote assets because third-party servers like ArcadeDB
 * don't serve CORS headers, which the browser enforces for fetch but
 * NOT for `<img src>` / `<video src>`. Consumers set the returned
 * URLs directly on DOM elements and cascade via `onerror`.
 *
 * Cache strategy:
 *   - External URLs: browser HTTP cache does the job.
 *   - Generated marquee: kept in MediaCache (IDB) as a data URL since
 *     re-painting the same canvas on every hover is wasteful.
 *
 * Cascade per asset kind:
 *   screenshot: operator CDN → ArcadeDB `ingames` → null
 *   marquee:    operator CDN → ArcadeDB `marquees` → generated (local)
 *   video:      operator CDN → ArcadeDB `videos`   → no video
 *
 * `cdnBase` lets an operator override both ArcadeDB and the generator
 * by self-hosting /media/{system}/{id}/{screenshot|marquee|video}.
 */

import type { System } from "../data/games";
import type { MediaCache } from "./media-cache";
import { arcadeDbUrl } from "./fetchers/arcadedb";
import { generateMarquee } from "./fetchers/generated-marquee";

export type AssetKind = "screenshot" | "video" | "marquee";

export interface PreviewLoaderOptions {
  cache: MediaCache;
  /**
   * CDN base URL without trailing slash. When it resolves for a given
   * game, its asset takes priority over ArcadeDB. In dev we leave it
   * pointing at window.origin/media which mostly 404s; the browser
   * silently falls through to the next candidate.
   */
  cdnBase: string;
  /** Override the marquee canvas generator (unit tests). */
  marqueeGenImpl?: (title: string) => Promise<Blob | null>;
}

export class PreviewLoader {
  private readonly cache: MediaCache;
  private readonly cdnBase: string;
  private readonly marqueeGenImpl: (title: string) => Promise<Blob | null>;

  constructor(options: PreviewLoaderOptions) {
    this.cache = options.cache;
    this.cdnBase = options.cdnBase.replace(/\/$/, "");
    this.marqueeGenImpl = options.marqueeGenImpl ?? generateMarquee;
  }

  // ── URL builders ────────────────────────────────────────────────

  screenshotUrl(gameId: string, system: System): string {
    return `${this.cdnBase}/${system}/${gameId}/screenshot.png`;
  }

  marqueeUrl(gameId: string, system: System): string {
    return `${this.cdnBase}/${system}/${gameId}/marquee.png`;
  }

  videoUrl(gameId: string, system: System): string {
    return `${this.cdnBase}/${system}/${gameId}/video.mp4`;
  }

  cacheKey(gameId: string, kind: AssetKind): string {
    return `media:${gameId}:${kind}`;
  }

  // ── Cascades ────────────────────────────────────────────────────

  /** Ordered URLs the consumer should try (onerror → next) for the screenshot. */
  screenshotCandidates(gameId: string, system: System): string[] {
    return [
      this.screenshotUrl(gameId, system),
      arcadeDbUrl("ingames", gameId),
    ];
  }

  /** Ordered URLs to try for the marquee. If all fail, use `generateMarqueeUrl()`. */
  marqueeCandidates(gameId: string, system: System): string[] {
    return [
      this.marqueeUrl(gameId, system),
      arcadeDbUrl("marquees", gameId),
    ];
  }

  /** Ordered URLs to try for the gameplay video. Empty array = no video. */
  videoCandidates(gameId: string, system: System): string[] {
    return [
      this.videoUrl(gameId, system),
      arcadeDbUrl("videos", gameId),
    ];
  }

  /**
   * Last-ditch marquee — paint the title on a canvas, cache the
   * resulting data URL in IDB so the expensive draw only happens
   * once per title-per-session. Returns null when neither the
   * generator nor the canvas API is available (jsdom).
   */
  async generateMarqueeUrl(gameId: string, gameTitle: string): Promise<string | null> {
    const key = this.cacheKey(gameId, "marquee");
    const cached = await this.cache.get(key);
    if (cached) return URL.createObjectURL(cached);

    const blob = await this.marqueeGenImpl(gameTitle);
    if (!blob) return null;
    try { await this.cache.put(key, blob); } catch { /* best-effort */ }
    return URL.createObjectURL(blob);
  }
}

export const DEFAULT_CROSSFADE_DELAY_MS = 1000;

/**
 * Schedule the video-preview crossfade: after `delayMs` of continuous
 * hover on the same game, fire the callback. Returns a cancel handle
 * that the consumer invokes on selection change / unmount.
 */
export function scheduleVideoFade(
  delayMs: number,
  cb: () => void,
  timer: { setTimeout: typeof setTimeout; clearTimeout: typeof clearTimeout } = {
    setTimeout: globalThis.setTimeout.bind(globalThis),
    clearTimeout: globalThis.clearTimeout.bind(globalThis),
  }
): () => void {
  const id = timer.setTimeout(cb, delayMs);
  return () => timer.clearTimeout(id);
}
