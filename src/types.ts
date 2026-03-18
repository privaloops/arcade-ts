/**
 * Shared bus interfaces for CPU ↔ memory communication.
 */

/** M68000 bus interface (byte, word, long access) */
export interface BusInterface {
  read8(address: number): number;
  read16(address: number): number;
  read32(address: number): number;
  write8(address: number, value: number): void;
  write16(address: number, value: number): void;
  write32(address: number, value: number): void;
}

/** Z80 bus interface (byte access + I/O ports) */
export interface Z80BusInterface {
  read(address: number): number;
  write(address: number, value: number): void;
  ioRead(port: number): number;
  ioWrite(port: number, value: number): void;
}
