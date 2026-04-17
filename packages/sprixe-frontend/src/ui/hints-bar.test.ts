import { describe, it, expect, beforeEach } from "vitest";
import { HintsBar, CONTEXT_HINTS, STANDARD_LABELS, type HintContext } from "./hints-bar";

describe("HintsBar", () => {
  let container: HTMLDivElement;

  beforeEach(() => {
    document.body.innerHTML = "";
    container = document.createElement("div");
    document.body.appendChild(container);
  });

  describe("context labels", () => {
    it("browser context shows Navigate / Play / Favorite / A-Z / Settings", () => {
      const bar = new HintsBar(container);
      bar.setContext("browser");
      const labels = bar.getVisibleHints().map((h) => h.label);
      expect(labels).toEqual(CONTEXT_HINTS.browser.map((h) => h.label));
    });

    it("paused context shows Navigate / Select / Resume", () => {
      const bar = new HintsBar(container);
      bar.setContext("paused");
      const labels = bar.getVisibleHints().map((h) => h.label);
      expect(labels).toEqual(["Navigate", "Select", "Resume"]);
    });

    it("modal-open context shows OK / Cancel", () => {
      const bar = new HintsBar(container);
      bar.setContext("modal-open");
      const labels = bar.getVisibleHints().map((h) => h.label);
      expect(labels).toEqual(["OK", "Cancel"]);
    });

    it("button labels come from STANDARD_LABELS by default", () => {
      const bar = new HintsBar(container);
      bar.setContext("browser");
      const confirm = bar.getVisibleHints().find((h) => h.action === "confirm")!;
      expect(confirm.button).toBe(STANDARD_LABELS.confirm);
    });
  });

  describe("disabled actions", () => {
    it("disabled actions vanish from the visible hints", () => {
      const bar = new HintsBar(container);
      bar.setContext("browser");
      expect(bar.getVisibleHints().some((h) => h.action === "favorite")).toBe(true);

      bar.setEnabled("favorite", false);

      expect(bar.getVisibleHints().some((h) => h.action === "favorite")).toBe(false);
    });

    it("does not render DOM for disabled actions (no grey-out)", () => {
      const bar = new HintsBar(container);
      bar.setContext("browser");
      bar.setEnabled("favorite", false);

      expect(container.querySelector('.af-hint[data-action="favorite"]')).toBeNull();
    });

    it("re-enabling restores the hint", () => {
      const bar = new HintsBar(container);
      bar.setContext("browser");
      bar.setEnabled("settings", false);
      expect(bar.getVisibleHints().some((h) => h.action === "settings")).toBe(false);

      bar.setEnabled("settings", true);
      expect(bar.getVisibleHints().some((h) => h.action === "settings")).toBe(true);
    });

    it("disabled state persists across context switches", () => {
      const bar = new HintsBar(container);
      bar.setContext("browser");
      bar.setEnabled("confirm", false);

      bar.setContext("paused");
      expect(bar.getVisibleHints().some((h) => h.action === "confirm")).toBe(false);

      bar.setContext("modal-open");
      expect(bar.getVisibleHints().some((h) => h.action === "confirm")).toBe(false);
    });
  });

  describe("custom labels", () => {
    it("options.labels overrides STANDARD_LABELS per-action", () => {
      const bar = new HintsBar(container, { labels: { confirm: "A" } });
      bar.setContext("browser");
      const confirm = bar.getVisibleHints().find((h) => h.action === "confirm")!;
      expect(confirm.button).toBe("A");
    });

    it("setLabels() swaps the label set and re-renders", () => {
      const bar = new HintsBar(container);
      bar.setContext("browser");
      bar.setLabels({ confirm: "Enter" });
      const confirm = bar.getVisibleHints().find((h) => h.action === "confirm")!;
      expect(confirm.button).toBe("Enter");
      expect(container.querySelector('[data-action="confirm"] .af-hint-button')!.textContent).toBe("[Enter]");
    });
  });

  describe("DOM output", () => {
    it("renders a role=toolbar root with .af-hint children", () => {
      const bar = new HintsBar(container);
      bar.setContext("browser");
      expect(bar.root.getAttribute("role")).toBe("toolbar");
      const children = container.querySelectorAll(".af-hint");
      expect(children.length).toBe(CONTEXT_HINTS.browser.length);
    });

    it("setContext re-renders with the new context's hints", () => {
      const bar = new HintsBar(container);
      bar.setContext("browser");
      expect(container.querySelectorAll(".af-hint").length).toBe(CONTEXT_HINTS.browser.length);

      bar.setContext("modal-open");
      expect(container.querySelectorAll(".af-hint").length).toBe(CONTEXT_HINTS["modal-open"].length);
    });

    it("setContext with the same context is a no-op (no duplicate renders)", () => {
      const bar = new HintsBar(container);
      bar.setContext("browser");
      const before = container.innerHTML;
      bar.setContext("browser");
      expect(container.innerHTML).toBe(before);
    });
  });

  describe("exhaustive context coverage", () => {
    const contexts: readonly HintContext[] = ["browser", "paused", "modal-open"];

    it("every context has at least one hint (no empty toolbar)", () => {
      for (const ctx of contexts) {
        expect(CONTEXT_HINTS[ctx].length).toBeGreaterThan(0);
      }
    });

    it("every hint action has a STANDARD_LABELS entry", () => {
      const used = new Set<string>();
      for (const ctx of contexts) {
        for (const hint of CONTEXT_HINTS[ctx]) used.add(hint.action);
      }
      for (const action of used) {
        expect(STANDARD_LABELS[action as keyof typeof STANDARD_LABELS], `missing label for ${action}`).toBeDefined();
      }
    });
  });
});
