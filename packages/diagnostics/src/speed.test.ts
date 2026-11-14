import { describe, expect, it } from 'vitest';
import { scrub } from './scrub.ts';

describe('scrub on long, hostile text', () => {
  // An error can say anything, so every pattern must take time in proportion to the text.
  it.each([
    ['letters', 'a'.repeat(100_000)],
    ['dots before an @', `${'a.'.repeat(50_000)}@`],
    ['dashes before a digit', `${'-'.repeat(100_000)}1`],
    ['web addresses', 'http://'.repeat(20_000)],
    ['@ signs', 'a@'.repeat(50_000)],
    ['paths', '/home/'.repeat(20_000)],
  ])('is quick on %s', (_, text) => {
    const t0 = performance.now();
    scrub(text, ['Sam', 'Ana']);
    expect(performance.now() - t0).toBeLessThan(1_000);
  });
});
