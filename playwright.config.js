import { defineConfig } from '@playwright/test';

export default defineConfig({
  testDir: './playwright',
  reporter: 'list',
  use: {
    baseURL: 'http://localhost:5174',
    browserName: 'chromium',
    channel: 'msedge',
    headless: true,
  },
  webServer: {
    command: 'node scripts/playwright-vite.mjs --host 0.0.0.0 --port 5174',
    url: 'http://localhost:5174',
    reuseExistingServer: false,
    timeout: 60_000,
  },
});
