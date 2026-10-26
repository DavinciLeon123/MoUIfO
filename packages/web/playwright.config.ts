import { defineConfig, devices } from '@playwright/test';
import { loadConfig } from 'uio-config';

const base = loadConfig().pages_base_path;
const override = process.env.PLAYWRIGHT_BASE_URL;
const baseURL = override
  ? override.endsWith('/')
    ? override
    : `${override}/`
  : `http://localhost:4173${base}`;

export default defineConfig({
  testDir: 'e2e',
  testMatch: '**/*.e2e.ts',
  fullyParallel: true,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 2 : 0,
  reporter: 'list',
  use: { locale: 'en-US', baseURL, trace: 'on-first-retry' },
  projects: [
    { name: 'desktop', use: { ...devices['Desktop Chrome'] } },
    { name: 'mobile', use: { ...devices['Pixel 7'] } },
  ],
  webServer: override
    ? undefined
    : {
        command: 'npm run build && npm run preview -- --port 4173 --strictPort',
        url: baseURL,
        reuseExistingServer: !process.env.CI,
        timeout: 120000,
      },
});
