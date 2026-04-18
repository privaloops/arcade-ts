/**
 * PreviewLoader — lazy-fetch + cache screenshots and MP4 clips for
 * the video preview panel (§3.10).
 *
 * Strategy per §3.10 Option A: no manifest. Try to fetch each asset
 * and treat 404 as "this game doesn't have one". Successfully-fetched
 * blobs land in MediaCache keyed by `media:${gameId}:${kind}` so
 * subsequent selections hit cache.
 *
 * Video URLs are returned as strings so the consumer can set them on
 * a <video src="..."> directly — browsers stream videos more
 * efficiently than blob: URLs.
 */

import type { System } from "../data/games";
import type { MediaCache } from "./media-cache";

export type AssetKind = "screenshot" | "video";

export interface PreviewLoaderOptions {
  cache: MediaCache;
  /** CDN base URL without trailing slash, e.g. https://cdn.sprixe.app/media. */
  cdnBase: string;
  /** Override fetch for tests. */
  fetchImpl?: typeof fetch;
}

export class PreviewLoader {
  private readonly cache: MediaCache;
  private readonly cdnBase: string;
  private readonly fetchImpl: typeof fetch;

  constructor(options: PreviewLoaderOptions) {
    this.cache = options.cache;
    this.cdnBase = options.cdnBase.replace(/\/$/, "");
    this.fetchImpl = options.fetchImpl ?? globalThis.fetch.bind(globalThis);
  }

  screenshotUrl(gameId: string, system: System): string {
    return `${this.cdnBase}/${system}/${gameId}/screenshot.png`;
  }

  videoUrl(gameId: string, system: System): string {
    return `${this.cdnBase}/${system}/${gameId}/video.mp4`;
  }

  cacheKey(gameId: string, kind: AssetKind): string {
    return `media:${gameId}:${kind}`;
  }

  /**
   * Fetch the screenshot for a game, returning a Blob or null when
   * the CDN responds 404. Cached on success.
   */
  async loadScreenshot(gameId: string, system: System): Promise<Blob | null> {
    const key = this.cacheKey(gameId, "screenshot");
    const cached = await this.cache.get(key);
    if (cached) return cached;

    const url = this.screenshotUrl(gameId, system);
    let response: Response;
    try {
      response = await this.fetchImpl(url);
    } catch {
      return null;
    }
    if (!response.ok) return null;
    const blob = await response.blob();
    try { await this.cache.put(key, blob); } catch { /* cache write best-effort */ }
    return blob;
  }

  /**
   * HEAD-probe the video URL so the consumer knows whether to mount
   * a <video> at all. Cheaper than a GET + cancels the download on
   * a miss.
   */
  async hasVideo(gameId: string, system: System): Promise<boolean> {
    try {
      const response = await this.fetchImpl(this.videoUrl(gameId, system), { method: "HEAD" });
      return response.ok;
    } catch {
      return false;
    }
  }
}

/**
 * Schedule the video-preview crossfade: after `delayMs` of continuous
 * hover on the same game, fire the callback so the consumer can set
 * the <video> src + start playback. Returns a cancel handle that the
 * consumer invokes on selection change / unmount.
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

export const DEFAULT_CROSSFADE_DELAY_MS = 1000;
