/**
 * Kabuki Z80 encryption decoder
 *
 * Based on MAME's kabuki.cpp by Nicola Salmoria (BSD-3-Clause)
 * https://github.com/mamedev/mame/blob/master/src/mame/capcom/kabuki.cpp
 *
 * The Kabuki is a custom Z80 module that runs encrypted code.
 * Decryption produces two outputs:
 *   - Opcode-decoded ROM (Z80 fetches instructions from here)
 *   - Data-decoded ROM (Z80 reads data from here, modified in-place)
 */

function bitswap1(src: number, key: number, select: number): number {
  if (select & (1 << ((key >> 0) & 7)))
    src = (src & 0xfc) | ((src & 0x01) << 1) | ((src & 0x02) >> 1);
  if (select & (1 << ((key >> 4) & 7)))
    src = (src & 0xf3) | ((src & 0x04) << 1) | ((src & 0x08) >> 1);
  if (select & (1 << ((key >> 8) & 7)))
    src = (src & 0xcf) | ((src & 0x10) << 1) | ((src & 0x20) >> 1);
  if (select & (1 << ((key >> 12) & 7)))
    src = (src & 0x3f) | ((src & 0x40) << 1) | ((src & 0x80) >> 1);
  return src;
}

function bitswap2(src: number, key: number, select: number): number {
  if (select & (1 << ((key >> 12) & 7)))
    src = (src & 0xfc) | ((src & 0x01) << 1) | ((src & 0x02) >> 1);
  if (select & (1 << ((key >> 8) & 7)))
    src = (src & 0xf3) | ((src & 0x04) << 1) | ((src & 0x08) >> 1);
  if (select & (1 << ((key >> 4) & 7)))
    src = (src & 0xcf) | ((src & 0x10) << 1) | ((src & 0x20) >> 1);
  if (select & (1 << ((key >> 0) & 7)))
    src = (src & 0x3f) | ((src & 0x40) << 1) | ((src & 0x80) >> 1);
  return src;
}

function bytedecode(
  src: number, swap_key1: number, swap_key2: number,
  xor_key: number, select: number,
): number {
  src = bitswap1(src, swap_key1 & 0xffff, select & 0xff);
  src = ((src & 0x7f) << 1) | ((src & 0x80) >> 7);
  src = bitswap2(src, swap_key1 >>> 16, select & 0xff);
  src ^= xor_key;
  src = ((src & 0x7f) << 1) | ((src & 0x80) >> 7);
  src = bitswap2(src, swap_key2 & 0xffff, select >>> 8);
  src = ((src & 0x7f) << 1) | ((src & 0x80) >> 7);
  src = bitswap1(src, swap_key2 >>> 16, select >>> 8);
  return src;
}

/**
 * Decode a Kabuki-encrypted Z80 ROM region.
 *
 * @param src       Encrypted ROM bytes
 * @param destOp    Output: opcode-decoded bytes (Z80 instruction fetches)
 * @param destData  Output: data-decoded bytes (Z80 data reads). Can be same as src for in-place.
 * @param baseAddr  Base address of this region in Z80 address space
 * @param length    Number of bytes to decode
 */
function kabukiDecode(
  src: Uint8Array, destOp: Uint8Array, destData: Uint8Array,
  baseAddr: number, length: number,
  swap_key1: number, swap_key2: number, addr_key: number, xor_key: number,
): void {
  for (let a = 0; a < length; a++) {
    // Decode opcodes
    let select = (a + baseAddr + addr_key) & 0xffff;
    destOp[a] = bytedecode(src[a]!, swap_key1, swap_key2, xor_key, select);

    // Decode data
    select = (((a + baseAddr) ^ 0x1fc0) + addr_key + 1) & 0xffff;
    destData[a] = bytedecode(src[a]!, swap_key1, swap_key2, xor_key, select);
  }
}

/** CPS1 QSound Kabuki keys per game */
export interface KabukiKeys {
  swap_key1: number;
  swap_key2: number;
  addr_key: number;
  xor_key: number;
}

const DINO_KEYS:     KabukiKeys = { swap_key1: 0x76543210, swap_key2: 0x24601357, addr_key: 0x4343, xor_key: 0x43 };
const PUNISHER_KEYS: KabukiKeys = { swap_key1: 0x67452103, swap_key2: 0x75316024, addr_key: 0x2222, xor_key: 0x22 };
const WOF_KEYS:      KabukiKeys = { swap_key1: 0x01234567, swap_key2: 0x54163072, addr_key: 0x5151, xor_key: 0x51 };
const SLAMMAST_KEYS: KabukiKeys = { swap_key1: 0x54321076, swap_key2: 0x65432107, addr_key: 0x3131, xor_key: 0x19 };

export const KABUKI_KEYS: Record<string, KabukiKeys> = {
  // Parent sets
  dino: DINO_KEYS,
  punisher: PUNISHER_KEYS,
  wof: WOF_KEYS,
  slammast: SLAMMAST_KEYS,
  mbombrd: SLAMMAST_KEYS,
  // Clones (same keys as parent)
  mbomberj: SLAMMAST_KEYS,
  wofch: WOF_KEYS,
};

/**
 * Decode a CPS1 QSound Z80 ROM using Kabuki encryption.
 *
 * CPS1 QSound only encrypts the first 32KB (0x0000-0x7FFF).
 * Returns the opcode-decoded ROM. The input `audioRom` is modified in-place
 * to contain data-decoded bytes.
 *
 * @param audioRom  The Z80 audio ROM (modified in-place for data decoding)
 * @param gameName  Game name (must match a key in KABUKI_KEYS)
 * @returns Opcode-decoded ROM (same size as audioRom), or null if no keys found
 */
export function decodeKabuki(audioRom: Uint8Array, gameName: string): Uint8Array | null {
  const keys = KABUKI_KEYS[gameName];
  if (!keys) return null;

  const opcodeRom = new Uint8Array(audioRom.length);
  // Copy the whole ROM first (banked area is not encrypted)
  opcodeRom.set(audioRom);

  // Only decrypt the first 32KB
  kabukiDecode(
    audioRom, opcodeRom, audioRom,
    0x0000, 0x8000,
    keys.swap_key1, keys.swap_key2, keys.addr_key, keys.xor_key,
  );

  return opcodeRom;
}
