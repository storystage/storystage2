import { describe, expect, it } from 'vitest';
import { ANIMATION_STYLES, MICROS_PER_SECOND, ease, micros } from './vocabulary.ts';

describe('micros', () => {
  it('rounds to whole microseconds, so sums of durations never drift', () => {
    expect(micros(0.1) + micros(0.2)).toBe(micros(0.3));
    expect(micros(1)).toBe(MICROS_PER_SECOND);
    expect(Number.isInteger(micros(1 / 3))).toBe(true);
  });
});

describe('ease', () => {
  it.each(ANIMATION_STYLES)('%s starts at 0, ends at 1 and never goes backwards', (style) => {
    expect(ease(style, 0)).toBe(0);
    expect(ease(style, 1)).toBe(1);
    expect(ease(style, -1)).toBe(0);
    expect(ease(style, 2)).toBe(1);
    let last = 0;
    for (let i = 1; i <= 100; i++) {
      const v = ease(style, i / 100);
      expect(v).toBeGreaterThanOrEqual(last);
      last = v;
    }
  });

  it('matches the names: gentle ends are slow, abrupt ends are not', () => {
    expect(ease('beginAndEndGently', 0.5)).toBe(0.5);
    expect(ease('beginAndEndGently', 0.1)).toBeLessThan(0.1);
    expect(ease('beginGentlyAndEndAbruptly', 0.1)).toBeLessThan(0.1);
    expect(ease('beginAbruptlyAndEndGently', 0.1)).toBeGreaterThan(0.1);
    expect(ease('beginAndEndAbruptly', 0.1)).toBeCloseTo(0.1);
  });
});
