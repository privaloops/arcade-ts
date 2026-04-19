/**
 * BrowserScreen — game browser = filter bar (top) + game list (left) +
 * video preview (right).
 *
 * Wires GameList selection into VideoPreview and routes GamepadNav
 * NavActions onto list navigation (up/down/confirm) + filter cycling
 * (bumper-left/bumper-right).
 *
 * Selection preservation across filters: GameList tracks selection by
 * id, so as long as the currently-selected game still matches the new
 * filter's predicate, it stays selected. Otherwise the list falls back
 * to the first entry of the filtered set.
 */

import type { GameEntry } from "../../data/games";
import type { NavAction } from "../../input/gamepad-nav";
import type { PreviewLoader } from "../../media/preview-loader";
import { GameList } from "./game-list";
import { VideoPreview } from "./video-preview";
import { FilterBar } from "./filter-bar";

export interface BrowserScreenOptions {
  initialGames?: readonly GameEntry[];
  /** Phase 4b.2 — when provided, VideoPreview lazy-fetches CDN assets. */
  previewLoader?: PreviewLoader;
}

export class BrowserScreen {
  readonly root: HTMLDivElement;

  private readonly filterBar: FilterBar;
  private readonly list: GameList;
  private readonly preview: VideoPreview;
  private allGames: readonly GameEntry[] = [];

  constructor(container: HTMLElement, options: BrowserScreenOptions = {}) {
    this.root = document.createElement("div");
    this.root.className = "af-browser-screen";
    this.root.setAttribute("data-testid", "browser-screen");

    // Filter bar spans the top of the screen.
    const filterPane = document.createElement("div");
    filterPane.className = "af-browser-filter-pane";
    this.root.appendChild(filterPane);
    this.filterBar = new FilterBar(filterPane);

    // Body: list pane + preview pane, side by side.
    const body = document.createElement("div");
    body.className = "af-browser-body";
    this.root.appendChild(body);

    const listPane = document.createElement("div");
    listPane.className = "af-browser-list-pane";
    body.appendChild(listPane);

    const previewPane = document.createElement("div");
    previewPane.className = "af-browser-preview-pane";
    body.appendChild(previewPane);

    this.list = new GameList(listPane);
    this.preview = options.previewLoader
      ? new VideoPreview(previewPane, { loader: options.previewLoader })
      : new VideoPreview(previewPane);

    // Wiring
    this.list.onChange((game) => this.preview.setGame(game));
    this.filterBar.onChange((_id, filtered) => {
      this.list.setItems(filtered);
      this.preview.setGame(this.list.getSelectedGame());
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
    this.list.setItems(this.filterBar.getFiltered());
    this.preview.setGame(this.list.getSelectedGame());
  }

  getAllGames(): readonly GameEntry[] {
    return this.allGames;
  }

  getList(): GameList {
    return this.list;
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
        this.list.moveSelection(-1);
        return true;
      case "down":
        this.list.moveSelection(1);
        return true;
      case "confirm":
        this.list.confirm();
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
}
