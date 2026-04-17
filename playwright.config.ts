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
      testIgnore: ['**/_helpers/**'],
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
  ],
});
