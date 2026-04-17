import { describe, it, expect, beforeEach } from 'vitest';
import { bufToB64, b64ToBuf, saveToSlot, loadFromSlot, getSlotInfo, deleteSlot, getNumSlots, SAVE_STATE_VERSION } from '../save-state';
import type { SaveState } from '../save-state';

// Mock localStorage
const storage = new Map<string, string>();
const localStorageMock = {
  getItem: (key: string) => storage.get(key) ?? null,
  setItem: (key: string, value: string) => { storage.set(key, value); },
  removeItem: (key: string) => { storage.delete(key); },
};
Object.defineProperty(globalThis, 'localStorage', { value: localStorageMock, writable: true });

function makeFakeState(gameName = 'sf2'): SaveState {
  return {
    version: SAVE_STATE_VERSION,
    gameName,
    timestamp: Date.now(),
    m68k: {
      d: new Int32Array([1, 2, 3, 4, 5, 6, 7, 8]),
      a: new Int32Array([0x100, 0x200, 0x300, 0x400, 0x500, 0x600, 0x700, 0xFF0000]),
      pc: 0x1000,
      sr: 0x2700,
      ssp: 0xFF0000,
      usp: 0xFE0000,
      stopped: false,
    } as SaveState['m68k'],
    z80: { regs: {}, halted: false, iff1: false, iff2: false, im: 1 } as unknown as SaveState['z80'],
    workRam: bufToB64(new Uint8Array([0x42, 0x43])),
    vram: bufToB64(new Uint8Array([0x01, 0x02])),
    cpsaRegs: bufToB64(new Uint8Array(0x40)),
    cpsbRegs: bufToB64(new Uint8Array(0x40)),
    ioPorts: bufToB64(new Uint8Array(8)),
    coinCtrl: bufToB64(new Uint8Array(2)),
    z80WorkRam: bufToB64(new Uint8Array(0x800)),
    z80Bus: {
      currentBank: 0,
      soundLatchValue: 0,
      soundLatchQueue: [],
      soundLatch2Value: 0,
      soundLatch2Queue: [],
      ym2151Register: 0,
    },
    oki: null,
    objBuffer: bufToB64(new Uint8Array(0x800)),
    frameCount: 100,
  };
}

describe('save-state base64 helpers', () => {
  it('bufToB64 + b64ToBuf roundtrip preserves data', () => {
    const original = new Uint8Array([0, 1, 127, 128, 255]);
    const b64 = bufToB64(original);
    const decoded = b64ToBuf(b64);
    expect(decoded).toEqual(original);
  });

  it('handles empty buffer', () => {
    const empty = new Uint8Array(0);
    const b64 = bufToB64(empty);
    const decoded = b64ToBuf(b64);
    expect(decoded.length).toBe(0);
  });

  it('handles large buffer (64KB)', () => {
    const big = new Uint8Array(65536);
    for (let i = 0; i < big.length; i++) big[i] = i & 0xFF;
    const decoded = b64ToBuf(bufToB64(big));
    expect(decoded).toEqual(big);
  });
});

describe('save-state slot operations', () => {
  beforeEach(() => {
    storage.clear();
  });

  it('saveToSlot + loadFromSlot roundtrip preserves game name and frame count', () => {
    const state = makeFakeState('ffight');
    saveToSlot(0, state);

    const loaded = loadFromSlot(0);
    expect(loaded).not.toBeNull();
    expect(loaded!.gameName).toBe('ffight');
    expect(loaded!.frameCount).toBe(100);
  });

  it('saveToSlot + loadFromSlot preserves m68k registers (Int32Array roundtrip)', () => {
    const state = makeFakeState();
    saveToSlot(0, state);

    const loaded = loadFromSlot(0);
    expect(loaded).not.toBeNull();
    // Int32Array should be restored
    expect(loaded!.m68k.d).toBeInstanceOf(Int32Array);
    expect(loaded!.m68k.a).toBeInstanceOf(Int32Array);
    expect(loaded!.m68k.d[0]).toBe(1);
    expect(loaded!.m68k.a[0]).toBe(0x100);
    expect(loaded!.m68k.pc).toBe(0x1000);
  });

  it('loading from empty slot returns null', () => {
    expect(loadFromSlot(0)).toBeNull();
  });

  it('saving to slot 2 does not overwrite slot 1', () => {
    const state1 = makeFakeState('sf2');
    const state2 = makeFakeState('ffight');
    saveToSlot(1, state1);
    saveToSlot(2, state2);

    expect(loadFromSlot(1)!.gameName).toBe('sf2');
    expect(loadFromSlot(2)!.gameName).toBe('ffight');
  });

  it('deleteSlot removes the save', () => {
    saveToSlot(0, makeFakeState());
    expect(loadFromSlot(0)).not.toBeNull();

    deleteSlot(0);
    expect(loadFromSlot(0)).toBeNull();
  });

  it('getSlotInfo returns metadata without full state', () => {
    const state = makeFakeState('ghouls');
    saveToSlot(3, state);

    const info = getSlotInfo(3);
    expect(info).not.toBeNull();
    expect(info!.gameName).toBe('ghouls');
    expect(info!.timestamp).toBe(state.timestamp);
  });

  it('getSlotInfo returns null for empty slot', () => {
    expect(getSlotInfo(0)).toBeNull();
  });

  it('malformed JSON in localStorage does not crash', () => {
    storage.set('cps1-save-0', '{invalid json!!!');
    expect(loadFromSlot(0)).toBeNull();
    expect(getSlotInfo(0)).toBeNull();
  });

  it('wrong version returns null', () => {
    storage.set('cps1-save-0', JSON.stringify({ version: 999, gameName: 'test' }));
    expect(loadFromSlot(0)).toBeNull();
  });

  it('getNumSlots returns 4', () => {
    expect(getNumSlots()).toBe(4);
  });
});
