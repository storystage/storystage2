import { describe, expect, it } from 'vitest';
import { CODE_SYMBOLS, isCode, newCode, showCode } from './code.ts';

describe('a session’s code (spec 14, 6.3)', () => {
  it('is eight of 31 symbols a child can read back, with no 0, O, 1, I or L', () => {
    expect(CODE_SYMBOLS).toHaveLength(31);
    for (const c of '0O1IL') expect(CODE_SYMBOLS).not.toContain(c);
    const codes = Array.from({ length: 2000 }, () => newCode());
    for (const code of codes) expect(isCode(code)).toBe(true);
    // 2,000 codes from about 2^40 hardly ever meet.
    expect(new Set(codes).size).toBe(codes.length);
  });

  it('takes each symbol as often as any other, dropping bytes from 248 up', () => {
    const bytes = [255, 248, 0, 30, 31, 247, 1, 2, 3, 4];
    const random = (b: Uint8Array) => {
      b.fill(0);
      b.set(bytes.slice(0, b.length));
      return b;
    };
    // 0 → '2', 30 → 'Z', 31 → '2', 247 (= 7 × 31 + 30) → 'Z', then 1, 2, 3, 4.
    expect(newCode(random)).toBe('2Z2Z3456');
  });

  it('comes only from the random numbers given, never the time or the device', () => {
    const fixed = (b: Uint8Array) => b.fill(5);
    expect(newCode(fixed)).toBe(newCode(fixed));
  });

  it('shows in two halves, and refuses anything else', () => {
    expect(showCode('K7P3QX2M')).toBe('K7P3-QX2M');
    for (const bad of ['k7p3qx2m', 'K7P3-QX2', 'K7P3QX2O', 'K7P3QX2', 12345678, null])
      expect(isCode(bad)).toBe(false);
  });
});
