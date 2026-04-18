import { describe, it, expect } from "vitest";
import { FocusManager, type FocusableItem } from "./focus-manager";

/** Build a dense N×N grid; ids follow `r{row}c{col}` convention. */
function grid(n: number): FocusableItem[] {
  const items: FocusableItem[] = [];
  for (let r = 0; r < n; r++) {
    for (let c = 0; c < n; c++) {
      items.push({ id: `r${r}c${c}`, row: r, col: c });
    }
  }
  return items;
}

describe("FocusManager", () => {
  describe("initial focus", () => {
    it("focuses the first item by default", () => {
      const fm = new FocusManager(grid(3));
      expect(fm.getFocusedId()).toBe("r0c0");
    });

    it("honours options.initial when provided", () => {
      const fm = new FocusManager(grid(3), { initial: "r1c1" });
      expect(fm.getFocusedId()).toBe("r1c1");
    });

    it("falls back to first item if initial id not in set", () => {
      const fm = new FocusManager(grid(3), { initial: "nonexistent" });
      expect(fm.getFocusedId()).toBe("r0c0");
    });

    it("null focus for empty item set", () => {
      const fm = new FocusManager([]);
      expect(fm.getFocusedId()).toBeNull();
    });
  });

  describe("navigation without wrap (default)", () => {
    it("moves DOWN across rows", () => {
      const fm = new FocusManager(grid(3));
      expect(fm.move("down")).toBe(true);
      expect(fm.getFocusedId()).toBe("r1c0");
      expect(fm.move("down")).toBe(true);
      expect(fm.getFocusedId()).toBe("r2c0");
    });

    it("moves UP across rows", () => {
      const fm = new FocusManager(grid(3), { initial: "r2c1" });
      expect(fm.move("up")).toBe(true);
      expect(fm.getFocusedId()).toBe("r1c1");
    });

    it("moves RIGHT / LEFT across columns", () => {
      const fm = new FocusManager(grid(3), { initial: "r1c0" });
      expect(fm.move("right")).toBe(true);
      expect(fm.getFocusedId()).toBe("r1c1");
      expect(fm.move("left")).toBe(true);
      expect(fm.getFocusedId()).toBe("r1c0");
    });

    it("blocks at the top edge", () => {
      const fm = new FocusManager(grid(3), { initial: "r0c1" });
      expect(fm.move("up")).toBe(false);
      expect(fm.getFocusedId()).toBe("r0c1");
    });

    it("blocks at the bottom edge", () => {
      const fm = new FocusManager(grid(3), { initial: "r2c1" });
      expect(fm.move("down")).toBe(false);
      expect(fm.getFocusedId()).toBe("r2c1");
    });

    it("blocks at left and right edges", () => {
      const fm = new FocusManager(grid(3), { initial: "r1c0" });
      expect(fm.move("left")).toBe(false);
      expect(fm.getFocusedId()).toBe("r1c0");

      fm.setFocus("r1c2");
      expect(fm.move("right")).toBe(false);
      expect(fm.getFocusedId()).toBe("r1c2");
    });
  });

  describe("navigation with wrap", () => {
    it("UP from top row lands on the bottom row, same column", () => {
      const fm = new FocusManager(grid(3), { initial: "r0c2", wrap: true });
      expect(fm.move("up")).toBe(true);
      expect(fm.getFocusedId()).toBe("r2c2");
    });

    it("DOWN from bottom row lands on the top row, same column", () => {
      const fm = new FocusManager(grid(3), { initial: "r2c1", wrap: true });
      expect(fm.move("down")).toBe(true);
      expect(fm.getFocusedId()).toBe("r0c1");
    });

    it("LEFT from leftmost column lands on rightmost", () => {
      const fm = new FocusManager(grid(3), { initial: "r1c0", wrap: true });
      expect(fm.move("left")).toBe(true);
      expect(fm.getFocusedId()).toBe("r1c2");
    });

    it("RIGHT from rightmost column lands on leftmost", () => {
      const fm = new FocusManager(grid(3), { initial: "r0c2", wrap: true });
      expect(fm.move("right")).toBe(true);
      expect(fm.getFocusedId()).toBe("r0c0");
    });
  });

  describe("sparse grids", () => {
    it("skips missing positions — down from (0,0) goes to nearest row below", () => {
      // Grid missing row 1; items at (0,0), (2,0), (0,1), (2,1).
      const items: FocusableItem[] = [
        { id: "a", row: 0, col: 0 },
        { id: "b", row: 2, col: 0 },
        { id: "c", row: 0, col: 1 },
        { id: "d", row: 2, col: 1 },
      ];
      const fm = new FocusManager(items, { initial: "a" });
      expect(fm.move("down")).toBe(true);
      expect(fm.getFocusedId()).toBe("b");
    });

    it("RIGHT across columns picks nearest perpendicular neighbour", () => {
      const items: FocusableItem[] = [
        { id: "a", row: 0, col: 0 },
        { id: "b", row: 1, col: 2 },  // perpendicular off-axis
        { id: "c", row: 0, col: 5 },
      ];
      const fm = new FocusManager(items, { initial: "a" });
      // From (0,0) moving right: b at (1,2) is closest on primary axis
      // (col distance 2) and perp distance 1 beats c (col distance 5).
      expect(fm.move("right")).toBe(true);
      expect(fm.getFocusedId()).toBe("b");
    });
  });

  describe("subscriptions", () => {
    it("onChange fires for each focus change", () => {
      const fm = new FocusManager(grid(3));
      const events: (string | null)[] = [];
      fm.onChange((id) => events.push(id));

      fm.move("down");
      fm.move("right");

      expect(events).toEqual(["r1c0", "r1c1"]);
    });

    it("onChange does not fire when focus is already on the target", () => {
      const fm = new FocusManager(grid(3), { initial: "r1c1" });
      const events: (string | null)[] = [];
      fm.onChange((id) => events.push(id));

      fm.setFocus("r1c1");

      expect(events).toEqual([]);
    });

    it("unsubscribe stops further notifications", () => {
      const fm = new FocusManager(grid(3));
      const events: (string | null)[] = [];
      const off = fm.onChange((id) => events.push(id));

      fm.move("down");
      off();
      fm.move("down");

      expect(events).toEqual(["r1c0"]);
    });
  });

  describe("setItems", () => {
    it("preserves current focus when the id still exists", () => {
      const fm = new FocusManager(grid(3), { initial: "r1c1" });
      fm.setItems(grid(3));
      expect(fm.getFocusedId()).toBe("r1c1");
    });

    it("falls back to first item when current id is gone", () => {
      const fm = new FocusManager(grid(3), { initial: "r2c2" });
      fm.setItems([
        { id: "x", row: 0, col: 0 },
        { id: "y", row: 0, col: 1 },
      ]);
      expect(fm.getFocusedId()).toBe("x");
    });
  });
});
