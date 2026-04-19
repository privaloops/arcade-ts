import { test, expect } from "@playwright/test";
import { installGamepadMock } from "./_helpers/gamepad";
import { loadFixtureCps1Rom, resetAndSeedRomDB } from "./_helpers/rom-db";

async function holdButton(page: import("@playwright/test").Page, idx: number, ms: number): Promise<void> {
  await page.evaluate(
    async ([button, duration]) => {
      const hold = (window as unknown as { __holdButton: (n: number, d: number) => Promise<void> }).__holdButton;
      await hold(button as number, duration as number);
      await new Promise((r) => setTimeout(r, 60));
    },
    [idx, ms]
  );
}

async function readEngineFrames(page: import("@playwright/test").Page): Promise<number> {
  return page.evaluate(() =>
    parseInt(
      (document.querySelector('[data-testid="playing-screen"]') as HTMLElement | null)
        ?.dataset.engineFrames ?? "0",
      10,
    )
  );
}

async function waitForSnapshotBytes(
  page: import("@playwright/test").Page,
  key: string,
  timeoutMs: number,
): Promise<number> {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    const bytes = await page.evaluate((k) =>
      new Promise<number>((resolve, reject) => {
        const req = indexedDB.open("sprixe-arcade");
        req.onsuccess = () => {
          const db = req.result;
          const tx = db.transaction("savestates", "readonly");
          const store = tx.objectStore("savestates");
          const getReq = store.get(k);
          getReq.onsuccess = () => {
            const rec = getReq.result as { data?: ArrayBuffer } | undefined;
            resolve(rec?.data?.byteLength ?? 0);
          };
          getReq.onerror = () => reject(getReq.error);
        };
        req.onerror = () => reject(req.error);
      }), key);
    if (bytes > 0) return bytes;
    await page.waitForTimeout(100);
  }
  return 0;
}

test.describe("Phase 2 — save-state round trip", () => {
  test.setTimeout(45_000);

  test("snapshot round-trip on real CPS-1 engine preserves engine frame count + size ≥ 200 KB", async ({ page }) => {
    await installGamepadMock(page);
    const fixture = loadFixtureCps1Rom();

    await page.goto("/");
    await resetAndSeedRomDB(page, [
      { id: fixture.id, system: "cps1", zipB64: fixture.zipB64 },
    ]);
    await page.reload();

    const playing = page.locator('[data-testid="playing-screen"]');
    const overlay = page.locator('[data-testid="pause-overlay"]');

    // Boot the game and let the engine settle.
    await holdButton(page, 0, 120);
    await expect(playing).toBeVisible({ timeout: 10_000 });
    await page.waitForTimeout(600);

    const framesAtSave = await readEngineFrames(page);
    expect(framesAtSave).toBeGreaterThan(0);

    // Save state: Coin hold → pause overlay → down → Save State row.
    await holdButton(page, 8, 1200);
    await expect(overlay).toBeVisible();
    await holdButton(page, 13, 120);
    await expect(overlay.locator(".af-pause-item.selected")).toHaveAttribute("data-action", "save-state");
    await holdButton(page, 0, 120);

    // Poll IDB until the save has been committed — captureState() is
    // async (it awaits the audio worker state) so the record lands a
    // few hundred ms after confirm.
    const snapshotBytes = await waitForSnapshotBytes(page, `${fixture.id}:0`, 5_000);
    expect(snapshotBytes).toBeGreaterThanOrEqual(200 * 1024);

    // Let the engine advance further — frame counter should move past
    // the snapshot point.
    await page.waitForTimeout(800);
    const framesAfterDrift = await readEngineFrames(page);
    expect(framesAfterDrift).toBeGreaterThan(framesAtSave);

    // Load state: coin-hold → overlay → down × 2 → Load State.
    await holdButton(page, 8, 1200);
    await expect(overlay).toBeVisible();
    await holdButton(page, 13, 120);
    await holdButton(page, 13, 120);
    await expect(overlay.locator(".af-pause-item.selected")).toHaveAttribute("data-action", "load-state");
    await holdButton(page, 0, 120);

    // After applyState() restores the saved frame count, the next rAF
    // tick updates data-engine-frames to that value (plus however many
    // frames the engine has run since then — still a modest delta).
    await page.waitForTimeout(200);
    const framesAfterLoad = await readEngineFrames(page);
    expect(framesAfterLoad).toBeGreaterThanOrEqual(framesAtSave);
    // The load must roll the counter back from `framesAfterDrift`, so
    // framesAfterLoad should be significantly smaller (allowing a few
    // frames of drift after applyState).
    expect(framesAfterLoad).toBeLessThan(framesAfterDrift);
  });
});
