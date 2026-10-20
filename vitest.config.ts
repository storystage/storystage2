import { defineConfig } from 'vitest/config';

// One Vitest run over every workspace package. Each folder is its own project, so a
// package can add its own vitest.config.ts (environment, setup files) when it needs one.
// End-to-end tests are named *.e2e.ts, so Vitest never picks them up; Playwright runs them.
export default defineConfig({
  test: {
    projects: ['apps/*', 'packages/*', 'tools/*'],
    passWithNoTests: true,
  },
});
