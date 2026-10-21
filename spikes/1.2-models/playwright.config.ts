import { defineConfig, devices } from '@playwright/test';

export default defineConfig({
  testDir: 'e2e',
  testMatch: '*.e2e.ts',
  workers: 1,
  reporter: 'list',
  use: { baseURL: 'http://localhost:4172', acceptDownloads: true },
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
    command: 'pnpm build && pnpm exec vite preview',
    url: 'http://localhost:4172',
    reuseExistingServer: !process.env.CI,
    timeout: 120_000,
  },
});
