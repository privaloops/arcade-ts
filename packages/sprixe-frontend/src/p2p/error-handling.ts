/**
 * error-handling — classify a thrown error from the transfer pipeline
 * into a UI-ready { level, message } pair.
 *
 * Called on:
 * - RomPipeline.process() rejections (kiosk side — feed into Toast).
 * - PeerSend.sendFile() rejections (phone side — attach to the
 *   UploadTab entry via updateEntry({status: 'error'})).
 *
 * The four cases called out by §6 risk table are surfaced with
 * distinct messages so the user can act:
 *   - InvalidRomError        → "Not a valid ZIP archive"
 *   - UnsupportedSystemError → "Unknown ROM format"
 *   - QuotaExceededError     → "Storage full — delete some ROMs first"
 *   - TimeoutError           → "Transfer stalled — try again"
 * Anything else falls back to a generic "Transfer failed" message
 * so at least the user sees a toast instead of a silent failure.
 */

import { InvalidRomError, UnsupportedSystemError } from "../engine-bridge/errors";
import { TransferError } from "./peer-send";

export type ErrorLevel = "info" | "success" | "error";

export interface ClassifiedError {
  level: ErrorLevel;
  message: string;
  /** Original error for downstream logging. */
  cause: unknown;
}

/** Phase 3.12 / 3.11: a thin typed error for transfer timeouts. */
export class TransferTimeoutError extends Error {
  override readonly name = "TransferTimeoutError" as const;
  /** ms the transfer idled before timing out. */
  readonly idleMs: number;
  constructor(idleMs: number) {
    super(`Transfer stalled (no data for ${idleMs} ms)`);
    this.idleMs = idleMs;
    Object.setPrototypeOf(this, TransferTimeoutError.prototype);
  }
}

function isQuotaExceeded(err: unknown): boolean {
  if (!err) return false;
  if (err instanceof DOMException) return err.name === "QuotaExceededError";
  if (typeof err === "object" && err !== null && "name" in err) {
    return (err as { name?: unknown }).name === "QuotaExceededError";
  }
  return false;
}

export function classifyTransferError(err: unknown): ClassifiedError {
  if (err instanceof InvalidRomError) {
    return { level: "error", message: "Not a valid ZIP archive", cause: err };
  }
  if (err instanceof UnsupportedSystemError) {
    return { level: "error", message: "Unknown ROM format", cause: err };
  }
  if (err instanceof TransferTimeoutError) {
    return { level: "error", message: "Transfer stalled — try again", cause: err };
  }
  if (err instanceof TransferError) {
    return { level: "error", message: `Transfer failed: ${err.message}`, cause: err };
  }
  if (isQuotaExceeded(err)) {
    return { level: "error", message: "Storage full — delete some ROMs first", cause: err };
  }
  if (err instanceof Error) {
    return { level: "error", message: `Transfer failed: ${err.message}`, cause: err };
  }
  return { level: "error", message: "Transfer failed", cause: err };
}
