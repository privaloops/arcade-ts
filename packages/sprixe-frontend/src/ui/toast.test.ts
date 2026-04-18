import { describe, it, expect, beforeEach, vi } from "vitest";
import { Toast, type ToastType } from "./toast";

function makeTimerHelpers() {
  let idGen = 0;
  const pending = new Map<number, () => void>();
  return {
    setTimer: (cb: () => void, _ms: number) => {
      const id = ++idGen;
      pending.set(id, cb);
      return id;
    },
    clearTimer: (id: number) => {
      pending.delete(id);
    },
    fire: (id: number) => {
      const cb = pending.get(id);
      if (cb) {
        pending.delete(id);
        cb();
      }
    },
    get pendingIds() { return Array.from(pending.keys()); },
  };
}

describe("Toast", () => {
  let container: HTMLDivElement;

  beforeEach(() => {
    document.body.innerHTML = "";
    container = document.createElement("div");
    document.body.appendChild(container);
  });

  describe("queue cap", () => {
    it("keeps at most 3 visible toasts (oldest evicted on 4th)", () => {
      const { setTimer, clearTimer } = makeTimerHelpers();
      const toast = new Toast(container, { setTimer, clearTimer, maxVisible: 3 });

      toast.show("info", "a");
      toast.show("info", "b");
      toast.show("info", "c");
      toast.show("info", "d");

      const entries = toast.getEntries();
      expect(entries.map((e) => e.message)).toEqual(["b", "c", "d"]);
    });

    it("maxVisible override respected", () => {
      const { setTimer, clearTimer } = makeTimerHelpers();
      const toast = new Toast(container, { setTimer, clearTimer, maxVisible: 1 });
      toast.show("info", "a");
      toast.show("info", "b");
      expect(toast.getEntries()).toHaveLength(1);
      expect(toast.getEntries()[0]!.message).toBe("b");
    });
  });

  describe("type-based duration", () => {
    it("info toasts auto-dismiss after 3000 ms", () => {
      const timers = makeTimerHelpers();
      const spy = vi.spyOn(timers, "setTimer");
      const toast = new Toast(container, { setTimer: timers.setTimer, clearTimer: timers.clearTimer });

      toast.show("info", "hello");
      // Last call args.
      const lastCall = spy.mock.calls[spy.mock.calls.length - 1]!;
      expect(lastCall[1]).toBe(3000);
    });

    it("success toasts use 4000 ms, error toasts use 6000 ms", () => {
      const timers = makeTimerHelpers();
      const spy = vi.spyOn(timers, "setTimer");
      const toast = new Toast(container, { setTimer: timers.setTimer, clearTimer: timers.clearTimer });

      toast.show("success", "done");
      expect(spy.mock.calls.at(-1)![1]).toBe(4000);
      toast.show("error", "oops");
      expect(spy.mock.calls.at(-1)![1]).toBe(6000);
    });

    it("custom durations override defaults", () => {
      const timers = makeTimerHelpers();
      const spy = vi.spyOn(timers, "setTimer");
      const toast = new Toast(container, {
        setTimer: timers.setTimer,
        clearTimer: timers.clearTimer,
        durations: { info: 1000, success: 2000, error: 3000 },
      });
      toast.show("info", "x");
      expect(spy.mock.calls.at(-1)![1]).toBe(1000);
    });
  });

  describe("auto-dismiss", () => {
    it("firing the timer removes the toast", () => {
      const timers = makeTimerHelpers();
      const toast = new Toast(container, { setTimer: timers.setTimer, clearTimer: timers.clearTimer });
      toast.show("info", "hello");
      expect(toast.getEntries()).toHaveLength(1);

      const [timerId] = timers.pendingIds;
      timers.fire(timerId!);

      expect(toast.getEntries()).toHaveLength(0);
    });
  });

  describe("manual dismissal", () => {
    it("dismiss(id) removes the entry", () => {
      const timers = makeTimerHelpers();
      const toast = new Toast(container, { setTimer: timers.setTimer, clearTimer: timers.clearTimer });
      const id = toast.show("info", "hello")!;
      expect(toast.dismiss(id)).toBe(true);
      expect(toast.getEntries()).toHaveLength(0);
    });

    it("dismiss on unknown id is a no-op", () => {
      const timers = makeTimerHelpers();
      const toast = new Toast(container, { setTimer: timers.setTimer, clearTimer: timers.clearTimer });
      expect(toast.dismiss("nope")).toBe(false);
    });

    it("close button in the DOM triggers dismissal", () => {
      const timers = makeTimerHelpers();
      const toast = new Toast(container, { setTimer: timers.setTimer, clearTimer: timers.clearTimer });
      toast.show("error", "bang");
      const close = container.querySelector<HTMLButtonElement>('[data-testid="toast-close"]')!;
      close.click();
      expect(toast.getEntries()).toHaveLength(0);
    });
  });

  describe("consecutive duplicate suppression", () => {
    it("showing the same (type, message) twice returns null on the second", () => {
      const timers = makeTimerHelpers();
      const toast = new Toast(container, { setTimer: timers.setTimer, clearTimer: timers.clearTimer });
      expect(toast.show("error", "oops")).not.toBeNull();
      expect(toast.show("error", "oops")).toBeNull();
      expect(toast.getEntries()).toHaveLength(1);
    });

    it("different messages or types bypass the suppression", () => {
      const timers = makeTimerHelpers();
      const toast = new Toast(container, { setTimer: timers.setTimer, clearTimer: timers.clearTimer });
      toast.show("error", "oops");
      toast.show("error", "other"); // different message
      toast.show("info", "other");  // different type
      expect(toast.getEntries()).toHaveLength(3);
    });

    it("a cleared lastEntry (via clearAll) lets the same message show again", () => {
      const timers = makeTimerHelpers();
      const toast = new Toast(container, { setTimer: timers.setTimer, clearTimer: timers.clearTimer });
      toast.show("info", "hi");
      toast.clearAll();
      expect(toast.show("info", "hi")).not.toBeNull();
    });
  });

  describe("clearAll", () => {
    it("drops every entry and its timer", () => {
      const timers = makeTimerHelpers();
      const toast = new Toast(container, { setTimer: timers.setTimer, clearTimer: timers.clearTimer });
      toast.show("info", "a");
      toast.show("error", "b");
      toast.show("success", "c");
      toast.clearAll();
      expect(toast.getEntries()).toHaveLength(0);
      expect(timers.pendingIds).toEqual([]);
    });
  });

  describe("DOM rendering", () => {
    it("renders one .af-toast per entry with the right type class", () => {
      const timers = makeTimerHelpers();
      const toast = new Toast(container, { setTimer: timers.setTimer, clearTimer: timers.clearTimer });
      toast.show("error", "oops");
      const el = container.querySelector<HTMLElement>('[data-testid="toast"]')!;
      expect(el.classList.contains("af-toast--error")).toBe(true);
      expect(el.textContent).toContain("oops");
    });

    it("queue order is preserved in the DOM", () => {
      const timers = makeTimerHelpers();
      const toast = new Toast(container, { setTimer: timers.setTimer, clearTimer: timers.clearTimer });
      (["info", "success", "error"] as ToastType[]).forEach((t, i) => toast.show(t, `msg-${i}`));
      const messages = Array.from(container.querySelectorAll(".af-toast-message")).map((el) => el.textContent);
      expect(messages).toEqual(["msg-0", "msg-1", "msg-2"]);
    });
  });
});
