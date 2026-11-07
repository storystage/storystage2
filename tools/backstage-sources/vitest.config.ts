import { defineProject } from 'vitest/config';

// A build draws dozens of sketches on the CPU; give a busy machine time.
export default defineProject({
  test: { name: 'backstage-sources', testTimeout: 180_000 },
});
