/**
 * CPS1 DIP Switch definitions.
 *
 * CPS1 has 3 DIP switch banks (DSWA, DSWB, DSWC), each 8 bits.
 * Active-LOW: 0 = ON, 1 = OFF. Default 0xFF = all OFF.
 *
 * Bus mapping:
 *   ioPorts[10] = DSWA (read at 0x80001A, high byte)
 *   ioPorts[12] = DSWB (read at 0x80001C, high byte)
 *   ioPorts[14] = DSWC (read at 0x80001E, high byte)
 */

export interface DipOption {
  label: string;
  value: number;  // masked value (already shifted)
}

export interface DipSwitch {
  name: string;
  bank: "A" | "B" | "C";
  mask: number;     // bitmask within the bank byte
  options: DipOption[];
  defaultValue: number;
}

export interface DipSwitchDef {
  switches: DipSwitch[];
}

// ── Common CPS1 DIP layout (Final Fight, SF2, most games) ────────────────

const COMMON_COINAGE: DipOption[] = [
  { label: "1 Coin / 1 Credit", value: 0 },
  { label: "1 Coin / 2 Credits", value: 1 },
  { label: "1 Coin / 3 Credits", value: 2 },
  { label: "1 Coin / 4 Credits", value: 3 },
  { label: "2 Coins / 1 Credit", value: 4 },
  { label: "3 Coins / 1 Credit", value: 5 },
  { label: "4 Coins / 1 Credit", value: 6 },
  { label: "Free Play", value: 7 },
];

const CPS1_DEFAULT: DipSwitchDef = {
  switches: [
    {
      name: "Coinage", bank: "A", mask: 0x07, defaultValue: 0,
      options: COMMON_COINAGE,
    },
    {
      name: "Coin Slots", bank: "A", mask: 0x08, defaultValue: 0x08,
      options: [
        { label: "1 Slot", value: 0x00 },
        { label: "Individual", value: 0x08 },
      ],
    },
    {
      name: "Difficulty", bank: "B", mask: 0x07, defaultValue: 0x04,
      options: [
        { label: "1 (Easiest)", value: 0x00 },
        { label: "2", value: 0x01 },
        { label: "3", value: 0x02 },
        { label: "4 (Normal)", value: 0x04 },
        { label: "5", value: 0x05 },
        { label: "6", value: 0x06 },
        { label: "7 (Hardest)", value: 0x07 },
      ],
    },
    {
      name: "Lives", bank: "B", mask: 0x18, defaultValue: 0x18,
      options: [
        { label: "1", value: 0x00 },
        { label: "2", value: 0x08 },
        { label: "3", value: 0x18 },
        { label: "4", value: 0x10 },
      ],
    },
    {
      name: "Free Play", bank: "C", mask: 0x04, defaultValue: 0x04,
      options: [
        { label: "On", value: 0x00 },
        { label: "Off", value: 0x04 },
      ],
    },
    {
      name: "Freeze", bank: "C", mask: 0x08, defaultValue: 0x08,
      options: [
        { label: "On", value: 0x00 },
        { label: "Off", value: 0x08 },
      ],
    },
    {
      name: "Flip Screen", bank: "C", mask: 0x10, defaultValue: 0x10,
      options: [
        { label: "On", value: 0x00 },
        { label: "Off", value: 0x10 },
      ],
    },
    {
      name: "Demo Sound", bank: "C", mask: 0x20, defaultValue: 0x20,
      options: [
        { label: "Off", value: 0x00 },
        { label: "On", value: 0x20 },
      ],
    },
    {
      name: "Continue", bank: "C", mask: 0x40, defaultValue: 0x40,
      options: [
        { label: "No", value: 0x00 },
        { label: "Yes", value: 0x40 },
      ],
    },
    {
      name: "Service Mode", bank: "C", mask: 0x80, defaultValue: 0x80,
      options: [
        { label: "On", value: 0x00 },
        { label: "Off", value: 0x80 },
      ],
    },
  ],
};

// ── QSound games (Dino, Punisher, etc.) — different layout ───────────────

const QSOUND_DIP: DipSwitchDef = {
  switches: [
    {
      name: "Coinage", bank: "A", mask: 0x07, defaultValue: 0,
      options: COMMON_COINAGE,
    },
    {
      name: "Difficulty", bank: "B", mask: 0x07, defaultValue: 0x04,
      options: [
        { label: "1 (Easiest)", value: 0x00 },
        { label: "2", value: 0x01 },
        { label: "3", value: 0x02 },
        { label: "4 (Normal)", value: 0x04 },
        { label: "5", value: 0x05 },
        { label: "6", value: 0x06 },
        { label: "7 (Hardest)", value: 0x07 },
      ],
    },
    {
      name: "Lives (Dino/Punisher)", bank: "B", mask: 0x18, defaultValue: 0x18,
      options: [
        { label: "1", value: 0x00 },
        { label: "2", value: 0x08 },
        { label: "3", value: 0x18 },
        { label: "4", value: 0x10 },
      ],
    },
    {
      name: "Free Play", bank: "C", mask: 0x04, defaultValue: 0x04,
      options: [
        { label: "On", value: 0x00 },
        { label: "Off", value: 0x04 },
      ],
    },
    {
      name: "Freeze", bank: "C", mask: 0x08, defaultValue: 0x08,
      options: [
        { label: "On", value: 0x00 },
        { label: "Off", value: 0x08 },
      ],
    },
    {
      name: "Flip Screen", bank: "C", mask: 0x10, defaultValue: 0x10,
      options: [
        { label: "On", value: 0x00 },
        { label: "Off", value: 0x10 },
      ],
    },
    {
      name: "Demo Sound", bank: "C", mask: 0x20, defaultValue: 0x20,
      options: [
        { label: "Off", value: 0x00 },
        { label: "On", value: 0x20 },
      ],
    },
    {
      name: "Continue", bank: "C", mask: 0x40, defaultValue: 0x40,
      options: [
        { label: "No", value: 0x00 },
        { label: "Yes", value: 0x40 },
      ],
    },
    {
      name: "Service Mode", bank: "C", mask: 0x80, defaultValue: 0x80,
      options: [
        { label: "On", value: 0x00 },
        { label: "Off", value: 0x80 },
      ],
    },
  ],
};

// ── Per-game lookup ──────────────────────────────────────────────────────

const QSOUND_GAMES = new Set(["dino", "punisher", "slammast", "wof"]);

export function getDipDef(gameName: string): DipSwitchDef {
  if (QSOUND_GAMES.has(gameName)) return QSOUND_DIP;
  return CPS1_DEFAULT;
}

/** Map bank letter to ioPorts index */
export function bankToIndex(bank: "A" | "B" | "C"): number {
  switch (bank) {
    case "A": return 10; // 0x80001A high byte
    case "B": return 12; // 0x80001C high byte
    case "C": return 14; // 0x80001E high byte
  }
}
