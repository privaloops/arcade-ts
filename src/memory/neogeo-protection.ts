/**
 * Neo-Geo Game Protection Handlers
 *
 * Translated from MAME source (BSD-3-Clause):
 *   src/devices/bus/neogeo/prot_kof98.cpp
 *   src/devices/bus/neogeo/prot_mslugx.cpp
 *   src/devices/bus/neogeo/prot_sma.cpp
 *   src/devices/bus/neogeo/prot_cmc.cpp
 *
 * Protection types:
 *   - KOF98: ALTERA CPLD ROM overlay + P-ROM decrypt
 *   - MSLUGX: ALTERA CPLD bit-serial counter
 *   - SMA: Custom bankswitch + LFSR RNG + P-ROM decrypt
 *   - CMC: GFX (C-ROM) encryption + SFIX extraction
 */

// ---------------------------------------------------------------------------
// Runtime protection interface — bus calls these for protected address ranges
// ---------------------------------------------------------------------------

export interface NeoGeoProtection {
  /** Handle read from protected address range. Returns value or undefined if not handled. */
  read16?(address: number, busRead16: (addr: number) => number): number | undefined;
  /** Handle write to protected address range. Returns true if handled. */
  write16?(address: number, value: number): boolean;
}

// ---------------------------------------------------------------------------
// KOF98 Protection (ALTERA EPM7128SQC100-15)
// ---------------------------------------------------------------------------

export class Kof98Protection implements NeoGeoProtection {
  private protState = 0;
  private defaultRom: [number, number] = [0, 0];

  /** Store original ROM words at 0x100/0x102 before decrypt overwrites them */
  setDefaultRom(word100: number, word102: number): void {
    this.defaultRom = [word100, word102];
  }

  read16(address: number): number | undefined {
    // ROM overlay at 0x000100-0x000103
    if (address === 0x000100) {
      if (this.protState === 1) return 0x00C2;
      if (this.protState === 2) return 0x4E45;
      return this.defaultRom[0];
    }
    if (address === 0x000102) {
      if (this.protState === 1) return 0x00FD;
      if (this.protState === 2) return 0x4F2D;
      return this.defaultRom[1];
    }
    return undefined;
  }

  write16(address: number, value: number): boolean {
    // Write to 0x20AAAA sets protection state
    if (address === 0x20AAAA) {
      if (value === 0x0090) this.protState = 1;
      else if (value === 0x00F0) this.protState = 2;
      return true;
    }
    return false;
  }
}

/**
 * KOF98 P-ROM decryption (MAME: kof98_prot_device::decrypt_68k)
 * Shuffles 2-byte words within 0x200-byte blocks using sec[]/pos[] tables.
 * Operates on the raw (already word-swapped) P-ROM buffer.
 */
export function kof98Decrypt68k(rom: Uint8Array, size: number): [number, number] {
  const sec = [0x000000, 0x100000, 0x000004, 0x100004, 0x10000A, 0x00000A, 0x10000E, 0x00000E];
  const pos = [0x000, 0x004, 0x00A, 0x00E];

  // Work on 16-bit view for word operations
  const src = new Uint8Array(0x200000);
  src.set(rom.subarray(0, Math.min(rom.length, 0x200000)));

  for (let i = 0x800; i < 0x100000; i += 0x200) {
    for (let j = 0; j < 0x100; j += 0x10) {
      for (let k = 0; k < 16; k += 2) {
        // Swap between i+j+k and i+j+sec[k/2] halves
        rom[i + j + k] = src[i + j + sec[k / 2]! + 0x100]!;
        rom[i + j + k + 1] = src[i + j + sec[k / 2]! + 0x101]!;
        rom[i + j + k + 0x100] = src[i + j + sec[k / 2]!]!;
        rom[i + j + k + 0x101] = src[i + j + sec[k / 2]! + 1]!;
      }
      // Zone-specific fixups for pos[] offsets
      if (i >= 0x080000 && i < 0x0C0000) {
        for (let k = 0; k < 4; k++) {
          rom[i + j + pos[k]!] = src[i + j + pos[k]!]!;
          rom[i + j + pos[k]! + 1] = src[i + j + pos[k]! + 1]!;
          rom[i + j + pos[k]! + 0x100] = src[i + j + pos[k]! + 0x100]!;
          rom[i + j + pos[k]! + 0x101] = src[i + j + pos[k]! + 0x101]!;
        }
      } else if (i >= 0x0C0000) {
        for (let k = 0; k < 4; k++) {
          rom[i + j + pos[k]!] = src[i + j + pos[k]! + 0x100]!;
          rom[i + j + pos[k]! + 1] = src[i + j + pos[k]! + 0x101]!;
          rom[i + j + pos[k]! + 0x100] = src[i + j + pos[k]!]!;
          rom[i + j + pos[k]! + 0x101] = src[i + j + pos[k]! + 1]!;
        }
      }
    }
    // Copy first 4 bytes of each 0x200 block from src
    rom[i] = src[i]!;
    rom[i + 1] = src[i + 1]!;
    rom[i + 2] = src[i + 0x100000]!;
    rom[i + 3] = src[i + 0x100001]!;
    rom[i + 0x100] = src[i + 0x100]!;
    rom[i + 0x101] = src[i + 0x101]!;
    rom[i + 0x102] = src[i + 0x100100]!;
    rom[i + 0x103] = src[i + 0x100101]!;
  }

  // Move upper data: src[0x200000..0x5FFFFF] → rom[0x100000..0x4FFFFF]
  if (size > 0x200000) {
    rom.copyWithin(0x100000, 0x200000, Math.min(size, 0x600000));
  }

  // Save default ROM words at 0x100/0x102 (16-bit big-endian)
  const word100 = (rom[0x100]! << 8) | rom[0x101]!;
  const word102 = (rom[0x102]! << 8) | rom[0x103]!;
  return [word100, word102];
}

// ---------------------------------------------------------------------------
// Metal Slug X Protection (ALTERA EPM7128SQC100-15)
// ---------------------------------------------------------------------------

export class MslugxProtection implements NeoGeoProtection {
  private counter = 0;
  private command = 0;
  private busRead: (addr: number) => number;

  constructor(busRead16: (addr: number) => number) {
    this.busRead = busRead16;
  }

  /** Update bus read function (needed if bus reference changes) */
  setBusRead(fn: (addr: number) => number): void {
    this.busRead = fn;
  }

  read16(address: number): number | undefined {
    // Protection reads at 0x2FFFE0-0x2FFFEF
    if (address < 0x2FFFE0 || address > 0x2FFFEF) return undefined;

    switch (this.command) {
      case 0x0001: {
        // Sequential bit read from P-ROM at 0xDEDD2
        const byteAddr = 0xDEDD2 + ((this.counter >> 3) & 0xFFF);
        const byteVal = this.busRead(byteAddr & ~1);
        // Extract from the correct byte (high or low)
        const b = (address & 1) ? (byteVal & 0xFF) : ((byteVal >> 8) & 0xFF);
        const bitVal = (this.busRead(byteAddr & ~1) >> (8 * (1 - (byteAddr & 1)))) & 0xFF;
        const res = (bitVal >> (~this.counter & 0x07)) & 1;
        this.counter++;
        return res;
      }
      case 0x0FFF: {
        // Indexed bit read based on work RAM value
        const select = this.busRead(0x10F00A) - 1;
        const byteAddr2 = 0xDEDD2 + ((select >> 3) & 0x0FFF);
        const bitVal2 = (this.busRead(byteAddr2 & ~1) >> (8 * (1 - (byteAddr2 & 1)))) & 0xFF;
        return (bitVal2 >> (~select & 0x07)) & 1;
      }
      default:
        return 0;
    }
  }

  write16(address: number, value: number): boolean {
    if (address < 0x2FFFE0 || address > 0x2FFFEF) return false;

    const offset = (address - 0x2FFFE0) >> 1;
    switch (offset) {
      case 0: // 0x2FFFE0: start new read
        this.command = 0;
        break;
      case 1: // 0x2FFFE2: command (pulsed with data then 0)
      case 2: // 0x2FFFE4: command continuation
        this.command |= value;
        break;
      case 3: // 0x2FFFE6: finished
        break;
      case 5: // 0x2FFFEA: init
        this.counter = 0;
        this.command = 0;
        break;
    }
    return true;
  }
}

// ---------------------------------------------------------------------------
// SMA Protection (KOF99, Garou, MSlug3, KOF2000)
// Custom bankswitch + LFSR RNG + P-ROM decrypt
// ---------------------------------------------------------------------------

/** Extract bits from value and rearrange them. MAME: bitswap<N>. */
function bitswap(val: number, ...bits: number[]): number {
  let result = 0;
  for (let i = 0; i < bits.length; i++) {
    result |= ((val >> bits[i]!) & 1) << (bits.length - 1 - i);
  }
  return result;
}

// Bank offset tables per game (MAME: bankoffset[64])
const SMA_BANKS: Record<string, { offsets: number[]; bits: number[] }> = {
  kof99: {
    offsets: [
      0x000000, 0x100000, 0x200000, 0x300000, 0x3CC000, 0x4CC000, 0x3F2000, 0x4F2000,
      0x407800, 0x507800, 0x40D000, 0x50D000, 0x417800, 0x517800, 0x420800, 0x520800,
      0x424800, 0x524800, 0x429000, 0x529000, 0x42E800, 0x52E800, 0x431800, 0x531800,
      0x54D000, 0x551000, 0x567000, 0x592800, 0x588800, 0x581800, 0x599800, 0x594800,
      0x598000,
    ],
    bits: [5, 12, 10, 8, 6, 14], // bitswap<6>(sel, ...)
  },
  garou: {
    offsets: [
      0x000000, 0x100000, 0x200000, 0x300000, 0x280000, 0x380000, 0x2D0000, 0x3D0000,
      0x2F0000, 0x3F0000, 0x400000, 0x500000, 0x420000, 0x520000, 0x440000, 0x540000,
      0x498000, 0x598000, 0x4A0000, 0x5A0000, 0x4A8000, 0x5A8000, 0x4B0000, 0x5B0000,
      0x4B8000, 0x5B8000, 0x4C0000, 0x5C0000, 0x4C8000, 0x5C8000, 0x4D0000, 0x5D0000,
      0x458000, 0x558000, 0x460000, 0x560000, 0x468000, 0x568000, 0x470000, 0x570000,
      0x478000, 0x578000, 0x480000, 0x580000, 0x488000, 0x588000, 0x490000, 0x590000,
      0x5D0000, 0x5D8000, 0x5E0000, 0x5E8000, 0x5F0000, 0x5F8000, 0x600000,
    ],
    bits: [12, 14, 6, 7, 9, 5],
  },
  garouh: {
    offsets: [
      0x000000, 0x100000, 0x200000, 0x300000, 0x280000, 0x380000, 0x2D0000, 0x3D0000,
      0x2C8000, 0x3C8000, 0x400000, 0x500000, 0x420000, 0x520000, 0x440000, 0x540000,
      0x598000, 0x698000, 0x5A0000, 0x6A0000, 0x5A8000, 0x6A8000, 0x5B0000, 0x6B0000,
      0x5B8000, 0x6B8000, 0x5C0000, 0x6C0000, 0x5C8000, 0x6C8000, 0x5D0000, 0x6D0000,
      0x458000, 0x558000, 0x460000, 0x560000, 0x468000, 0x568000, 0x470000, 0x570000,
      0x478000, 0x578000, 0x480000, 0x580000, 0x488000, 0x588000, 0x490000, 0x590000,
      0x5D8000, 0x6D8000, 0x5E0000, 0x6E0000, 0x5E8000, 0x6E8000, 0x6E8000, 0x000000,
      0x000000, 0x000000, 0x000000, 0x000000, 0x000000, 0x000000, 0x000000, 0x000000,
    ],
    bits: [13, 11, 2, 14, 8, 4],
  },
  mslug3: {
    offsets: [
      0x000000, 0x020000, 0x040000, 0x060000, 0x070000, 0x090000, 0x0B0000, 0x0D0000,
      0x0E0000, 0x0F0000, 0x120000, 0x130000, 0x140000, 0x150000, 0x180000, 0x190000,
      0x1A0000, 0x1B0000, 0x1E0000, 0x1F0000, 0x200000, 0x210000, 0x240000, 0x250000,
      0x260000, 0x270000, 0x2A0000, 0x2B0000, 0x2C0000, 0x2D0000, 0x300000, 0x310000,
      0x320000, 0x330000, 0x360000, 0x370000, 0x380000, 0x390000, 0x3C0000, 0x3D0000,
      0x400000, 0x410000, 0x440000, 0x450000, 0x460000, 0x470000, 0x4A0000, 0x4B0000,
      0x4C0000,
    ],
    bits: [9, 3, 6, 15, 12, 14],
  },
  mslug3a: {
    offsets: [
      0x000000, 0x030000, 0x040000, 0x070000, 0x080000, 0x0A0000, 0x0C0000, 0x0E0000,
      0x0F0000, 0x100000, 0x130000, 0x140000, 0x150000, 0x160000, 0x190000, 0x1A0000,
      0x1B0000, 0x1C0000, 0x1F0000, 0x200000, 0x210000, 0x220000, 0x250000, 0x260000,
      0x270000, 0x280000, 0x2B0000, 0x2C0000, 0x2D0000, 0x2E0000, 0x310000, 0x320000,
      0x330000, 0x340000, 0x370000, 0x380000, 0x390000, 0x3A0000, 0x3D0000, 0x3E0000,
      0x400000, 0x410000, 0x440000, 0x450000, 0x460000, 0x470000, 0x4A0000, 0x4B0000,
      0x4C0000,
    ],
    bits: [11, 12, 6, 1, 3, 15],
  },
  kof2000: {
    offsets: [
      0x000000, 0x100000, 0x200000, 0x300000, 0x3F7800, 0x4F7800, 0x3FF800, 0x4FF800,
      0x407800, 0x507800, 0x40F800, 0x50F800, 0x416800, 0x516800, 0x41D800, 0x51D800,
      0x424000, 0x524000, 0x523800, 0x623800, 0x526000, 0x626000, 0x528000, 0x628000,
      0x52A000, 0x62A000, 0x52B800, 0x62B800, 0x52D000, 0x62D000, 0x52E800, 0x62E800,
      0x618000, 0x619000, 0x61A000, 0x61A800,
    ],
    bits: [5, 10, 3, 7, 14, 15],
  },
};

/** SMA runtime protection — bankswitch + 0x9A37 read + LFSR RNG */
export class SmaProtection implements NeoGeoProtection {
  private smaRng = 0x2345;
  private bankConfig: { offsets: number[]; bits: number[] };
  private onBankSwitch: (offset: number) => void;
  // Addresses for protection reads/writes vary per game
  private protReadAddr: number;   // 0x2FE446 for all SMA games
  private rngAddr: number;        // game-specific

  constructor(
    gameName: string,
    onBankSwitch: (offset: number) => void,
    rngAddr: number,
  ) {
    const key = gameName === 'mslug3h' ? 'mslug3a' : gameName;
    this.bankConfig = SMA_BANKS[key] ?? SMA_BANKS['kof99']!;
    this.onBankSwitch = onBankSwitch;
    this.protReadAddr = 0x2FE446;
    this.rngAddr = rngAddr;
  }

  read16(address: number): number | undefined {
    // Protection magic value
    if (address === this.protReadAddr) return 0x9A37;
    // LFSR random number generator
    if (address === this.rngAddr) return this.nextRandom();
    return undefined;
  }

  write16(address: number, value: number): boolean {
    // Bankswitch writes to 0x2FFFF0
    if (address === 0x2FFFF0) {
      const idx = bitswap(value, ...this.bankConfig.bits);
      const offset = this.bankConfig.offsets[idx] ?? 0;
      this.onBankSwitch(0x100000 + offset);
      return true;
    }
    return false;
  }

  private nextRandom(): number {
    const old = this.smaRng;
    const newbit = (
      ((this.smaRng >> 2) ^ (this.smaRng >> 3) ^ (this.smaRng >> 5) ^
       (this.smaRng >> 6) ^ (this.smaRng >> 7) ^ (this.smaRng >> 11) ^
       (this.smaRng >> 12) ^ (this.smaRng >> 15))
    ) & 1;
    this.smaRng = ((this.smaRng << 1) | newbit) & 0xFFFF;
    return old;
  }
}

// SMA P-ROM decrypt configs per game
interface SmaDecryptConfig {
  dataSwap: number[];       // bitswap<16> for data lines
  addrBlockSize: number;    // block size for address descramble
  addrSwap: number[];       // bitswap for address within blocks
  fixedSource: number;      // byte offset of fixed part source
  fixedSwap: number[];      // bitswap<19> for fixed part address
  fixedFirst: boolean;      // true = fixed relocation before addr descramble
  addrRange: number;        // total bytes to descramble (banked region)
}

const SMA_DECRYPT: Record<string, SmaDecryptConfig> = {
  kof99: {
    dataSwap: [13, 7, 3, 0, 9, 4, 5, 6, 1, 12, 8, 14, 10, 11, 2, 15],
    addrBlockSize: 0x800, addrRange: 0x600000,
    addrSwap: [6, 2, 4, 9, 8, 3, 1, 7, 0, 5],
    fixedSource: 0x700000, fixedSwap: [18, 11, 6, 14, 17, 16, 5, 8, 10, 12, 0, 4, 3, 2, 7, 9, 15, 13, 1],
    fixedFirst: false,
  },
  garou: {
    dataSwap: [13, 12, 14, 10, 8, 2, 3, 1, 5, 9, 11, 4, 15, 0, 6, 7],
    addrBlockSize: 0x8000, addrRange: 0x800000,
    addrSwap: [9, 4, 8, 3, 13, 6, 2, 7, 0, 12, 1, 11, 10, 5],
    fixedSource: 0x710000, fixedSwap: [18, 4, 5, 16, 14, 7, 9, 6, 13, 17, 15, 3, 1, 2, 12, 11, 8, 10, 0],
    fixedFirst: true,
  },
  garouh: {
    dataSwap: [14, 5, 1, 11, 7, 4, 10, 15, 3, 12, 8, 13, 0, 2, 9, 6],
    addrBlockSize: 0x8000, addrRange: 0x800000,
    addrSwap: [12, 8, 1, 7, 11, 3, 13, 10, 6, 9, 5, 4, 0, 2],
    fixedSource: 0x7F8000, fixedSwap: [18, 5, 16, 11, 2, 6, 7, 17, 3, 12, 8, 14, 4, 0, 9, 1, 10, 15, 13],
    fixedFirst: true,
  },
  mslug3: {
    dataSwap: [4, 11, 14, 3, 1, 13, 0, 7, 2, 8, 12, 15, 10, 9, 5, 6],
    addrBlockSize: 0x10000, addrRange: 0x800000,
    addrSwap: [2, 11, 0, 14, 6, 4, 13, 8, 9, 3, 10, 7, 5, 12, 1],
    fixedSource: 0x5D0000, fixedSwap: [18, 15, 2, 1, 13, 3, 0, 9, 6, 16, 4, 11, 5, 7, 12, 17, 14, 10, 8],
    fixedFirst: true,
  },
  mslug3a: {
    dataSwap: [2, 11, 12, 14, 9, 3, 1, 4, 13, 7, 6, 8, 10, 15, 0, 5],
    addrBlockSize: 0x10000, addrRange: 0x800000,
    addrSwap: [12, 0, 11, 3, 4, 13, 6, 8, 14, 7, 5, 2, 10, 9, 1],
    fixedSource: 0x5D0000, fixedSwap: [18, 1, 16, 14, 7, 17, 5, 8, 4, 15, 6, 3, 2, 0, 13, 10, 12, 9, 11],
    fixedFirst: true,
  },
  kof2000: {
    dataSwap: [12, 8, 11, 3, 15, 14, 7, 0, 10, 13, 6, 5, 9, 2, 1, 4],
    addrBlockSize: 0x800, addrRange: 0x63A000,
    addrSwap: [4, 1, 3, 8, 6, 2, 7, 0, 9, 5],
    fixedSource: 0x73A000, fixedSwap: [18, 8, 4, 15, 13, 3, 14, 16, 2, 6, 17, 7, 12, 10, 0, 5, 11, 1, 9],
    fixedFirst: false,
  },
};

/** Swap all byte pairs in a range (BE↔LE conversion) */
function byteSwapRange(rom: Uint8Array, start: number, end: number): void {
  for (let i = start; i < end; i += 2) {
    const tmp = rom[i]!;
    rom[i] = rom[i + 1]!;
    rom[i + 1] = tmp;
  }
}

/** SMA P-ROM decryption — generic for all SMA games */
export function smaDecrypt68k(rom: Uint8Array, gameName: string): void {
  const key = gameName === 'mslug3h' ? 'mslug3a' : gameName;
  const cfg = SMA_DECRYPT[key];
  if (!cfg) return;

  // Our P-ROM is in 68K big-endian byte order. MAME's decrypt operates on
  // x86 little-endian uint16_t*. Convert BE→LE before decrypt, LE→BE after.
  byteSwapRange(rom, 0, rom.length);

  const romView = new DataView(rom.buffer, rom.byteOffset, rom.byteLength);
  const wordCount = Math.min(0x800000, rom.length - 0x100000) / 2;

  // Step 1: Data line swap on entire banked region (0x100000+)
  for (let i = 0; i < wordCount; i++) {
    const off = 0x100000 + i * 2;
    const val = romView.getUint16(off, true);
    romView.setUint16(off, bitswap(val, ...cfg.dataSwap), true);
  }

  // Steps 2 & 3: address descramble + fixed part relocation (order varies per game)
  if (cfg.fixedFirst) {
    relocateFixed(rom, romView, cfg);
    descrambleAddr(rom, romView, cfg);
  } else {
    descrambleAddr(rom, romView, cfg);
    relocateFixed(rom, romView, cfg);
  }

  // Convert back from LE to 68K BE byte order
  byteSwapRange(rom, 0, rom.length);
}

function descrambleAddr(rom: Uint8Array, romView: DataView, cfg: SmaDecryptConfig): void {
  const blockWords = cfg.addrBlockSize / 2;
  const totalWords = Math.min(cfg.addrRange, rom.length - 0x100000) / 2;
  const buf = new Uint16Array(blockWords);

  for (let i = 0; i < totalWords; i += blockWords) {
    for (let j = 0; j < blockWords; j++) {
      buf[j] = romView.getUint16(0x100000 + (i + j) * 2, true);
    }
    for (let j = 0; j < blockWords; j++) {
      const srcIdx = bitswap(j, ...cfg.addrSwap);
      romView.setUint16(0x100000 + (i + j) * 2, buf[srcIdx]!, true);
    }
  }
}

function relocateFixed(rom: Uint8Array, romView: DataView, cfg: SmaDecryptConfig): void {
  const fixedWords = 0x0C0000 / 2;
  const srcBase = cfg.fixedSource / 2;

  // Read from source with address permutation, write to start of ROM
  const buf = new Uint16Array(fixedWords);
  for (let i = 0; i < fixedWords; i++) {
    const srcIdx = srcBase + bitswap(i, ...cfg.fixedSwap);
    buf[i] = romView.getUint16(srcIdx * 2, true);
  }
  for (let i = 0; i < fixedWords; i++) {
    romView.setUint16(i * 2, buf[i]!, true);
  }
}

// SMA game RNG addresses (MAME memory maps)
const SMA_RNG_ADDR: Record<string, number> = {
  kof99: 0x2FFFF8,
  garou: 0x2FFFCC,
  garouh: 0x2FFFCC,
  mslug3: 0x2FFF00,
  mslug3a: 0x2FFF00,
  mslug3h: 0x2FFF00,
  kof2000: 0x2FFFD8,
};

/** Get the RNG read address for an SMA game */
export function getSmaRngAddr(gameName: string): number {
  return SMA_RNG_ADDR[gameName] ?? 0x2FFFF8;
}

// ---------------------------------------------------------------------------
// Protection factory — creates the right handler based on game name
// ---------------------------------------------------------------------------

/** Get protection type for a game, or null if standard (no protection). */
export function getProtectionType(gameName: string): string | null {
  switch (gameName) {
    case 'kof98': case 'kof98a': case 'kof98k': case 'kof98ka':
      return 'kof98';
    case 'mslugx':
      return 'mslugx';
    // SMA games (to be implemented)
    case 'kof99': case 'kof99e': case 'kof99k': case 'kof99p':
    case 'garou': case 'garouh':
    case 'mslug3': case 'mslug3h':
    case 'kof2000': case 'kof2000n':
      return 'sma';
    // CMC games (to be implemented)
    case 'zupapa': case 'ganryu': case 's1945p': case 'preisle2':
    case 'bangbead': case 'nitd': case 'sengoku3':
    case 'kof2001': case 'kof2001h':
    case 'mslug4': case 'mslug4h':
    case 'rotd': case 'rotdh':
    case 'kof2002': case 'kof2002b':
    case 'matrim':
    case 'samsho5': case 'samsho5h': case 'samsh5sp': case 'samsh5sph':
    case 'mslug5': case 'mslug5h':
    case 'svc': case 'svcsplus':
    case 'kof2003': case 'kof2003h':
      return 'cmc';
    default:
      return null;
  }
}
