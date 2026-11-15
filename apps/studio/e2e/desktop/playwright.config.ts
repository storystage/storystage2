import { defineConfig } from '@playwright/test';

// The desktop app's gate tests (README.md here): Playwright drives the real Windows app's WebView2
// through a DevTools port that only the test build has. No browser is launched and no server is
// started: the test starts the app itself.
export default defineConfig({
  testDir: '.',
  testMatch: '*.app.ts',
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 1 : 0,
  workers: 1,
  reporter: process.env.CI ? [['github'], ['html', { open: 'never' }]] : 'list',
  timeout: 300_000,
});
