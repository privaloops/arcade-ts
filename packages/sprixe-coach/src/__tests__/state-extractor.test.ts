import { describe, it, expect } from 'vitest';
import { StateExtractor } from '../extractor/state-extractor';
import { SF2HF_MEMORY_MAP } from '../extractor/sf2hf-memory-map';

const WORK_RAM_BASE = 0xFF0000;
const WORK_RAM_SIZE = 0x10000;

function makeRam(): Uint8Array {
  return new Uint8Array(WORK_RAM_SIZE);
}

function writeU8(ram: Uint8Array, addr: number, value: number): void {
  ram[addr - WORK_RAM_BASE] = value & 0xFF;
}

function writeU16(ram: Uint8Array, addr: number, value: number): void {
  const off = addr - WORK_RAM_BASE;
  ram[off] = (value >> 8) & 0xFF;
  ram[off + 1] = value & 0xFF;
}

describe('StateExtractor', () => {
  it('decodes HP as big-endian 16-bit unsigned', () => {
    const ram = makeRam();
    writeU16(ram, SF2HF_MEMORY_MAP.p1_hp.offset, 144);
    writeU16(ram, SF2HF_MEMORY_MAP.p2_hp.offset, 76);

    const state = new StateExtractor().extract(ram, 1000);

    expect(state.p1.hp).toBe(144);
    expect(state.p2.hp).toBe(76);
  });

  it('decodes character IDs via the table', () => {
    const ram = makeRam();
    writeU8(ram, SF2HF_MEMORY_MAP.p1_char_id.offset, 0x00); // ryu
    writeU8(ram, SF2HF_MEMORY_MAP.p2_char_id.offset, 0x0B); // bison

    const state = new StateExtractor().extract(ram, 0);

    expect(state.p1.charId).toBe('ryu');
    expect(state.p2.charId).toBe('bison');
  });

  it('returns "unknown" for out-of-range character IDs', () => {
    const ram = makeRam();
    writeU8(ram, SF2HF_MEMORY_MAP.p1_char_id.offset, 0xFF);

    const state = new StateExtractor().extract(ram, 0);

    expect(state.p1.charId).toBe('unknown');
  });

  it('decodes BCD timer (seconds)', () => {
    const ram = makeRam();
    writeU8(ram, SF2HF_MEMORY_MAP.timer.offset, 0x42); // BCD → 42

    const state = new StateExtractor().extract(ram, 0);

    expect(state.timer).toBe(42);
  });

  it('treats positive Y byte as airborne and jumping', () => {
    const ram = makeRam();
    writeU8(ram, SF2HF_MEMORY_MAP.p1_y.offset, 48); // jump height 48px

    const state = new StateExtractor().extract(ram, 0);

    expect(state.p1.y).toBe(48);
    expect(state.p1.isAirborne).toBe(true);
    expect(state.p1.isJumping).toBe(true);
  });

  it('Y=0 means grounded', () => {
    const ram = makeRam();
    writeU8(ram, SF2HF_MEMORY_MAP.p1_y.offset, 0);

    const state = new StateExtractor().extract(ram, 0);

    expect(state.p1.y).toBe(0);
    expect(state.p1.isAirborne).toBe(false);
    expect(state.p1.isJumping).toBe(false);
  });

  it('increments frameIdx across successive extractions', () => {
    const ram = makeRam();
    const extractor = new StateExtractor();

    expect(extractor.extract(ram, 0).frameIdx).toBe(0);
    expect(extractor.extract(ram, 16).frameIdx).toBe(1);
    expect(extractor.extract(ram, 33).frameIdx).toBe(2);
  });

  it('null-attack when attack_id is zero', () => {
    const ram = makeRam();
    writeU8(ram, SF2HF_MEMORY_MAP.p1_attack_id.offset, 0);

    const state = new StateExtractor().extract(ram, 0);

    expect(state.p1.currentAttackId).toBeNull();
    expect(state.p1.attackPhase).toBeNull();
  });
});
