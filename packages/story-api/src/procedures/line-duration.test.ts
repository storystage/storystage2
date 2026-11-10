import { describe, expect, it } from 'vitest';
import { lineDuration, lineWords } from './line-duration.ts';

describe('lineDuration (spec 06, 4.2)', () => {
  it('is 0.4 s plus 0.4 s a word', () => {
    expect(lineDuration('Here is the key.')).toBe(2);
    expect(lineDuration('I have looked for this key all day long')).toBe(4);
  });

  it('is at least 1.5 s, so a short line can still be read', () => {
    expect(lineDuration('Oh!')).toBe(1.5);
    expect(lineDuration('Yes, please')).toBe(1.5);
    expect(lineDuration('')).toBe(1.5);
  });

  it('comes out in whole tenths, with no floating-point dust', () => {
    for (let n = 0; n < 200; n++) {
      const seconds = lineDuration(Array.from({ length: n }, () => 'word').join(' '));
      expect(Math.round(seconds * 10) / 10).toBe(seconds);
      expect(seconds).toBe(Math.max(1.5, (4 + 4 * n) / 10));
    }
  });

  it('counts words, not spaces or punctuation', () => {
    expect(lineWords('  Here   is\nthe key . ')).toBe(4);
    expect(lineWords('well-known — 3 owls')).toBe(3);
    expect(lineWords('Où est la clé ?')).toBe(4);
  });
});
