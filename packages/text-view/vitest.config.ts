import { defineProject } from 'vitest/config';

// The view is tested in a DOM: its region, lines and marks.
export default defineProject({
  test: {
    name: '@storystage/text-view',
    environment: 'happy-dom',
    setupFiles: ['./src/test-setup.ts'],
  },
});
