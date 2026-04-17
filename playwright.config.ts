import { defineConfig, devices } from '@playwright/test';

export default defineConfig({
  testDir: './tests/e2e',
  timeout: 10_000,
  expect: { timeout: 2_000 },
  fullyParallel: false, // ROM loading is stateful
  retries: 0,
  reporter: 'list',
  use: {
    baseURL: 'http://localhost:5173',
    trace: 'on-first-retry',
  },
  webServer: {
    command: 'npm -w @sprixe/edit run dev -- --port 5173',
    port: 5173,
    reuseExistingServer: true,
    timeout: 10_000,
  },
  projects: [
    { name: 'chromium', use: {
      ...devices['Desktop Chrome'],
      launchOptions: { args: ['--autoplay-policy=no-user-gesture-required'] },
    } },
    { name: 'firefox', use: { ...devices['Desktop Firefox'] } },
  ],
});
