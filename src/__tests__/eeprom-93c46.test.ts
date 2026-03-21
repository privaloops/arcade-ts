import { describe, it, expect } from 'vitest';
import { EEPROM93C46 } from '../memory/eeprom-93c46';

// Helper: send a clock pulse with DI bit
function clockIn(eeprom: EEPROM93C46, di: number): void {
  // CS high, CLK low, set DI
  eeprom.write(0x80 | (di & 1)); // CS=1, CLK=0, DI=di
  // CLK rising edge
  eeprom.write(0xC0 | (di & 1)); // CS=1, CLK=1, DI=di
}

// Helper: send a sequence of bits (MSB first)
function sendBits(eeprom: EEPROM93C46, value: number, count: number): void {
  for (let i = count - 1; i >= 0; i--) {
    clockIn(eeprom, (value >> i) & 1);
  }
}

// Helper: deassert CS to reset state
function deassertCS(eeprom: EEPROM93C46): void {
  eeprom.write(0x00); // CS=0, CLK=0
}

// Helper: assert CS
function assertCS(eeprom: EEPROM93C46): void {
  eeprom.write(0x80); // CS=1, CLK=0
}

// Helper: send EWEN command (start bit + 00_110000)
function sendEWEN(eeprom: EEPROM93C46): void {
  assertCS(eeprom);
  clockIn(eeprom, 1);            // start bit
  sendBits(eeprom, 0b00, 2);     // opcode 00
  sendBits(eeprom, 0b110000, 6); // addr 11xxxx = EWEN
  deassertCS(eeprom);
}

// Helper: write a 16-bit word at address
function writeWord(eeprom: EEPROM93C46, addr: number, data: number): void {
  assertCS(eeprom);
  clockIn(eeprom, 1);            // start bit
  sendBits(eeprom, 0b01, 2);     // opcode 01 = WRITE
  sendBits(eeprom, addr, 6);     // 6-bit address
  sendBits(eeprom, data, 16);    // 16-bit data
  deassertCS(eeprom);
}

// Helper: read a 16-bit word from address
function readWord(eeprom: EEPROM93C46, addr: number): number {
  assertCS(eeprom);
  clockIn(eeprom, 1);            // start bit
  sendBits(eeprom, 0b10, 2);     // opcode 10 = READ
  sendBits(eeprom, addr, 6);     // 6-bit address
  // After command: DO=0 (dummy). Each clock outputs next data bit (15..0).

  let data = 0;
  for (let i = 0; i < 16; i++) {
    clockIn(eeprom, 0);          // clock: DO becomes next data bit
    data = (data << 1) | eeprom.read();
  }
  deassertCS(eeprom);
  return data;
}

describe('EEPROM 93C46', () => {
  it('reads 0xFFFF from unprogrammed EEPROM', () => {
    const eeprom = new EEPROM93C46();
    const val = readWord(eeprom, 0);
    expect(val).toBe(0xFFFF);
  });

  it('DO pin defaults to 1 (ready)', () => {
    const eeprom = new EEPROM93C46();
    expect(eeprom.read()).toBe(1);
  });

  it('write is ignored when write-disabled', () => {
    const eeprom = new EEPROM93C46();
    // Write without EWEN — should be ignored
    writeWord(eeprom, 0, 0x1234);
    const val = readWord(eeprom, 0);
    expect(val).toBe(0xFFFF); // unchanged
  });

  it('EWEN + WRITE + READ round-trip', () => {
    const eeprom = new EEPROM93C46();
    sendEWEN(eeprom);
    writeWord(eeprom, 5, 0xABCD);
    const val = readWord(eeprom, 5);
    expect(val).toBe(0xABCD);
  });

  it('writes to multiple addresses', () => {
    const eeprom = new EEPROM93C46();
    sendEWEN(eeprom);

    writeWord(eeprom, 0, 0x1111);
    writeWord(eeprom, 1, 0x2222);
    writeWord(eeprom, 63, 0xFFEE);

    expect(readWord(eeprom, 0)).toBe(0x1111);
    expect(readWord(eeprom, 1)).toBe(0x2222);
    expect(readWord(eeprom, 63)).toBe(0xFFEE);
  });

  it('ERASE sets address to 0xFFFF', () => {
    const eeprom = new EEPROM93C46();
    sendEWEN(eeprom);

    writeWord(eeprom, 10, 0x5678);
    expect(readWord(eeprom, 10)).toBe(0x5678);

    // ERASE: start + 11 + addr
    assertCS(eeprom);
    clockIn(eeprom, 1);
    sendBits(eeprom, 0b11, 2);
    sendBits(eeprom, 10, 6);
    deassertCS(eeprom);

    expect(readWord(eeprom, 10)).toBe(0xFFFF);
  });

  it('EWDS disables writes', () => {
    const eeprom = new EEPROM93C46();
    sendEWEN(eeprom);
    writeWord(eeprom, 0, 0x1234);
    expect(readWord(eeprom, 0)).toBe(0x1234);

    // EWDS: start + 00 + 00xxxx
    assertCS(eeprom);
    clockIn(eeprom, 1);
    sendBits(eeprom, 0b00, 2);
    sendBits(eeprom, 0b000000, 6);
    deassertCS(eeprom);

    // Write should now be ignored
    writeWord(eeprom, 0, 0x5678);
    expect(readWord(eeprom, 0)).toBe(0x1234); // unchanged
  });

  it('CS falling edge resets state machine', () => {
    const eeprom = new EEPROM93C46();
    assertCS(eeprom);
    clockIn(eeprom, 1); // start bit
    clockIn(eeprom, 1); // partial command
    deassertCS(eeprom);  // reset mid-command
    expect(eeprom.read()).toBe(1); // back to ready
  });
});
