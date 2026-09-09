import { defineConfig } from '@playwright/test';
export default defineConfig({ testDir: './tests', testMatch: 'remediation.spec.mjs', workers: 1,
  use: { browserName: 'chromium', viewport: { width: 1440, height: 1000 } } });
