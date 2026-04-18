import { test, expect } from "@playwright/test";
import { resolve } from "node:path";
import { writeFile, mkdir } from "node:fs/promises";
import { tmpdir } from "node:os";

/**
 * p3-phone-upload — upload UI queue semantics (§2.9 + Phase 3.6 tests).
 *
 * Writes a handful of trivial .zip placeholders into a tmp dir so
 * Playwright's setInputFiles has concrete files to pass to the UI.
 * We don't exercise the full PeerJS transfer here — this spec is
 * just about the UploadTab's queue ordering + row removal.
 *
 * Cross-context P2P transfer (the full send-and-see flow) is already
 * covered by p3-rom-transfer-p2p.
 */

const ROOM_ID = "sprixe-upload-e2e";

async function fixtureFiles(): Promise<string[]> {
  const dir = resolve(tmpdir(), `sprixe-upload-${Date.now()}`);
  await mkdir(dir, { recursive: true });
  const names = ["alpha.zip", "beta.zip", "gamma.zip"];
  const paths: string[] = [];
  for (const name of names) {
    const p = resolve(dir, name);
    await writeFile(p, new Uint8Array([0x50, 0x4b, 0x03, 0x04]));
    paths.push(p);
  }
  return paths;
}

test.describe("Phase 3 — phone upload queue", () => {
  test("setInputFiles 3 ROMs → 3 queue rows; removing the 2nd leaves 1st + 3rd", async ({ browser }) => {
    const context = await browser.newContext();
    await context.addInitScript(() => {
      // Prevent the PhonePage from hitting PeerJS Cloud — replace Peer
      // with a stub whose connect resolves but never emits 'open' on
      // the DataConnection (upload worker pauses harmlessly).
      (window as unknown as { __PeerMock?: unknown }).__PeerMock = class {
        id = "mock";
        constructor() {
          queueMicrotask(() => (this as unknown as { handlers: Map<string, Set<() => void>> }).handlers);
        }
        on() { /* no-op */ }
        connect() {
          return {
            bufferedAmount: 0,
            bufferedAmountLowThreshold: 0,
            on() { /* never fires 'open' */ },
            send() { /* no-op */ },
            close() { /* no-op */ },
          };
        }
        destroy() { /* no-op */ }
      };
    });

    const page = await context.newPage();
    await page.goto(`/send/${ROOM_ID}`);
    await expect(page.locator('[data-testid="phone-page"]')).toBeVisible();

    const files = await fixtureFiles();
    await page.locator('[data-testid="upload-file-input"]').setInputFiles(files);

    const rows = page.locator(".af-upload-entry");
    await expect(rows).toHaveCount(3);
    const names = await rows.locator(".af-upload-entry-name").allTextContents();
    expect(names).toEqual(["alpha.zip", "beta.zip", "gamma.zip"]);

    // Remove the middle entry (beta.zip). It must be in 'queued' state
    // — our mock never opens the data channel, so the upload worker is
    // parked at ensureConnected() and the entry stays queued and
    // removable.
    const betaRow = rows.nth(1);
    await betaRow.locator('[data-testid="upload-entry-remove"]').click();

    await expect(rows).toHaveCount(2);
    const remaining = await rows.locator(".af-upload-entry-name").allTextContents();
    expect(remaining).toEqual(["alpha.zip", "gamma.zip"]);

    await context.close();
  });
});
