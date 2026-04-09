/**
 * uPD4990A RTC chip emulation for Neo-Geo.
 *
 * Minimal implementation sufficient for the BIOS calendar test.
 * Produces a TP (time pulse) square wave at a configurable frequency.
 * The BIOS sets the interval to 1 second via command 0x08, then
 * measures ~59 VBlanks between TP rising edges (expects 57-64).
 *
 * Based on FBNeo neo_upd4990a.cpp (BSD-3-Clause).
 */

export class PD4990A {
  // TP output
  private tpCount = 0;     // accumulated ticks for TP
  private interval: number; // ticks per TP full cycle
  private tp = false;       // current TP output

  // DO output (data out)
  private doOut = false;

  // Seconds counter
  private secCount = 0;
  private oneSecond: number;

  // Command shift register
  private command = 0;
  private commandBits = 0;

  // Time shift register (48 bits as two 32-bit values)
  private reg0 = 0; // low 32 bits
  private reg1 = 0; // high 16 bits

  // Mode: 0=hold, 1=shift
  private mode = 0;

  // Edge detection for CLK and STB
  private prevClk = 0;
  private prevStb = 0;

  // Cycle tracking
  private lastTicks = 0;
  private getTicks: () => number;

  constructor(cpuClock: number, getTicksFn: () => number) {
    this.oneSecond = cpuClock;
    this.interval = Math.floor(cpuClock / 64); // default 64Hz
    this.getTicks = getTicksFn;
    this.lastTicks = 0;

    // Initialize time from current date
    const now = new Date();
    this.loadTime(now);
  }

  /** Update TP and second counters based on elapsed CPU cycles */
  private update(): void {
    const currentTicks = this.getTicks();
    let elapsed = (currentTicks - this.lastTicks) >>> 0;
    // Don't estimate cycles — only real cycles from addCycles count.
    // The BIOS tight loop will see the same TP value within one 68K step,
    // but the transition will be visible when crossing step boundaries.
    this.lastTicks = currentTicks;

    // TP counter
    this.tpCount += elapsed;
    if (this.tpCount >= this.interval) {
      this.tpCount %= this.interval;
    }
    this.tp = this.tpCount >= (this.interval >>> 1); // 50% duty cycle

    // Seconds counter (for DO in hold mode)
    this.secCount += elapsed;
    if (this.secCount >= this.oneSecond) {
      this.secCount %= this.oneSecond;
      // TODO: increment time
    }
  }

  /** Read 2 bits: bit 1 = DO, bit 0 = TP */
  read(): number {
    this.update();

    let dataOut: number;
    if (this.mode === 0) {
      // Hold mode: DO = 1Hz pulse (high for half-second)
      dataOut = this.secCount >= (this.oneSecond >>> 1) ? 1 : 0;
    } else {
      // Shift mode: DO = LSB of shift register
      dataOut = this.reg0 & 1;
    }

    return ((dataOut & 1) << 1) | (this.tp ? 1 : 0);
  }

  /** Write control signals: clk, stb, dataIn (each 0 or 1) */
  write(clk: number, stb: number, dataIn: number): void {
    // CLK rising edge (while STB=0): shift data into command register
    if (clk && !this.prevClk && !stb) {
      this.command = ((this.command >> 1) | ((dataIn & 1) << 3)) & 0x0F;
      this.commandBits++;

      // In shift mode, also shift the data register
      if (this.mode === 1) {
        const bit = dataIn & 1;
        // Shift 48-bit register right, insert bit at MSB
        this.reg0 = ((this.reg0 >>> 1) | ((this.reg1 & 1) << 31)) >>> 0;
        this.reg1 = ((this.reg1 >>> 1) | (bit << 15)) & 0xFFFF;
      }
    }

    // STB rising edge: execute command
    if (stb && !this.prevStb) {
      this.executeCommand(this.command);
      this.commandBits = 0;
    }

    this.prevClk = clk;
    this.prevStb = stb;
  }

  private executeCommand(cmd: number): void {
    switch (cmd) {
      case 0x00: // Register hold
        this.mode = 0;
        break;
      case 0x01: // Register shift
        this.mode = 1;
        break;
      case 0x02: // Time set (load time from register)
        this.mode = 0;
        break;
      case 0x03: // Time read (load register from time)
        this.loadTimeToRegister();
        this.mode = 0;
        break;
      case 0x04: this.interval = Math.floor(this.oneSecond / 64); break;
      case 0x05: this.interval = Math.floor(this.oneSecond / 256); break;
      case 0x06: this.interval = Math.floor(this.oneSecond / 2048); break;
      case 0x07: this.interval = Math.floor(this.oneSecond / 4096); break;
      case 0x08: this.interval = this.oneSecond * 1; break;  // 1 second
      case 0x09: this.interval = this.oneSecond * 10; break;
      case 0x0A: this.interval = this.oneSecond * 30; break;
      case 0x0B: this.interval = this.oneSecond * 60; break;
      case 0x0C: // Interval reset: TP=1 until interval expires
        this.tp = true;
        this.tpCount = 0;
        break;
      case 0x0D: // Interval start
        break;
      case 0x0E: // Interval stop
        break;
    }
  }

  /** Reset tick counter for new frame */
  newFrame(ticks: number): void {
    this.lastTicks = ticks;
  }

  /** Load current time into the 48-bit shift register (BCD format) */
  private loadTimeToRegister(): void {
    const now = new Date();
    const sec = this.toBCD(now.getSeconds());
    const min = this.toBCD(now.getMinutes());
    const hr = this.toBCD(now.getHours());
    const day = this.toBCD(now.getDate());
    const wday = now.getDay(); // 0=Sunday
    const mon = now.getMonth() + 1; // 1-12
    const yr = this.toBCD(now.getFullYear() % 100);

    // 48 bits: sec(8) | min(8) | hr(8) | day(8) | wday(4) | mon(4) | yr(8)
    this.reg0 = (sec | (min << 8) | (hr << 16) | (day << 24)) >>> 0;
    this.reg1 = (wday | (mon << 4) | (yr << 8)) & 0xFFFF;
  }

  private loadTime(_date: Date): void {
    this.loadTimeToRegister();
  }

  private toBCD(val: number): number {
    return ((Math.floor(val / 10) & 0xF) << 4) | (val % 10);
  }
}
