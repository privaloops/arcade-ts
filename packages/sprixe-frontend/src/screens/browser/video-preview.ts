/**
 * VideoPreview — media pane: screenshot upgraded to MP4 after a brief
 * hover delay. Marquee + caption live in BrowserScreen now.
 *
 * With a PreviewLoader injected, selecting a new game:
 *   1. Starts a <img> cascade through PreviewLoader.screenshotCandidates.
 *      Falls back to GameEntry.screenshotUrl if every remote URL 404s.
 *   2. After `crossfadeMs` (default 1000 ms) on the same game, mounts
 *      a <video> that streams the MP4 clip from the cascade if one
 *      exists. On repeated errors the screenshot stays visible.
 *
 * Without a loader — backwards-compatible test path — the component
 * just drops GameEntry.screenshotUrl into the <img>.
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
  private readonly loader: PreviewLoader | undefined;
  private readonly crossfadeMs: number;
  private readonly setTimer: (cb: () => void, ms: number) => number;
  private readonly clearTimer: (id: number) => void;

  private currentId: string | null = null;
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

    this.imgEl = document.createElement("img");
    this.imgEl.className = "af-video-preview-image";
    this.imgEl.setAttribute("data-testid", "video-preview-image");
    this.imgEl.alt = "";
    this.root.appendChild(this.imgEl);

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
      this.currentId = null;
      return;
    }

    this.root.removeAttribute("data-empty");
    if (this.currentId === game.id) return;
    this.currentId = game.id;

    this.detachVideo();

    if (this.loader) {
      const token = this.pendingFetchToken;
      // Start the image cascade and the video probe together, but hide
      // the image while the video has a chance to load — avoids the
      // ugly flash where a 16:9 screenshot sits behind a 4:3 <video>
      // during the couple of frames before `loadeddata` fires.
      this.root.classList.add("probing-video");
      this.tryImageCascade(
        this.imgEl,
        this.loader.screenshotCandidates(game.id, game.system),
        game.screenshotUrl,
        `${game.title} screenshot`,
      );
      this.tryMountVideo(game, token);
    } else {
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

  /** Freeze preview playback — called when the kiosk hands off to the
   * playing screen so the ArcadeDB clip isn't competing for audio or
   * CPU with the live emulator. */
  pauseVideo(): void {
    if (this.currentVideoEl) {
      try { this.currentVideoEl.pause(); } catch { /* ignore */ }
    }
  }

  /** Re-arm preview playback after a return to the browser. Muted if
   * autoplay blocks it — same retry shape as the initial mount. */
  resumeVideo(): void {
    const v = this.currentVideoEl;
    if (!v) return;
    void v.play().catch(() => {
      v.muted = true;
      void v.play().catch(() => { /* still blocked */ });
    });
  }

  private tryMountVideo(game: GameEntry, token: number): void {
    if (!this.loader) { this.revealImage(); return; }
    const candidates = this.loader.videoCandidates(game.id, game.system);
    if (candidates.length === 0) { this.revealImage(); return; }

    const video = document.createElement("video");
    video.className = "af-video-preview-video";
    video.setAttribute("data-testid", "video-preview-video");
    video.setAttribute("playsinline", "true");
    // Autoplay policy: muted is always allowed. Once the user has
    // interacted with the page (tracked globally by ensureMediaGesture
    // below), we flip muted off so preview clips speak up.
    video.muted = !(window as typeof window & { __sprixeMediaGestureFired?: boolean }).__sprixeMediaGestureFired;
    video.loop = true;

    let idx = 0;
    const tryNext = (): void => {
      if (token !== this.pendingFetchToken) { video.remove(); return; }
      if (game.id !== this.currentId) { video.remove(); return; }
      if (idx >= candidates.length) {
        // Cascade exhausted → reveal the screenshot and drop the video.
        video.remove();
        this.revealImage();
        return;
      }
      video.src = candidates[idx++]!;
    };
    video.addEventListener("error", () => tryNext());
    video.addEventListener("loadeddata", () => {
      if (token !== this.pendingFetchToken) return;
      if (game.id !== this.currentId) return;
      this.currentVideoEl = video;
      this.root.classList.remove("probing-video");
      this.root.classList.add("has-video");
      void video.play().catch(() => {
        // Autoplay blocked — re-arm muted and retry.
        video.muted = true;
        void video.play().catch(() => { /* still blocked — leave visible */ });
      });
    });

    this.root.appendChild(video);
    tryNext();
  }

  private revealImage(): void {
    this.root.classList.remove("probing-video");
  }

  private tryImageCascade(
    img: HTMLImageElement,
    urls: string[],
    staticFallback: string | null,
    alt: string,
  ): void {
    img.alt = alt;
    let idx = 0;
    const applyFallback = (): void => {
      if (staticFallback) {
        img.onerror = null;
        img.src = staticFallback;
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
    this.root.classList.remove("has-video");
    this.root.classList.remove("probing-video");
  }

  private cancelFade(): void {
    if (this.fadeTimerId !== null) {
      this.clearTimer(this.fadeTimerId);
      this.fadeTimerId = null;
    }
  }
}
