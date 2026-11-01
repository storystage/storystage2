import { defineProject } from 'vitest/config';

// Components are tested in a DOM (07-ux §5): roles, names, keyboard and focus.
export default defineProject({
  test: {
    name: '@storystage/ui',
    environment: 'happy-dom',
    setupFiles: ['./src/test-setup.ts'],
  },
});
