import { defineConfig, devices } from '@playwright/test';

export default defineConfig({
  timeout: 10_000,
  expect: { timeout: 2_000 },
  fullyParallel: false, // ROM loading is stateful
  retries: 0,
  reporter: 'list',
  use: {
    trace: 'on-first-retry',
  },
  webServer: [
    {
      command: 'npm -w @sprixe/edit run dev -- --port 5173',
      port: 5173,
      reuseExistingServer: true,
      timeout: 10_000,
    },
    {
      command: 'npm -w @sprixe/frontend run dev',
      port: 5174,
      reuseExistingServer: true,
      timeout: 10_000,
    },
  ],
  projects: [
    {
      name: 'chromium',
      testDir: './tests/e2e',
      testIgnore: ['**/arcade/**'],
      use: {
        ...devices['Desktop Chrome'],
        baseURL: 'http://localhost:5173',
        launchOptions: { args: ['--autoplay-policy=no-user-gesture-required'] },
      },
    },
    {
      name: 'firefox',
      testDir: './tests/e2e',
      testIgnore: ['**/arcade/**'],
      use: {
        ...devices['Desktop Firefox'],
        baseURL: 'http://localhost:5173',
      },
    },
    {
      name: 'arcade',
      testDir: './tests/e2e/arcade',
      testIgnore: ['**/_helpers/**', '**/p5-kiosk-simulation.spec.ts'],
      use: {
        ...devices['Desktop Chrome'],
        baseURL: 'http://localhost:5174',
        launchOptions: {
          args: [
            '--enable-features=SharedArrayBuffer',
            '--autoplay-policy=no-user-gesture-required',
          ],
        },
      },
    },
    // Phase 5 — reproduces the Chromium flags that the kiosk service
    // uses on the RPi 5 (cage --kiosk). Gate test p5-kiosk-simulation
    // here so regressions around COOP/COEP, SharedArrayBuffer, or the
    // kiosk-only CLI switches trip before we flash an image.
    {
      name: 'kiosk',
      testDir: './tests/e2e/arcade',
      testMatch: /p5-kiosk-simulation\.spec\.ts/,
      use: {
        ...devices['Desktop Chrome'],
        baseURL: 'http://localhost:5174',
        viewport: { width: 1920, height: 1080 },
        launchOptions: {
          args: [
            // `--kiosk` conflicts with Playwright's viewport control
            // (hangs navigation / hides DOM), keep the other kiosk
            // flags so the doctrinal check (COOP/COEP + SAB +
            // autoplay policy) still runs. A real RPi kiosk adds
            // `--kiosk` back on top of these via cage's launcher.
            '--noerrdialogs',
            '--disable-translate',
            '--enable-features=SharedArrayBuffer',
            '--autoplay-policy=no-user-gesture-required',
          ],
        },
      },
    },
  ],
});
