/**
 * sendWithReconnect — wraps a PeerSend-like sender with a single
 * resume-on-drop retry (§3.8 + Phase 3.12 tests).
 *
 * Strategy:
 *   1. Call sender.connect() and sender.sendFile().
 *   2. Track the highest `sent` byte count reported via onProgress.
 *   3. If sendFile rejects AND we haven't retried yet AND the peer
 *      reported at least one chunk of progress, tear down the sender,
 *      build a fresh one via `senderFactory()`, and resume from the
 *      byte offset the previous attempt reached.
 *   4. Second failure (whether same reason or different) rethrows —
 *      the user gets a "Transfer stalled" toast via
 *      classifyTransferError.
 *
 * Phase 3.12 E2E is deliberately skipped (see the plan); a clean
 * "drop mid-transfer" scenario is hard to stage in Playwright without
 * flakiness, so the Vitest contract is the authoritative test.
 */

import { TransferError } from "./peer-send";

export interface ResumableSender {
  connect(): Promise<void>;
  sendFile(
    name: string,
    data: ArrayBuffer,
    options: {
      startByte?: number;
      onProgress?: (sent: number, total: number) => void;
    }
  ): Promise<void>;
  close(): void;
}

export interface SendWithReconnectOptions {
  onProgress?: (sent: number, total: number) => void;
  /** Max reconnect attempts after the first drop. Default 2 (so up to
   * 3 total attempts). */
  maxRetries?: number;
  /** Base delay for exponential backoff between retries (ms). The n-th
   * retry waits `baseBackoffMs * 2^(n-1)` so attempts land at 1s, 2s,
   * 4s by default. */
  baseBackoffMs?: number;
  /** Test hook to skip real timers. */
  sleep?: (ms: number) => Promise<void>;
}

const defaultSleep = (ms: number): Promise<void> =>
  new Promise((r) => setTimeout(r, ms));

export async function sendFileWithReconnect(
  senderFactory: () => ResumableSender,
  name: string,
  data: ArrayBuffer,
  options: SendWithReconnectOptions = {}
): Promise<void> {
  const maxRetries = options.maxRetries ?? 2;
  const baseBackoffMs = options.baseBackoffMs ?? 1000;
  const sleep = options.sleep ?? defaultSleep;
  let attempt = 0;
  let resumeFromByte = 0;
  let lastError: unknown = null;

  while (attempt <= maxRetries) {
    const sender = senderFactory();
    try {
      await sender.connect();
      await sender.sendFile(name, data, {
        startByte: resumeFromByte,
        onProgress: (sent, total) => {
          resumeFromByte = Math.max(resumeFromByte, sent);
          options.onProgress?.(sent, total);
        },
      });
      return;
    } catch (err) {
      lastError = err;
      try { sender.close(); } catch { /* ignore */ }
      if (attempt >= maxRetries) break;
      if (resumeFromByte === 0) {
        // Never saw a single chunk of progress — don't bother retrying;
        // the peer probably never connected.
        break;
      }
      attempt += 1;
      await sleep(baseBackoffMs * Math.pow(2, attempt - 1));
    }
  }

  throw lastError instanceof TransferError
    ? lastError
    : new TransferError(
        `Transfer failed after ${attempt + 1} attempt(s): ${describe(lastError)}`,
        "retry"
      );
}

function describe(err: unknown): string {
  if (err instanceof Error) return err.message;
  return String(err);
}
