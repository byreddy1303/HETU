import { defineConfig, devices } from '@playwright/test';

const devPort = Number(process.env.PLAYWRIGHT_PORT ?? '5173');
if (!Number.isInteger(devPort) || devPort < 1 || devPort > 65_535) {
  throw new Error('PLAYWRIGHT_PORT must be an integer between 1 and 65535.');
}
const baseURL = `http://127.0.0.1:${devPort}`;

export default defineConfig({
  testDir: './src/__tests__/e2e',
  fullyParallel: false,
  retries: process.env.CI ? 1 : 0,
  reporter: process.env.CI ? 'github' : 'list',
  use: {
    baseURL,
    trace: 'on-first-retry'
  },
  projects: [{ name: 'chromium', use: { ...devices['Desktop Chrome'] } }],
  webServer: {
    command: `VITE_SUPABASE_URL= VITE_SUPABASE_ANON_KEY= npm run dev -- --host 127.0.0.1 --port ${devPort} --strictPort`,
    url: baseURL,
    reuseExistingServer: !process.env.CI,
    timeout: 60_000
  }
});
