/**
 * VideoPreview — right-hand panel of the game browser.
 *
 * Phase 1 shows the placeholder screenshot only; Phase 4 wires the
 * lazy CDN fetch for live MP4 loops. The component redraws when
 * `setGame(game)` is called with a new entry.
 */

import type { GameEntry } from "../../data/games";

export class VideoPreview {
  readonly root: HTMLDivElement;

  private readonly imgEl: HTMLImageElement;
  private readonly titleEl: HTMLDivElement;
  private readonly metaEl: HTMLDivElement;
  private readonly favoriteEl: HTMLDivElement;

  private currentId: string | null = null;

  constructor(container: HTMLElement) {
    this.root = document.createElement("div");
    this.root.className = "af-video-preview";
    this.root.setAttribute("data-testid", "video-preview");

    const media = document.createElement("div");
    media.className = "af-video-preview-media";
    this.imgEl = document.createElement("img");
    this.imgEl.className = "af-video-preview-image";
    this.imgEl.alt = "";
    media.appendChild(this.imgEl);
    this.root.appendChild(media);

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
    if (!game) {
      this.root.setAttribute("data-empty", "true");
      this.imgEl.removeAttribute("src");
      this.titleEl.textContent = "";
      this.metaEl.textContent = "";
      this.favoriteEl.textContent = "";
      this.currentId = null;
      return;
    }
    this.root.removeAttribute("data-empty");
    if (this.currentId === game.id) return;
    this.currentId = game.id;

    if (game.screenshotUrl) {
      this.imgEl.src = game.screenshotUrl;
      this.imgEl.alt = `${game.title} screenshot`;
    } else {
      this.imgEl.removeAttribute("src");
      this.imgEl.alt = "";
    }

    this.titleEl.textContent = game.title;
    const systemLabel = game.system === "cps1" ? "CPS-1" : "Neo-Geo";
    this.metaEl.textContent = `${game.publisher} · ${game.year} · ${systemLabel}`;
    this.favoriteEl.textContent = game.favorite ? "★ Favorite" : "";
  }
}
