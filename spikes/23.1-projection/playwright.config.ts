import { defineConfig, devices } from '@playwright/test';

// Software rendering (SwiftShader) in CI: it proves the bake is right, not how fast a classroom
// PC runs it. The timings in the report are for comparison between runs only.
export default defineConfig({
  testDir: 'e2e',
  testMatch: '*.e2e.ts',
  workers: 1,
  reporter: 'list',
  use: { baseURL: 'http://localhost:4231' },
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
    url: 'http://localhost:4231',
    reuseExistingServer: !process.env.CI,
    timeout: 120_000,
  },
});
