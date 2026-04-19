/**
 * Per-game context menu triggered by `context-menu` NavAction (button3).
 *
 * Fixed shape: Launch / Toggle favorite / Delete / Cancel. Nav is
 * self-contained (up/down/confirm/back) so the surrounding browser
 * doesn't have to ladder through another focus manager.
 */

import type { NavAction } from "../../input/gamepad-nav";

export interface ContextMenuOptions {
  gameId: string;
  gameTitle: string;
  isFavorite: boolean;
  onLaunch: () => void;
  onToggleFavorite: () => void;
  onDelete: () => void;
  onClose: () => void;
}

type MenuAction = "launch" | "favorite" | "delete" | "cancel";

export class ContextMenu {
  readonly root: HTMLDivElement;

  private readonly onLaunch: () => void;
  private readonly onToggleFavorite: () => void;
  private readonly onDelete: () => void;
  private readonly onClose: () => void;
  private readonly itemEls: HTMLElement[] = [];
  private readonly actions: MenuAction[] = ["launch", "favorite", "delete", "cancel"];
  private selectedIndex = 0;

  constructor(container: HTMLElement, options: ContextMenuOptions) {
    this.onLaunch = options.onLaunch;
    this.onToggleFavorite = options.onToggleFavorite;
    this.onDelete = options.onDelete;
    this.onClose = options.onClose;

    this.root = document.createElement("div");
    this.root.className = "af-context-menu";
    this.root.setAttribute("role", "dialog");
    this.root.setAttribute("aria-modal", "true");
    this.root.setAttribute("data-testid", "context-menu");
    this.root.dataset.gameId = options.gameId;

    const backdrop = document.createElement("div");
    backdrop.className = "af-context-menu-backdrop";
    backdrop.addEventListener("click", () => this.close());
    this.root.appendChild(backdrop);

    const card = document.createElement("div");
    card.className = "af-context-menu-card";

    const title = document.createElement("h2");
    title.className = "af-context-menu-title";
    title.textContent = options.gameTitle;
    card.appendChild(title);

    const list = document.createElement("ul");
    list.className = "af-context-menu-list";

    const favoriteLabel = options.isFavorite ? "★ Remove from favorites" : "☆ Add to favorites";
    const entries: Array<{ action: MenuAction; label: string; testid: string }> = [
      { action: "launch",   label: "▶ Launch",    testid: "context-menu-launch" },
      { action: "favorite", label: favoriteLabel, testid: "context-menu-favorite" },
      { action: "delete",   label: "🗑 Delete",    testid: "context-menu-delete" },
      { action: "cancel",   label: "Cancel",      testid: "context-menu-cancel" },
    ];

    for (const entry of entries) {
      const li = document.createElement("li");
      li.className = "af-context-menu-item";
      li.dataset.action = entry.action;
      li.setAttribute("data-testid", entry.testid);
      li.tabIndex = 0;
      li.textContent = entry.label;
      li.addEventListener("click", () => this.execute(entry.action));
      list.appendChild(li);
      this.itemEls.push(li);
    }
    card.appendChild(list);
    this.root.appendChild(card);
    container.appendChild(this.root);
    this.setSelected(0);
  }

  handleNavAction(action: NavAction): boolean {
    switch (action) {
      case "up":
        this.setSelected((this.selectedIndex - 1 + this.itemEls.length) % this.itemEls.length);
        return true;
      case "down":
        this.setSelected((this.selectedIndex + 1) % this.itemEls.length);
        return true;
      case "confirm":
        this.execute(this.actions[this.selectedIndex]!);
        return true;
      case "back":
      case "context-menu":
        this.close();
        return true;
      default:
        return false;
    }
  }

  close(): void {
    this.root.remove();
    this.onClose();
  }

  private setSelected(i: number): void {
    this.selectedIndex = i;
    for (let k = 0; k < this.itemEls.length; k++) {
      const el = this.itemEls[k]!;
      const selected = k === i;
      el.classList.toggle("selected", selected);
      if (selected) el.focus({ preventScroll: true });
    }
  }

  private execute(action: MenuAction): void {
    switch (action) {
      case "launch":
        this.onLaunch();
        this.root.remove();
        this.onClose();
        return;
      case "favorite":
        this.onToggleFavorite();
        this.close();
        return;
      case "delete":
        this.onDelete();
        this.close();
        return;
      case "cancel":
        this.close();
    }
  }
}
