/**
 * VideoPreview — right-hand panel of the game browser (§2.4 + Phase 4b.2).
 *
 * With a PreviewLoader injected, selecting a new game:
 *   1. Immediately shows the GameEntry.screenshotUrl placeholder (fast).
 *   2. Async-fetches a CDN screenshot via loader.loadScreenshot(); when
 *      it resolves, upgrades the <img> src to the blob URL.
 *   3. After `crossfadeMs` (default 1000 ms) on the same game, mounts
 *      a <video> that streams the MP4 clip from the CDN if one exists
 *      (hasVideo HEAD probe). If hasVideo fails, the screenshot stays.
 *
 * Without a loader — backwards-compatible — the component behaves
 * exactly like Phase 1 (GameEntry.screenshotUrl → <img> src, no video).
 */

import type { GameEntry } from "../../data/games";
import { DEFAULT_CROSSFADE_DELAY_MS, type PreviewLoader } from "../../media/preview-loader";

export interface VideoPreviewOptions {
  loader?: PreviewLoader;
  /** Defaults to DEFAULT_CROSSFADE_DELAY_MS (1000 ms). */
  crossfadeMs?: number;
  /** Override timers for tests. */
  setTimer?: (cb: () => void, ms: number) => number;
  clearTimer?: (id: number) => void;
}

export class VideoPreview {
  readonly root: HTMLDivElement;

  private readonly imgEl: HTMLImageElement;
  private readonly marqueeEl: HTMLImageElement;
  private readonly titleEl: HTMLDivElement;
  private readonly metaEl: HTMLDivElement;
  private readonly favoriteEl: HTMLDivElement;
  private readonly media: HTMLDivElement;

  private readonly loader: PreviewLoader | undefined;
  private readonly crossfadeMs: number;
  private readonly setTimer: (cb: () => void, ms: number) => number;
  private readonly clearTimer: (id: number) => void;

  private currentId: string | null = null;
  /** Data URL returned by the generator — must be revoked on change. */
  private currentMarqueeBlobUrl: string | null = null;
  private currentVideoEl: HTMLVideoElement | null = null;
  private fadeTimerId: number | null = null;
  private pendingFetchToken = 0;

  constructor(container: HTMLElement, options: VideoPreviewOptions = {}) {
    this.loader = options.loader;
    this.crossfadeMs = options.crossfadeMs ?? DEFAULT_CROSSFADE_DELAY_MS;
    this.setTimer = options.setTimer ?? ((cb, ms) => window.setTimeout(cb, ms) as unknown as number);
    this.clearTimer = options.clearTimer ?? ((id) => window.clearTimeout(id));

    this.root = document.createElement("div");
    this.root.className = "af-video-preview";
    this.root.setAttribute("data-testid", "video-preview");

    // Marquee banner sits on top of the media block — gives each
    // game a "cabinet header" feel. Resolved via PreviewLoader's
    // CDN → libretro title → canvas-generated cascade.
    this.marqueeEl = document.createElement("img");
    this.marqueeEl.className = "af-video-preview-marquee";
    this.marqueeEl.setAttribute("data-testid", "video-preview-marquee");
    this.marqueeEl.alt = "";
    this.root.appendChild(this.marqueeEl);

    this.media = document.createElement("div");
    this.media.className = "af-video-preview-media";
    this.imgEl = document.createElement("img");
    this.imgEl.className = "af-video-preview-image";
    this.imgEl.setAttribute("data-testid", "video-preview-image");
    this.imgEl.alt = "";
    this.media.appendChild(this.imgEl);
    this.root.appendChild(this.media);

    const caption = document.createElement("div");
    caption.className = "af-video-preview-caption";
    this.titleEl = document.createElement("div");
    this.titleEl.className = "af-video-preview-title";
    caption.appendChild(this.titleEl);
    this.metaEl = document.createElement("div");
    this.metaEl.className = "af-video-preview-meta";
    caption.appendChild(this.metaEl);
    this.favoriteEl = document.createElement("div");
    this.favoriteEl.className = "af-video-preview-favorite";
    caption.appendChild(this.favoriteEl);
    this.root.appendChild(caption);

    container.appendChild(this.root);
  }

  setGame(game: GameEntry | null): void {
    // Cancel any pending crossfade or async fetch on every selection change.
    this.cancelFade();
    this.pendingFetchToken += 1;

    if (!game) {
      this.root.setAttribute("data-empty", "true");
      this.detachVideo();
      this.imgEl.removeAttribute("src");
      this.imgEl.onerror = null;
      this.marqueeEl.removeAttribute("src");
      this.marqueeEl.onerror = null;
      this.revokeMarqueeBlobUrl();
      this.titleEl.textContent = "";
      this.metaEl.textContent = "";
      this.favoriteEl.textContent = "";
      this.currentId = null;
      return;
    }

    this.root.removeAttribute("data-empty");
    if (this.currentId === game.id) return;
    this.currentId = game.id;

    // Reset visuals + kill anything pending from the previous game.
    this.detachVideo();
    this.marqueeEl.removeAttribute("src");
    this.marqueeEl.onerror = null;
    this.revokeMarqueeBlobUrl();
    this.titleEl.textContent = game.title;
    const systemLabel = game.system === "cps1" ? "CPS-1" : "Neo-Geo";
    this.metaEl.textContent = `${game.publisher} · ${game.year} · ${systemLabel}`;
    this.favoriteEl.textContent = game.favorite ? "★ Favorite" : "";

    if (this.loader) {
      const token = this.pendingFetchToken;

      // Screenshot: try each candidate URL in order; set the GameEntry
      // placeholder as the absolute last resort. Uses native <img>
      // onerror cascade — no fetch() so CORS-less hosts like ArcadeDB
      // serve us straight to the DOM.
      this.tryImageCascade(
        this.imgEl,
        this.loader.screenshotCandidates(game.id, game.system),
        game.screenshotUrl,
        `${game.title} screenshot`,
      );

      // Marquee: same cascade, plus a generated-canvas fallback when
      // every remote URL 404s so the banner is never empty.
      this.tryImageCascade(
        this.marqueeEl,
        this.loader.marqueeCandidates(game.id, game.system),
        null,
        `${game.title} marquee`,
        async () => {
          if (token !== this.pendingFetchToken) return null;
          const url = await this.loader!.generateMarqueeUrl(game.id, game.title);
          if (!url) return null;
          this.currentMarqueeBlobUrl = url;
          return url;
        },
      );

      this.fadeTimerId = this.setTimer(() => {
        if (token !== this.pendingFetchToken) return;
        this.tryMountVideo(game);
      }, this.crossfadeMs);
    } else {
      // No loader → honour the GameEntry placeholder like Phase 1.
      this.imgEl.onerror = null;
      if (game.screenshotUrl) this.imgEl.src = game.screenshotUrl;
      else this.imgEl.removeAttribute("src");
      this.imgEl.alt = `${game.title} screenshot`;
    }
  }

  /** Testing helper — the <video> element if one is currently mounted. */
  getVideoElement(): HTMLVideoElement | null {
    return this.currentVideoEl;
  }

  private tryMountVideo(game: GameEntry): void {
    if (!this.loader) return;
    const candidates = this.loader.videoCandidates(game.id, game.system);
    if (candidates.length === 0) return;

    const video = document.createElement("video");
    video.className = "af-video-preview-video";
    video.setAttribute("data-testid", "video-preview-video");
    video.setAttribute("playsinline", "true");
    video.muted = true;
    video.loop = true;

    let idx = 0;
    const tryNext = (): void => {
      if (game.id !== this.currentId) { video.remove(); return; }
      if (idx >= candidates.length) { video.remove(); return; }
      video.src = candidates[idx++]!;
      // The browser raises an error on 404 via the media element.
    };
    video.addEventListener("error", () => tryNext());
    video.addEventListener("loadeddata", () => {
      if (game.id !== this.currentId) return;
      this.currentVideoEl = video;
      void video.play().catch(() => { /* autoplay blocked — leave visible */ });
    });

    this.media.appendChild(video);
    tryNext();
  }

  /**
   * Walk a list of URL candidates setting them on `img.src` one after
   * the other. On each onerror, move to the next candidate. When all
   * remote URLs fail, fall back to `staticFallback` (e.g. GameEntry
   * placeholder) or run `generator` — useful for marquees where the
   * last step paints a canvas.
   */
  private tryImageCascade(
    img: HTMLImageElement,
    urls: string[],
    staticFallback: string | null,
    alt: string,
    generator?: () => Promise<string | null>,
  ): void {
    img.alt = alt;
    let idx = 0;
    const applyFallback = (): void => {
      if (staticFallback) {
        img.onerror = null;
        img.src = staticFallback;
        return;
      }
      if (generator) {
        void generator().then((url) => {
          if (!url) { img.removeAttribute("src"); return; }
          img.onerror = null;
          img.src = url;
        });
        return;
      }
      img.removeAttribute("src");
    };
    const tryNext = (): void => {
      if (idx >= urls.length) { applyFallback(); return; }
      img.onerror = tryNext;
      img.src = urls[idx++]!;
    };
    tryNext();
  }

  private detachVideo(): void {
    if (this.currentVideoEl) {
      try { this.currentVideoEl.pause(); } catch { /* ignore */ }
      this.currentVideoEl.remove();
      this.currentVideoEl = null;
    }
  }

  private revokeMarqueeBlobUrl(): void {
    if (this.currentMarqueeBlobUrl) {
      URL.revokeObjectURL(this.currentMarqueeBlobUrl);
      this.currentMarqueeBlobUrl = null;
    }
  }

  private cancelFade(): void {
    if (this.fadeTimerId !== null) {
      this.clearTimer(this.fadeTimerId);
      this.fadeTimerId = null;
    }
  }
}
