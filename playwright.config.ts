import { defineConfig, devices } from '@playwright/test';

// End-to-end tests run in CI on Chromium with software rendering (SwiftShader), so WebGL2
// works without a GPU. Pixel comparisons stay within one renderer (workplan 18.2).
export default defineConfig({
  testMatch: '**/e2e/**/*.e2e.ts',
  // Spikes have their own Playwright configs and servers.
  testIgnore: ['**/spikes/**', '**/node_modules/**'],
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
  webServer: [
    {
      command: 'pnpm --filter @storystage/studio build && pnpm --filter @storystage/studio preview',
      url: 'http://localhost:4173',
      reuseExistingServer: !process.env.CI,
      timeout: 120_000,
    },
    {
      // The export harness (packages/export/e2e/harness): real MP4s made in the browser.
      command: 'pnpm --filter @storystage/export harness',
      url: 'http://localhost:4180',
      reuseExistingServer: !process.env.CI,
      timeout: 120_000,
    },
    {
      // The stage harness (packages/stage/e2e/harness): real pixels from the real stage.
      command: 'pnpm --filter @storystage/stage harness',
      url: 'http://localhost:4181',
      reuseExistingServer: !process.env.CI,
      timeout: 120_000,
    },
    {
      // The component page (apps/studio/components.html), for the axe checks. Dev server only.
      command: 'pnpm --filter @storystage/studio components',
      url: 'http://localhost:4182/components.html',
      reuseExistingServer: !process.env.CI,
      timeout: 120_000,
    },
    {
      command: 'pnpm --filter @storystage/tiles harness',
      url: 'http://localhost:4183/',
      reuseExistingServer: !process.env.CI,
      timeout: 120_000,
    },
    {
      // The same page built for production, for the tile editor's timing tests (spec 14, 3h).
      command: 'pnpm --filter @storystage/tiles harness:production',
      url: 'http://localhost:4184/',
      reuseExistingServer: !process.env.CI,
      timeout: 120_000,
    },
  ],
});
