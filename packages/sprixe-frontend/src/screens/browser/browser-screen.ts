/**
 * BrowserScreen — HyperSpin-style game browser.
 *
 * Zoning:
 *   ┌────────────────────────────────────────────────┐
 *   │  marquee (50%)       │   title + meta (50%)    │ top bar
 *   ├──────────────────────┬─┴───────────────────────┤
 *   │                      │   filters pills         │
 *   │                      ├─────────────────────────┤
 *   │  media pane          │                         │
 *   │  (screenshot +       │   wheel (CSS 3D         │
 *   │  video preview)      │   cylinder)             │
 *   │                      │                         │
 *   └──────────────────────┴─────────────────────────┘
 *   background: screenshot blurry fullscreen + grain overlay
 *
 * Selection preservation across filters: WheelList tracks selection by
 * id, so as long as the currently-selected game still matches the new
 * filter's predicate, it stays selected. Otherwise the wheel falls back
 * to the first entry of the filtered set.
 */

import type { GameEntry } from "../../data/games";
import type { NavAction } from "../../input/gamepad-nav";
import type { PreviewLoader } from "../../media/preview-loader";
import { WheelList } from "./wheel-list";
import { VideoPreview } from "./video-preview";
import { FilterBar } from "./filter-bar";
import { BackgroundLayer } from "./background-layer";
import { extractDominantColor } from "./color-extractor";

export interface BrowserScreenOptions {
  initialGames?: readonly GameEntry[];
  /** VideoPreview + WheelList + BackgroundLayer lazy-fetch CDN assets. */
  previewLoader?: PreviewLoader;
}

export class BrowserScreen {
  readonly root: HTMLDivElement;

  private readonly background: BackgroundLayer;
  private readonly filterBar: FilterBar;
  private readonly wheel: WheelList;
  private readonly preview: VideoPreview;
  private readonly marqueeEl: HTMLImageElement;
  private readonly titleEl: HTMLDivElement;
  private readonly metaEl: HTMLDivElement;
  private readonly favoriteEl: HTMLDivElement;
  private readonly loader: PreviewLoader | undefined;
  private allGames: readonly GameEntry[] = [];
  private marqueeToken = 0;

  constructor(container: HTMLElement, options: BrowserScreenOptions = {}) {
    this.loader = options.previewLoader;

    this.root = document.createElement("div");
    this.root.className = "af-browser-screen";
    this.root.setAttribute("data-testid", "browser-screen");

    this.background = new BackgroundLayer(this.root);

    const foreground = document.createElement("div");
    foreground.className = "af-browser-foreground";
    this.root.appendChild(foreground);

    // Top bar holds only the title block now. The marquee stays in the
    // DOM off-screen so its onload still fires the dominant-colour
    // extractor that drives --af-dynamic-glow.
    const topBar = document.createElement("div");
    topBar.className = "af-browser-topbar";
    foreground.appendChild(topBar);

    const marqueeProbe = document.createElement("div");
    marqueeProbe.className = "af-browser-marquee-probe";
    this.root.appendChild(marqueeProbe);
    this.marqueeEl = document.createElement("img");
    this.marqueeEl.className = "af-browser-marquee";
    this.marqueeEl.setAttribute("data-testid", "browser-marquee");
    this.marqueeEl.alt = "";
    marqueeProbe.appendChild(this.marqueeEl);

    const titleBlock = document.createElement("div");
    titleBlock.className = "af-browser-titleblock";
    topBar.appendChild(titleBlock);
    this.titleEl = document.createElement("div");
    this.titleEl.className = "af-browser-caption-title";
    this.titleEl.setAttribute("data-testid", "browser-caption-title");
    titleBlock.appendChild(this.titleEl);
    this.metaEl = document.createElement("div");
    this.metaEl.className = "af-browser-caption-meta";
    titleBlock.appendChild(this.metaEl);
    this.favoriteEl = document.createElement("div");
    this.favoriteEl.className = "af-browser-caption-favorite";
    titleBlock.appendChild(this.favoriteEl);

    // Filter pills sit in the topbar's right column — same grid track
    // as the wheel below, so pills align vertically over the wheel.
    const filterPane = document.createElement("div");
    filterPane.className = "af-browser-filter-pane";
    topBar.appendChild(filterPane);
    this.filterBar = new FilterBar(filterPane);

    // Middle: media pane (left) + wheel pane (right)
    const middle = document.createElement("div");
    middle.className = "af-browser-middle";
    foreground.appendChild(middle);

    const mediaPane = document.createElement("div");
    mediaPane.className = "af-browser-media-pane";
    middle.appendChild(mediaPane);
    this.preview = this.loader
      ? new VideoPreview(mediaPane, { loader: this.loader })
      : new VideoPreview(mediaPane);

    const wheelPane = document.createElement("div");
    wheelPane.className = "af-browser-wheel-pane";
    middle.appendChild(wheelPane);
    this.wheel = this.loader
      ? new WheelList(wheelPane, { loader: this.loader })
      // Fallback without loader — tests only; builds an empty-logo wheel.
      : new WheelList(wheelPane, { loader: { marqueeCandidates: () => [] } as unknown as PreviewLoader });

    // Wiring
    this.wheel.onChange((game) => this.setActiveGame(game));
    this.filterBar.onChange((_id, filtered) => {
      this.wheel.setItems(filtered);
      this.setActiveGame(this.wheel.getSelectedGame());
    });

    if (options.initialGames) {
      this.setGames(options.initialGames);
    }

    container.appendChild(this.root);
  }

  /** Replace the full game catalogue — re-applies the current filter. */
  setGames(games: readonly GameEntry[]): void {
    this.allGames = games;
    this.filterBar.setGames(games);
    this.wheel.setItems(this.filterBar.getFiltered());
    this.setActiveGame(this.wheel.getSelectedGame());
  }

  getAllGames(): readonly GameEntry[] {
    return this.allGames;
  }

  getWheel(): WheelList {
    return this.wheel;
  }

  getPreview(): VideoPreview {
    return this.preview;
  }

  getFilterBar(): FilterBar {
    return this.filterBar;
  }

  /** Routes a NavAction. Returns true if handled. */
  handleNavAction(action: NavAction): boolean {
    switch (action) {
      case "up":
        this.wheel.moveSelection(-1);
        return true;
      case "down":
        this.wheel.moveSelection(1);
        return true;
      case "confirm":
        this.wheel.confirm();
        return true;
      case "left":
        this.filterBar.previous();
        return true;
      case "right":
        this.filterBar.next();
        return true;
      default:
        return false;
    }
  }

  private setActiveGame(game: GameEntry | null): void {
    this.preview.setGame(game);
    this.marqueeToken += 1;
    if (!game) {
      this.background.setScreenshotCandidates([]);
      this.marqueeEl.removeAttribute("src");
      this.marqueeEl.onerror = null;
      this.titleEl.textContent = "";
      this.metaEl.textContent = "";
      this.favoriteEl.textContent = "";
      return;
    }
    if (this.loader) {
      this.background.setScreenshotCandidates(this.loader.screenshotCandidates(game.id, game.system));
      this.setMarquee(this.loader.marqueeCandidates(game.id, game.system));
    } else {
      this.marqueeEl.removeAttribute("src");
    }
    this.titleEl.textContent = game.title;
    const systemLabel = game.system === "cps1" ? "CPS-1" : "Neo-Geo";
    this.metaEl.textContent = `${game.publisher} · ${game.year} · ${systemLabel}`;
    this.favoriteEl.textContent = game.favorite ? "★ Favorite" : "";
  }

  private setMarquee(urls: string[]): void {
    const token = this.marqueeToken;
    this.marqueeEl.onerror = null;
    this.marqueeEl.onload = null;
    if (urls.length === 0) {
      this.marqueeEl.removeAttribute("src");
      this.clearDynamicGlow();
      return;
    }
    this.marqueeEl.onload = () => {
      if (token !== this.marqueeToken) return;
      void extractDominantColor(this.marqueeEl.src).then((color) => {
        if (token !== this.marqueeToken) return;
        if (color) this.root.style.setProperty("--af-dynamic-glow", color);
        else this.clearDynamicGlow();
      });
    };
    let i = 0;
    const tryNext = (): void => {
      if (token !== this.marqueeToken) return;
      if (i >= urls.length) {
        this.marqueeEl.removeAttribute("src");
        this.clearDynamicGlow();
        return;
      }
      this.marqueeEl.onerror = tryNext;
      this.marqueeEl.src = urls[i++]!;
    };
    tryNext();
  }

  private clearDynamicGlow(): void {
    this.root.style.removeProperty("--af-dynamic-glow");
  }
}
