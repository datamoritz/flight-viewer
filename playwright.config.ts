import { defineConfig, devices } from '@playwright/test'

const PORT = 5183

export default defineConfig({
  testDir: './e2e',
  fullyParallel: true,
  forbidOnly: Boolean(process.env.CI),
  retries: process.env.CI ? 1 : 0,
  reporter: [['list']],
  use: {
    baseURL: `http://localhost:${PORT}`,
    trace: 'retain-on-failure',
    screenshot: 'only-on-failure',
  },
  projects: [
    {
      name: 'chromium',
      use: { ...devices['Desktop Chrome'] },
    },
  ],
  webServer: {
    command: `npm run dev -- --port ${PORT} --strictPort`,
    port: PORT,
    reuseExistingServer: !process.env.CI,
    // The Google Maps API is fully mocked in tests (see e2e/mocks/mapsMock.ts) —
    // this dummy key only needs to satisfy the app's "is a key present" check.
    env: { VITE_GOOGLE_MAPS_API_KEY: 'test-mock-key-not-a-real-key' },
    timeout: 30_000,
  },
})
