import { defineConfig, devices } from '@playwright/test';

// End-to-end tests run in CI on Chromium with software rendering (SwiftShader), so WebGL2
// works without a GPU. Pixel comparisons stay within one renderer (workplan 18.2).
export default defineConfig({
  testMatch: '**/e2e/**/*.e2e.ts',
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 1 : 0,
  reporter: process.env.CI ? [['github'], ['html', { open: 'never' }]] : 'list',
  use: {
    baseURL: 'http://localhost:4173',
    trace: 'on-first-retry',
  },
  projects: [
    {
      name: 'chromium-software',
      use: {
        ...devices['Desktop Chrome'],
        launchOptions: { args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader'] },
      },
    },
  ],
  webServer: {
    command: 'pnpm --filter @storystage/studio build && pnpm --filter @storystage/studio preview',
    url: 'http://localhost:4173',
    reuseExistingServer: !process.env.CI,
    timeout: 120_000,
  },
});
