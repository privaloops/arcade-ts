import { describe, it, expect, beforeEach, vi } from "vitest";
import {
  LetterWheel,
  getActiveLetters,
  findFirstMatchingIndex,
} from "./letter-wheel";
import type { GameEntry } from "../data/games";

function game(id: string, title: string): GameEntry {
  return {
    id,
    title,
    year: "1990",
    publisher: "Test",
    system: "cps1",
    screenshotUrl: null,
    videoUrl: null,
    favorite: false,
  };
}

describe("getActiveLetters", () => {
  it("returns the sorted, deduplicated set of leading letters", () => {
    expect(
      getActiveLetters([
        game("a", "Alpha"),
        game("b", "Beta"),
        game("c", "Alpha Prime"),
        game("d", "Zeta"),
      ])
    ).toEqual(["A", "B", "Z"]);
  });

  it("is case-insensitive", () => {
    expect(getActiveLetters([game("a", "alpha"), game("b", "Beta")])).toEqual(["A", "B"]);
  });

  it("ignores titles that don't start with A-Z", () => {
    expect(getActiveLetters([game("a", "1941"), game("b", "★ Special"), game("c", "Zeta")])).toEqual(["Z"]);
  });

  it("empty input → empty result", () => {
    expect(getActiveLetters([])).toEqual([]);
  });
});

describe("findFirstMatchingIndex", () => {
  const sample = [
    game("1", "Alpha"),
    game("2", "Strider"),
    game("3", "Street Fighter II"),
    game("4", "Zeta"),
  ];

  it("finds the first index whose title starts with the letter", () => {
    expect(findFirstMatchingIndex(sample, "S")).toBe(1);
  });

  it("case-insensitive match", () => {
    expect(findFirstMatchingIndex(sample, "s")).toBe(1);
  });

  it("returns -1 when no game matches", () => {
    expect(findFirstMatchingIndex(sample, "Q")).toBe(-1);
  });
});

describe("LetterWheel", () => {
  let container: HTMLDivElement;
  let onJump: ReturnType<typeof vi.fn>;
  let onClose: ReturnType<typeof vi.fn>;
  let wheel: LetterWheel;

  const sample = [
    game("1", "Alpha"),
    game("2", "Strider"),
    game("3", "Street Fighter II"),
    game("4", "Zeta"),
  ];

  beforeEach(() => {
    document.body.innerHTML = "";
    container = document.createElement("div");
    document.body.appendChild(container);
    onJump = vi.fn<(idx: number, letter: string) => void>();
    onClose = vi.fn<() => void>();
    wheel = new LetterWheel(container, {
      onJump: onJump as unknown as (idx: number, letter: string) => void,
      onClose: onClose as unknown as () => void,
    });
    wheel.setGames(sample);
  });

  it("is hidden until open() is called", () => {
    expect(wheel.isOpen()).toBe(false);
    expect(wheel.root.hidden).toBe(true);
  });

  it("open() reveals the overlay with the active letters", () => {
    wheel.open();
    expect(wheel.isOpen()).toBe(true);
    expect(wheel.root.hidden).toBe(false);
    const items = container.querySelectorAll(".af-letter-wheel-item");
    expect(Array.from(items).map((el) => el.getAttribute("data-letter"))).toEqual(["A", "S", "Z"]);
    expect(wheel.getSelectedLetter()).toBe("A");
  });

  it("does not open when no games match any letter", () => {
    wheel.setGames([]);
    wheel.open();
    expect(wheel.isOpen()).toBe(false);
  });

  it("handleNavAction up/down cycles through active letters", () => {
    wheel.open();
    wheel.handleNavAction("down");
    expect(wheel.getSelectedLetter()).toBe("S");
    wheel.handleNavAction("down");
    expect(wheel.getSelectedLetter()).toBe("Z");
    wheel.handleNavAction("down"); // wraps
    expect(wheel.getSelectedLetter()).toBe("A");
    wheel.handleNavAction("up");
    expect(wheel.getSelectedLetter()).toBe("Z");
  });

  it("confirm fires onJump with the first matching index", () => {
    wheel.open();
    wheel.handleNavAction("down"); // S
    wheel.handleNavAction("confirm");
    expect(onJump).toHaveBeenCalledWith(1, "S"); // Strider is at index 1
    expect(wheel.isOpen()).toBe(false);
  });

  it("back closes the wheel without jumping", () => {
    wheel.open();
    wheel.handleNavAction("back");
    expect(wheel.isOpen()).toBe(false);
    expect(onJump).not.toHaveBeenCalled();
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it("coin-hold dismisses the wheel", () => {
    wheel.open();
    wheel.handleNavAction("coin-hold");
    expect(wheel.isOpen()).toBe(false);
    expect(onJump).not.toHaveBeenCalled();
  });

  it("handleNavAction returns false while closed — upstream router handles the action", () => {
    expect(wheel.handleNavAction("confirm")).toBe(false);
    expect(wheel.handleNavAction("up")).toBe(false);
  });

  it("unrelated actions are ignored while open", () => {
    wheel.open();
    expect(wheel.handleNavAction("start")).toBe(false);
    expect(wheel.isOpen()).toBe(true);
  });

  it("setGames while open refreshes the letter list in place", () => {
    wheel.open();
    wheel.setGames([...sample, game("5", "Mega Man")]);
    const letters = Array.from(container.querySelectorAll(".af-letter-wheel-item")).map((el) =>
      el.getAttribute("data-letter")
    );
    expect(letters).toEqual(["A", "M", "S", "Z"]);
  });

  it("selection falls back to 0 if the previously-selected letter vanishes", () => {
    wheel.open();
    wheel.handleNavAction("down");
    wheel.handleNavAction("down"); // Z selected (index 2)
    wheel.setGames([game("1", "Alpha")]); // only A remains, selectedIndex 2 is out of range
    expect(wheel.getSelectedLetter()).toBe("A");
  });
});
