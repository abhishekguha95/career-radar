import { defineConfig, devices } from '@playwright/test';

const baseURL = process.env.CAREER_RADAR_UI_URL ?? 'http://127.0.0.1:3100';
export default defineConfig({
  testDir: './tests/e2e',
  workers: 1,
  fullyParallel: false,
  retries: 0,
  timeout: 30_000,
  reporter: 'list',
  use: { baseURL, channel: 'chrome', headless: true, trace: 'retain-on-failure' },
  projects: [
    { name: 'desktop', use: { ...devices['Desktop Chrome'], viewport: { width: 1440, height: 1100 } } },
    { name: 'mobile', use: { ...devices['Pixel 7'], defaultBrowserType: 'chromium' } },
  ],
  webServer: [
    { command: 'npm run backend', url: 'http://127.0.0.1:3101/ready', reuseExistingServer: false, timeout: 90_000 },
    { command: 'npm run frontend', url: baseURL, reuseExistingServer: false, timeout: 120_000 },
  ],
});
