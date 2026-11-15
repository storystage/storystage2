import { defineConfig, devices } from '@playwright/test';

// The browser version as it will be hosted (README.md here): the `browser` workflow serves the
// build from Apache with `htaccess`, and these tests check it there. No server is started here.
export default defineConfig({
  testDir: '.',
  testMatch: '*.hosting.ts',
  forbidOnly: !!process.env.CI,
  workers: 1,
  reporter: process.env.CI ? [['github'], ['list']] : 'list',
  outputDir: 'test-results',
  use: {
    ...devices['Desktop Chrome'],
    baseURL: process.env.HOSTING_URL ?? 'http://localhost:8080/',
  },
});
