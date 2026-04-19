/**
 * Custom error types for ROM identification + loading failures.
 *
 * The frontend surfaces these to the UI (toast on transfer error, empty
 * state hint on unsupported format) so the text distinction matters —
 * don't collapse them into a single generic Error.
 */

export class InvalidRomError extends Error {
  override readonly name = "InvalidRomError" as const;
  override readonly cause?: unknown;
  constructor(message: string, cause?: unknown) {
    super(message);
    if (cause !== undefined) this.cause = cause;
    Object.setPrototypeOf(this, InvalidRomError.prototype);
  }
}

export class UnsupportedSystemError extends Error {
  override readonly name = "UnsupportedSystemError" as const;
  readonly fileNames: readonly string[];
  constructor(message: string, fileNames: readonly string[]) {
    super(message);
    this.fileNames = fileNames;
    Object.setPrototypeOf(this, UnsupportedSystemError.prototype);
  }
}

/**
 * Thrown by a runner factory when a required system BIOS is not
 * available in RomDB. The UI intercepts this before the playing screen
 * is mounted and shows a per-system "upload the BIOS" message.
 */
export class MissingBiosError extends Error {
  override readonly name = "MissingBiosError" as const;
  readonly system: "neogeo";
  readonly biosId: string;
  constructor(system: "neogeo", biosId: string) {
    super(`${system} BIOS not found in RomDB (expected id "${biosId}")`);
    this.system = system;
    this.biosId = biosId;
    Object.setPrototypeOf(this, MissingBiosError.prototype);
  }
}
