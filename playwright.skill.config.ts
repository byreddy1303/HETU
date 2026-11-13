import { defineConfig, devices } from '@playwright/test';

export default defineConfig({
  testDir: './tests/local-skills',
  fullyParallel: false,
  workers: 1,
  timeout: 60_000,
  use: { baseURL: 'http://127.0.0.1:18767', trace: 'retain-on-failure' },
  projects: [{ name: 'chromium', use: { ...devices['Desktop Chrome'] } }],
  webServer: [
    {
      command: 'HETU_BACKEND_PORT=18766 node scripts/start-local-test-backend.cjs',
      url: 'http://127.0.0.1:18766/health/ready',
      timeout: 60_000
    },
    {
      command:
        'VITE_BACKEND=fastapi VITE_LOCAL_MODE=true VITE_API_URL=http://127.0.0.1:18766 npm run dev -- --host 127.0.0.1 --port 18767 --strictPort',
      url: 'http://127.0.0.1:18767',
      timeout: 60_000
    }
  ]
});
