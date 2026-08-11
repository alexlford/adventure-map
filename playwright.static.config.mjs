import { defineConfig, devices } from '@playwright/test';

export default defineConfig({
  testDir: './static-tests',
  timeout: 30_000,
  expect: { timeout: 12_000 },
  fullyParallel: false,
  retries: 1,
  reporter: [['line']],
  use: {
    baseURL: 'http://127.0.0.1:4174',
    trace: 'retain-on-failure',
  },
  projects: [
    {
      name: 'chromium',
      use: { ...devices['Desktop Chrome'] },
    },
  ],
});
