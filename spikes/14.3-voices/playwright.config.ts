import { defineConfig, devices } from '@playwright/test';

// Speech runs on the CPU (WebAssembly); software rendering doesn't matter here, but it's the
// same browser set-up as the other spikes. Times in CI are a floor, not a device's numbers.
export default defineConfig({
  testDir: 'e2e',
  testMatch: '*.e2e.ts',
  workers: 1,
  reporter: 'list',
  use: { baseURL: 'http://localhost:4233' },
  projects: [
    {
      name: 'chromium',
      use: {
        ...devices['Desktop Chrome'],
        channel: process.env.SPIKE_BROWSER_CHANNEL || undefined,
        launchOptions: { args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader'] },
      },
    },
  ],
  webServer: {
    command: 'pnpm build && pnpm exec vite preview',
    url: 'http://localhost:4233',
    reuseExistingServer: !process.env.CI,
    timeout: 180_000,
  },
});
