import { defineProject } from 'vitest/config';

// The Screening room is tested in a DOM (07-ux §5): roles, names, keyboard and focus.
export default defineProject({
  test: {
    name: '@storystage/screening',
    environment: 'happy-dom',
    setupFiles: ['./src/test-setup.ts'],
  },
});
