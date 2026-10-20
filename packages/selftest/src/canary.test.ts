import { expect, it } from 'vitest';

// Throwaway (WP0 done-when): this pull request must be blocked because this test fails.
it('fails on purpose', () => {
  expect(1 + 1).toBe(3);
});
