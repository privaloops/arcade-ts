import { describe, it, expect } from "vitest";
import { InputInjector, type Runner } from "../input.js";

function makeRunner(): { runner: Runner; calls: { cmd: string; args: string[] }[] } {
  const calls: { cmd: string; args: string[] }[] = [];
  const runner: Runner = async (cmd, args) => {
    calls.push({ cmd, args: [...args] });
  };
  return { runner, calls };
}

describe("InputInjector", () => {
  it("forwards quit as a single ESC press+release via ydotool key", async () => {
    const { runner, calls } = makeRunner();
    const injector = new InputInjector({ runner });
    await injector.send("quit");
    expect(calls).toEqual([{ cmd: "ydotool", args: ["key", "1:1", "1:0"] }]);
  });

  it("save uses Shift+F7 and releases keys in reverse order", async () => {
    const { runner, calls } = makeRunner();
    const injector = new InputInjector({ runner });
    await injector.send("save");
    // Shift down, F7 down, F7 up, Shift up — never leaves Shift held.
    expect(calls).toEqual([{
      cmd: "ydotool",
      args: ["key", "42:1", "65:1", "65:0", "42:0"],
    }]);
  });

  it("load mirrors save with F8", async () => {
    const { runner, calls } = makeRunner();
    const injector = new InputInjector({ runner });
    await injector.send("load");
    expect(calls[0]!.args).toEqual(["key", "42:1", "66:1", "66:0", "42:0"]);
  });

  it("volume actions map to plain - and = keys", async () => {
    const { runner, calls } = makeRunner();
    const injector = new InputInjector({ runner });
    await injector.send("volume-up");
    await injector.send("volume-down");
    expect(calls[0]!.args).toEqual(["key", "13:1", "13:0"]);
    expect(calls[1]!.args).toEqual(["key", "12:1", "12:0"]);
  });

  it("uses the bin override when provided", async () => {
    const { runner, calls } = makeRunner();
    const injector = new InputInjector({ runner, bin: "/usr/local/bin/ydotool" });
    await injector.send("pause");
    expect(calls[0]!.cmd).toBe("/usr/local/bin/ydotool");
  });

  it("propagates runner failures", async () => {
    const runner: Runner = async () => { throw new Error("ydotool down"); };
    const injector = new InputInjector({ runner });
    await expect(injector.send("quit")).rejects.toThrow("ydotool down");
  });
});
