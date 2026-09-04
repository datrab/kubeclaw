import { defineConfig } from '@playwright/test';

export default defineConfig({
  testDir: './specs',
  retries: 1,
  timeout: 15_000,
  use: {
    baseURL: process.env.PLAYWRIGHT_TEST_BASE_URL,
    screenshot: 'only-on-failure',
    trace: 'retain-on-failure',
  },
  projects: [{ name: 'real-chromium', use: { browserName: 'chromium', headless: true,
    launchOptions: { executablePath: '/ms-playwright/chromium_headless_shell-1228/chrome-headless-shell-linux64/chrome-headless-shell' } } }],
});
