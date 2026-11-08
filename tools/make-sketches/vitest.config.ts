import { defineProject } from 'vitest/config';

// Each run draws a few dozen sketches on the CPU; give a busy machine time.
export default defineProject({
  test: { name: 'make-sketches', testTimeout: 120_000 },
});
