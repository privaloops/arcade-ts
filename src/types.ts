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

/** Renderer interface — implemented by Canvas 2D, WebGL2, and DOM renderers */
export interface RendererInterface {
  render(framebuffer: Uint8Array): void;
  drawText(text: string, x: number, y: number): void;
  /** Resize for a different native resolution (e.g., CPS1 384×224 → Neo-Geo 320×224) */
  resize?(width: number, height: number): void;
}

/** Z80 bus interface (byte access + I/O ports) */
export interface Z80BusInterface {
  read(address: number): number;
  write(address: number, value: number): void;
  ioRead(port: number): number;
  ioWrite(port: number, value: number): void;
  /** Read opcode byte (for Kabuki-encrypted ROMs). Defaults to read() if not implemented. */
  readOpcode?(address: number): number;
}
