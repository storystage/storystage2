import { defineConfig, devices } from '@playwright/test';

// Dictation in a real browser, after `.github/workflows/speech.yml` has built whisper.cpp. Its
// own config and file names (`*.browser.ts`), so the repository's e2e job, which has no whisper
// build, doesn't pick it up.
export default defineConfig({
  testDir: 'browser',
  testMatch: '*.browser.ts',
  workers: 1,
  forbidOnly: !!process.env.CI,
  reporter: 'list',
  use: { baseURL: 'http://localhost:4190' },
  projects: [
    {
      name: 'chromium',
      use: {
        ...devices['Desktop Chrome'],
        // A fake microphone and no permission prompt, for the microphone test.
        launchOptions: {
          args: ['--use-fake-device-for-media-stream', '--use-fake-ui-for-media-stream'],
        },
        permissions: ['microphone'],
      },
    },
  ],
  webServer: {
    command:
      'vite build --config browser/harness/vite.config.ts && vite preview --config browser/harness/vite.config.ts',
    url: 'http://localhost:4190',
    reuseExistingServer: !process.env.CI,
    timeout: 180_000,
  },
});
