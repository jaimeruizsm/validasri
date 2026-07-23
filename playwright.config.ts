import { defineConfig, devices } from '@playwright/test';

/**
 * E2E del flujo principal con el proveedor mock. El global setup crea la base
 * local y siembra el usuario demo; el server web se levanta en el puerto 3123.
 */
export default defineConfig({
  testDir: './e2e',
  fullyParallel: false,
  workers: 1,
  timeout: 60_000,
  globalSetup: './e2e/global-setup.ts',
  reporter: [['list']],
  use: {
    baseURL: 'http://localhost:3123',
    trace: 'on-first-retry',
  },
  projects: [{ name: 'chromium', use: { ...devices['Desktop Chrome'] } }],
  webServer: {
    command: 'npm run start --workspace apps/web -- --port 3123',
    url: 'http://localhost:3123/login',
    reuseExistingServer: false,
    timeout: 120_000,
    env: {
      DATA_PROVIDER: 'local',
      LOCAL_DB_PATH: '.data/e2e.db',
      LOCAL_SESSION_SECRET: 'e2e_secret_0123456789abcdef0123456789abcdef',
      SRI_PROVIDER: 'mock',
      SRI_ENVIRONMENT: 'test',
      MAX_TXT_SIZE_MB: '5',
      MAX_KEYS_PER_BATCH: '10000',
    },
  },
});
