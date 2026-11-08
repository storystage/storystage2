import { defineProject } from 'vitest/config';

// The editor is tested in a DOM: roles, names, keyboard and focus (spec 14, section 7).
export default defineProject({
  test: {
    name: '@storystage/tiles',
    environment: 'happy-dom',
    setupFiles: ['./src/test-setup.ts'],
  },
});
