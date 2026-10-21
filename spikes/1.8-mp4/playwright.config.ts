import { defineConfig, devices } from '@playwright/test';

// Not every engine is expected to encode: the point is to record which can. The test fails only
// if the page itself breaks; the report reads the JSON and the ffprobe output.
export default defineConfig({
  testDir: 'e2e',
  testMatch: '*.e2e.ts',
  workers: 1,
  reporter: 'list',
  use: { baseURL: 'http://localhost:4178', acceptDownloads: true },
  projects: [
    {
      name: 'chrome',
      use: {
        ...devices['Desktop Chrome'],
        channel: 'chrome',
        launchOptions: { args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader'] },
      },
    },
    {
      name: 'chromium',
      use: {
        ...devices['Desktop Chrome'],
        launchOptions: { args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader'] },
      },
    },
    { name: 'webkit', use: { ...devices['Desktop Safari'] } },
  ],
  webServer: {
    command: 'pnpm build && pnpm exec vite preview',
    url: 'http://localhost:4178',
    reuseExistingServer: !process.env.CI,
    timeout: 120_000,
  },
});
