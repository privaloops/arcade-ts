import { describe, it, expect, vi } from "vitest";
import { sendFileWithReconnect, type ResumableSender } from "./reconnect";
import { TransferError } from "./peer-send";

/** All tests override sleep so backoff delays don't actually wait. */
const noSleep = async (_: number): Promise<void> => {};

/**
 * Fake ResumableSender that simulates chunked streaming. Each instance
 * can be told to fail after `failAtByte` bytes have been reported; the
 * factory below returns a fresh instance per attempt so the wrapper's
 * "close + rebuild on retry" contract is observable.
 */
class FakeSender implements ResumableSender {
  static readonly chunkSize = 100;

  bytesDelivered = 0;
  failAtByte = -1;
  startByteSeen = 0;
  connected = false;
  closed = false;

  async connect(): Promise<void> {
    this.connected = true;
  }

  async sendFile(
    _name: string,
    data: ArrayBuffer,
    options: { startByte?: number; onProgress?: (sent: number, total: number) => void }
  ): Promise<void> {
    this.startByteSeen = options.startByte ?? 0;
    const total = data.byteLength;
    let cursor = this.startByteSeen;
    while (cursor < total) {
      const next = Math.min(cursor + FakeSender.chunkSize, total);
      if (this.failAtByte >= 0 && next > this.failAtByte) {
        cursor = this.failAtByte;
        this.bytesDelivered = cursor;
        options.onProgress?.(cursor, total);
        throw new TransferError("simulated drop", "chunk");
      }
      cursor = next;
      this.bytesDelivered = cursor;
      options.onProgress?.(cursor, total);
    }
  }

  close(): void {
    this.closed = true;
  }
}

function makeFactory(configure: (sender: FakeSender, attempt: number) => void) {
  const instances: FakeSender[] = [];
  return {
    instances,
    factory: () => {
      const s = new FakeSender();
      configure(s, instances.length);
      instances.push(s);
      return s;
    },
  };
}

function data(size: number): ArrayBuffer {
  const bytes = new Uint8Array(size);
  for (let i = 0; i < size; i++) bytes[i] = i & 0xff;
  return bytes.buffer;
}

describe("sendFileWithReconnect", () => {
  it("completes normally when the first sender succeeds (no reconnect)", async () => {
    const { factory, instances } = makeFactory(() => {});
    await sendFileWithReconnect(factory, "ok.zip", data(1000), { sleep: noSleep });
    expect(instances).toHaveLength(1);
    expect(instances[0]!.bytesDelivered).toBe(1000);
    expect(instances[0]!.closed).toBe(false);
  });

  it("on drop at byte 500 of 1000 the wrapper builds a second sender and resumes from byte 500", async () => {
    const { factory, instances } = makeFactory((sender, attempt) => {
      if (attempt === 0) sender.failAtByte = 500;
    });
    await sendFileWithReconnect(factory, "drop.zip", data(1000), { sleep: noSleep });

    expect(instances.length).toBeGreaterThanOrEqual(2);
    // First attempt delivered the first 500 bytes then raised.
    expect(instances[0]!.bytesDelivered).toBe(500);
    expect(instances[0]!.closed).toBe(true);
    // Second attempt picked up at 500 and finished.
    expect(instances[1]!.startByteSeen).toBe(500);
    expect(instances[1]!.bytesDelivered).toBe(1000);
  });

  it("re-throws TransferError after a second consecutive failure (maxRetries=1)", async () => {
    const { factory, instances } = makeFactory((sender) => {
      sender.failAtByte = 500;
    });

    await expect(
      sendFileWithReconnect(factory, "bad.zip", data(1000), { maxRetries: 1, sleep: noSleep })
    ).rejects.toBeInstanceOf(TransferError);
    expect(instances).toHaveLength(2);
    expect(instances[0]!.closed).toBe(true);
    expect(instances[1]!.closed).toBe(true);
  });

  it("default maxRetries=2 allows three total attempts for a persistently flaky channel", async () => {
    const { factory, instances } = makeFactory((sender, attempt) => {
      // Fail at 500 on attempts 0 + 1; succeed on attempt 2.
      if (attempt < 2) sender.failAtByte = 500;
    });
    await sendFileWithReconnect(factory, "flaky.zip", data(1000), { sleep: noSleep });
    expect(instances).toHaveLength(3);
    expect(instances[2]!.startByteSeen).toBe(500);
    expect(instances[2]!.bytesDelivered).toBe(1000);
  });

  it("does NOT retry when the first attempt delivered zero bytes", async () => {
    const { factory, instances } = makeFactory((sender, attempt) => {
      if (attempt === 0) {
        sender.connect = async () => {
          throw new TransferError("no peer", "connect");
        };
      }
    });

    await expect(
      sendFileWithReconnect(factory, "nope.zip", data(1000), { sleep: noSleep })
    ).rejects.toBeInstanceOf(TransferError);
    // Only one sender spun up — since no progress was made, the
    // wrapper assumes the peer isn't available at all and gives up
    // rather than thrashing.
    expect(instances).toHaveLength(1);
  });

  it("respects maxRetries=0 (fail-fast mode)", async () => {
    const { factory, instances } = makeFactory((sender) => {
      sender.failAtByte = 500;
    });
    await expect(
      sendFileWithReconnect(factory, "no-retry.zip", data(1000), { maxRetries: 0, sleep: noSleep })
    ).rejects.toBeInstanceOf(TransferError);
    expect(instances).toHaveLength(1);
  });

  it("applies exponential backoff between retries", async () => {
    const { factory } = makeFactory((sender, attempt) => {
      if (attempt < 2) sender.failAtByte = 500;
    });
    const waits: number[] = [];
    const sleep = async (ms: number): Promise<void> => {
      waits.push(ms);
    };
    await sendFileWithReconnect(factory, "backoff.zip", data(1000), {
      sleep,
      baseBackoffMs: 100,
    });
    // Two retries → two sleeps at 100ms and 200ms.
    expect(waits).toEqual([100, 200]);
  });

  it("forwards progress events from the currently-active sender", async () => {
    const { factory } = makeFactory((sender, attempt) => {
      if (attempt === 0) sender.failAtByte = 400;
    });
    const progress: Array<[number, number]> = [];
    await sendFileWithReconnect(factory, "p.zip", data(800), {
      sleep: noSleep,
      onProgress: (sent, total) => progress.push([sent, total]),
    });

    // The monotonic max of sent should rise to 800.
    expect(progress[progress.length - 1]![0]).toBe(800);
    // Progress should never go backwards from the consumer's perspective.
    let prev = -1;
    for (const [sent] of progress) {
      expect(sent).toBeGreaterThanOrEqual(prev);
      prev = sent;
    }
  });
});
