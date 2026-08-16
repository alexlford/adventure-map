import { defineConfig, devices } from '@playwright/test';

export default defineConfig({
  testDir: './tests',
  timeout: 30_000,
  expect: { timeout: 12_000 },
  fullyParallel: false,
  retries: 1,
  reporter: process.env.CI ? [['github']] : [['line']],
  use: {
    baseURL: 'http://127.0.0.1:4173',
    trace: 'retain-on-failure',
  },
  projects: [
    {
      name: 'chromium',
      use: { ...devices['Desktop Chrome'] },
    },
    {
      name: 'webkit-mobile',
      use: { ...devices['iPhone 13'] },
    },
  ],
});
