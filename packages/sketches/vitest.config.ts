import { defineProject } from 'vitest/config';

// Rendering sketches on the CPU takes a few hundred milliseconds each; on a busy machine a
// test that draws several can pass Vitest's default 5 s.
export default defineProject({
  test: { name: 'sketches', testTimeout: 30_000 },
});
