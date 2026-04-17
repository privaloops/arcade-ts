/**
 * EEPROM 93C46 (8-bit mode, 128 bytes / 64 words)
 *
 * Serial protocol: CS, CLK, DI → DO
 * Used by CPS1 QSound games for operator settings.
 */

const EEPROM_SIZE = 128; // bytes

export class EEPROM93C46 {
  private data: Uint8Array;
  private cs = false;
  private clk = false;
  private di = 0;
  private do_ = 1; // data out (active high when ready)

  // Shift register for serial protocol
  private bits = 0;        // accumulated bits
  private bitCount = 0;    // how many bits received
  private writeEnabled = false;

  // State machine
  private state: 'idle' | 'command' | 'read' | 'write' = 'idle';
  private address = 0;
  private readData = 0;
  private readBitPos = 0;
  private writeData = 0;
  private writeBitCount = 0;

  constructor() {
    this.data = new Uint8Array(EEPROM_SIZE);
    this.data.fill(0xFF); // unprogrammed EEPROM reads as 0xFF
  }

  /** Read the DO (data out) pin */
  read(): number {
    return this.do_;
  }

  /** Write control signals: bit 0 = DI, bit 6 = CLK, bit 7 = CS */
  write(value: number): void {
    const newCs = (value >> 7) & 1;
    const newClk = (value >> 6) & 1;
    const newDi = value & 1;

    // CS falling edge → reset
    if (this.cs && !newCs) {
      this.state = 'idle';
      this.bitCount = 0;
      this.bits = 0;
      this.do_ = 1; // ready
    }

    // CLK rising edge while CS is high → shift in data
    if (newCs && !this.clk && newClk) {
      this._clockIn(newDi);
    }

    this.cs = !!newCs;
    this.clk = !!newClk;
    this.di = newDi;
  }

  private _clockIn(di: number): void {
    switch (this.state) {
      case 'idle':
        // Wait for start bit (1)
        if (di === 1) {
          this.state = 'command';
          this.bits = 0;
          this.bitCount = 0;
        }
        break;

      case 'command':
        this.bits = (this.bits << 1) | di;
        this.bitCount++;

        // 2 opcode bits + 6 address bits = 8 bits total
        if (this.bitCount === 8) {
          const opcode = (this.bits >> 6) & 3;
          const addr = this.bits & 0x3F;
          this._handleCommand(opcode, addr);
        }
        break;

      case 'read':
        // Clock out data bits (MSB first, 16 bits)
        this.do_ = (this.readData >> (15 - this.readBitPos)) & 1;
        this.readBitPos++;
        if (this.readBitPos >= 16) {
          // All bits clocked out. Stay in read state until CS deassert
          // so the host can still sample the last bit. DO stays as bit 0.
          this.state = 'idle';
          this.bitCount = 0;
          // Don't overwrite do_ — the host needs to read bit 0
        }
        break;

      case 'write':
        this.writeData = (this.writeData << 1) | di;
        this.writeBitCount++;
        if (this.writeBitCount >= 16) {
          if (this.writeEnabled) {
            const byteAddr = this.address * 2;
            this.data[byteAddr] = (this.writeData >> 8) & 0xFF;
            this.data[byteAddr + 1] = this.writeData & 0xFF;
          }
          this.state = 'idle';
          this.bitCount = 0;
          this.do_ = 1; // write complete
        }
        break;
    }
  }

  private _handleCommand(opcode: number, addr: number): void {
    switch (opcode) {
      case 0b10: // READ
        this.address = addr;
        this.state = 'read';
        const byteAddr = addr * 2;
        this.readData = ((this.data[byteAddr]! << 8) | this.data[byteAddr + 1]!) & 0xFFFF;
        this.readBitPos = 0;
        this.do_ = 0; // dummy bit before data
        break;

      case 0b01: // WRITE
        this.address = addr;
        this.state = 'write';
        this.writeData = 0;
        this.writeBitCount = 0;
        break;

      case 0b11: // ERASE
        if (this.writeEnabled) {
          const ba = addr * 2;
          this.data[ba] = 0xFF;
          this.data[ba + 1] = 0xFF;
        }
        this.state = 'idle';
        this.bitCount = 0;
        this.do_ = 1;
        break;

      case 0b00: // Special
        if ((addr >> 4) === 3) {
          // EWEN (enable writes)
          this.writeEnabled = true;
        } else if ((addr >> 4) === 0) {
          // EWDS (disable writes)
          this.writeEnabled = false;
        }
        this.state = 'idle';
        this.bitCount = 0;
        this.do_ = 1;
        break;
    }
  }
}
