/**
 * LetterWheel — A-Z overlay to jump to the first game starting with
 * a given letter (§2.4).
 *
 * Pure helpers (getActiveLetters, findFirstMatchingIndex) are exported
 * so the browser tests can assert against them directly.
 *
 * The component renders a vertical stack of the active letters,
 * captures nav actions from the gamepad (up/down to scroll, confirm
 * to jump, back/coin-hold to close), and fires onJump(index) with
 * the target row index inside the current game list.
 */

import type { GameEntry } from "../data/games";
import type { NavAction } from "../input/gamepad-nav";

/** Letters for which at least one game title starts with that letter. */
export function getActiveLetters(games: readonly GameEntry[]): string[] {
  const set = new Set<string>();
  for (const g of games) {
    const c = g.title.charAt(0).toUpperCase();
    if (/[A-Z]/.test(c)) set.add(c);
  }
  return Array.from(set).sort();
}

/** First index in `games` whose title starts (case-insensitive) with `letter`.
 * Returns -1 when no game matches. */
export function findFirstMatchingIndex(
  games: readonly GameEntry[],
  letter: string
): number {
  const upper = letter.toUpperCase();
  return games.findIndex((g) => g.title.charAt(0).toUpperCase() === upper);
}

export interface LetterWheelOptions {
  onJump: (index: number, letter: string) => void;
  onClose?: () => void;
}

export class LetterWheel {
  readonly root: HTMLDivElement;

  private games: readonly GameEntry[] = [];
  private letters: string[] = [];
  private selectedIndex = 0;
  private opened = false;
  private readonly onJump: (index: number, letter: string) => void;
  private readonly onClose: (() => void) | undefined;

  constructor(container: HTMLElement, options: LetterWheelOptions) {
    this.onJump = options.onJump;
    this.onClose = options.onClose;

    this.root = document.createElement("div");
    this.root.className = "af-letter-wheel";
    this.root.setAttribute("role", "dialog");
    this.root.setAttribute("aria-modal", "true");
    this.root.setAttribute("aria-label", "Jump to letter");
    this.root.setAttribute("data-testid", "letter-wheel");
    this.root.hidden = true;

    container.appendChild(this.root);
  }

  setGames(games: readonly GameEntry[]): void {
    this.games = games;
    this.letters = getActiveLetters(games);
    if (this.selectedIndex >= this.letters.length) {
      this.selectedIndex = 0;
    }
    if (this.opened) this.render();
  }

  open(): void {
    if (this.opened) return;
    if (this.letters.length === 0) return;
    this.opened = true;
    this.root.hidden = false;
    this.selectedIndex = 0;
    this.render();
  }

  close(): void {
    if (!this.opened) return;
    this.opened = false;
    this.root.hidden = true;
    this.onClose?.();
  }

  isOpen(): boolean {
    return this.opened;
  }

  getActiveLetters(): readonly string[] {
    return this.letters;
  }

  getSelectedLetter(): string | null {
    if (this.letters.length === 0) return null;
    return this.letters[this.selectedIndex] ?? null;
  }

  handleNavAction(action: NavAction): boolean {
    if (!this.opened) return false;
    switch (action) {
      case "up":
        this.moveSelection(-1);
        return true;
      case "down":
        this.moveSelection(1);
        return true;
      case "confirm":
        this.confirm();
        return true;
      case "back":
      case "coin-hold":
        this.close();
        return true;
      default:
        return false;
    }
  }

  private confirm(): void {
    const letter = this.getSelectedLetter();
    if (!letter) return;
    const idx = findFirstMatchingIndex(this.games, letter);
    this.close();
    if (idx >= 0) this.onJump(idx, letter);
  }

  private moveSelection(delta: number): void {
    const n = this.letters.length;
    if (n === 0) return;
    this.selectedIndex = (this.selectedIndex + delta + n) % n;
    this.render();
  }

  private render(): void {
    this.root.textContent = "";
    const list = document.createElement("ul");
    list.className = "af-letter-wheel-list";
    for (let i = 0; i < this.letters.length; i++) {
      const li = document.createElement("li");
      li.className = "af-letter-wheel-item";
      li.dataset.letter = this.letters[i]!;
      li.textContent = this.letters[i]!;
      if (i === this.selectedIndex) {
        li.classList.add("selected");
        li.setAttribute("aria-selected", "true");
      }
      list.appendChild(li);
    }
    this.root.appendChild(list);
  }
}
