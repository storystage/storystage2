import { defineProject } from 'vitest/config';

// The shell is tested in a DOM: roles, names and keyboard (docs/spec/07-ux.md §5).
export default defineProject({
  test: {
    name: '@storystage/studio',
    environment: 'happy-dom',
    setupFiles: ['./src/test-setup.ts'],
    // Many tests render the whole studio and type into it; under a full run's load that can take
    // longer than Vitest's 5 s, which made them fail now and then (ScriptPane, the Code editor).
    testTimeout: 15_000,
  },
});
