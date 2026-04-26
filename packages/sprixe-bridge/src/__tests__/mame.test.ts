import { describe, it, expect, vi } from "vitest";
import { MameProcess, type SpawnedProcessLike, type Spawner } from "../mame.js";

class FakeProcess implements SpawnedProcessLike {
  pid = 1234;
  killed = false;
  killSignal: NodeJS.Signals | undefined;
  private exitHandler: ((code: number | null, signal: NodeJS.Signals | null) => void) | null = null;

  on(event: "exit", cb: (code: number | null, signal: NodeJS.Signals | null) => void): void {
    if (event === "exit") this.exitHandler = cb;
  }

  kill(signal?: NodeJS.Signals): boolean {
    this.killed = true;
    this.killSignal = signal;
    return true;
  }

  fireExit(code: number | null, signal: NodeJS.Signals | null = null): void {
    this.exitHandler?.(code, signal);
  }
}

function makeSpawner(): { spawner: Spawner; instances: FakeProcess[]; cmds: { cmd: string; args: string[] }[] } {
  const instances: FakeProcess[] = [];
  const cmds: { cmd: string; args: string[] }[] = [];
  const spawner: Spawner = (cmd, args) => {
    cmds.push({ cmd, args: [...args] });
    const p = new FakeProcess();
    instances.push(p);
    return p;
  };
  return { spawner, instances, cmds };
}

describe("MameProcess", () => {
  it("forwards bin + args to the spawner", () => {
    const { spawner, cmds } = makeSpawner();
    const mame = new MameProcess({ bin: "/usr/games/mame", spawner });
    mame.start({ gameId: "sf2", romPath: "/tmp/roms" });
    expect(cmds).toHaveLength(1);
    expect(cmds[0]!.cmd).toBe("/usr/games/mame");
    expect(cmds[0]!.args).toContain("sf2");
    expect(cmds[0]!.args).toContain("-rompath");
    expect(cmds[0]!.args).toContain("/tmp/roms");
  });

  it("rejects start() while another instance is alive", () => {
    const { spawner } = makeSpawner();
    const mame = new MameProcess({ spawner });
    mame.start({ gameId: "sf2", romPath: "/tmp/roms" });
    expect(() => mame.start({ gameId: "kof97", romPath: "/tmp/roms" })).toThrow(/already running/);
  });

  it("clears state and notifies listeners on exit", () => {
    const { spawner, instances } = makeSpawner();
    const mame = new MameProcess({ spawner });
    const cb = vi.fn();
    mame.onExit(cb);
    mame.start({ gameId: "sf2", romPath: "/tmp/roms" });
    expect(mame.isRunning()).toBe(true);
    instances[0]!.fireExit(0);
    expect(mame.isRunning()).toBe(false);
    expect(cb).toHaveBeenCalledWith({ kind: "exit", code: 0, signal: null });
  });

  it("stop() sends SIGTERM to the running process", () => {
    const { spawner, instances } = makeSpawner();
    const mame = new MameProcess({ spawner });
    mame.start({ gameId: "sf2", romPath: "/tmp/roms" });
    mame.stop();
    expect(instances[0]!.killed).toBe(true);
    expect(instances[0]!.killSignal).toBe("SIGTERM");
  });

  it("stop() is a no-op when nothing runs", () => {
    const { spawner } = makeSpawner();
    const mame = new MameProcess({ spawner });
    expect(() => mame.stop()).not.toThrow();
  });

  it("translates spawner throws into a spawn-error exit reason", () => {
    const spawner: Spawner = () => { throw new Error("ENOENT"); };
    const mame = new MameProcess({ spawner });
    const cb = vi.fn();
    mame.onExit(cb);
    mame.start({ gameId: "sf2", romPath: "/tmp/roms" });
    expect(cb).toHaveBeenCalledWith({
      kind: "spawn-error",
      error: expect.objectContaining({ message: "ENOENT" }),
    });
    expect(mame.isRunning()).toBe(false);
  });

  it("can relaunch after the previous instance exits", () => {
    const { spawner, instances } = makeSpawner();
    const mame = new MameProcess({ spawner });
    mame.start({ gameId: "sf2", romPath: "/tmp/roms" });
    instances[0]!.fireExit(0);
    expect(() => mame.start({ gameId: "kof97", romPath: "/tmp/roms" })).not.toThrow();
    expect(instances).toHaveLength(2);
  });
});
