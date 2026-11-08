import { defineProject } from 'vitest/config';

// The shell is tested in a DOM: roles, names and keyboard (docs/spec/07-ux.md §5).
export default defineProject({
  test: {
    name: '@storystage/studio',
    environment: 'happy-dom',
    setupFiles: ['./src/test-setup.ts'],
  },
});
