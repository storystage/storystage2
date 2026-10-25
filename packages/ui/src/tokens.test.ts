import { describe, expect, it } from 'vitest';
import { contrastRatio } from './contrast.ts';
import { themeVariables } from './css.ts';
import { COLOR_TOKENS, THEMES, colors, type ColorToken } from './tokens.ts';

/** Surfaces that text and controls sit on (07-ux §2.2). */
const SURFACES: readonly ColorToken[] = [
  'stage-0',
  'stage-0b',
  'panel-1',
  'panel-2',
  'panel-3',
  'band',
  'dialog',
];

/** Text that sits on any surface: 4.5:1. */
const TEXT_ON_SURFACES: readonly ColorToken[] = [
  'text',
  'text-2',
  'muted',
  'amber-text',
  'prompter-text',
  'ok',
  'flag',
  'stop',
  'status-planned',
  'status-staged',
  'status-coded',
];

/**
 * Outlines and rings that sit on any surface: 3:1 (WCAG 1.4.11). The ring round an amber control
 * (`focus-on-amber`) sits outside it, after a 2 px amber gap, so it is measured against the surface.
 */
const LINES_ON_SURFACES: readonly ColorToken[] = [
  'line-2',
  'amber-line',
  'focus',
  'focus-on-amber',
  'prompter-line',
  'flag-line',
  'stop',
];

/** Text on its own fill: [text, fill]. */
const TEXT_ON_FILLS: readonly (readonly [ColorToken, ColorToken])[] = [
  ['on-amber', 'amber'],
  ['on-strong', 'strong'],
  ['on-prompter', 'prompter'],
  ['text', 'amber-tint'],
  ['amber-text', 'amber-tint'],
  ['text', 'flag-bg'],
  ['flag', 'flag-bg'],
  ['text', 'field'],
  ['placeholder', 'field'],
  ['text', 'panel-4'],
  ['prompter-text', 'prompter-bg'],
  ['sketch-ink', 'sketch-paper'],
];

/** Outlines on their own fill: [line, fill]. */
const LINES_ON_FILLS: readonly (readonly [ColorToken, ColorToken])[] = [
  ['line-2', 'field'],
  ['amber-line', 'amber-tint'],
  ['flag-line', 'flag-bg'],
];

describe.each(THEMES)('the %s theme', (theme) => {
  const c = colors[theme];
  const ratio = (a: ColorToken, b: ColorToken) => contrastRatio(c[a], c[b]);

  it.each(TEXT_ON_SURFACES.flatMap((t) => SURFACES.map((s) => [t, s] as const)))(
    '%s text on %s is 4.5:1 or more',
    (t, s) => {
      expect(ratio(t, s)).toBeGreaterThanOrEqual(4.5);
    },
  );

  it.each(LINES_ON_SURFACES.flatMap((l) => SURFACES.map((s) => [l, s] as const)))(
    '%s outline on %s is 3:1 or more',
    (l, s) => {
      expect(ratio(l, s)).toBeGreaterThanOrEqual(3);
    },
  );

  it.each(TEXT_ON_FILLS)('%s text on %s is 4.5:1 or more', (t, f) => {
    expect(ratio(t, f)).toBeGreaterThanOrEqual(4.5);
  });

  it.each(LINES_ON_FILLS)('%s outline on %s is 3:1 or more', (l, f) => {
    expect(ratio(l, f)).toBeGreaterThanOrEqual(3);
  });

  it('gives every token a #RRGGBB value', () => {
    for (const t of COLOR_TOKENS) expect(c[t]).toMatch(/^#[0-9A-F]{6}$/);
  });

  it('keeps the fills that read the same in both themes', () => {
    for (const t of [
      'amber',
      'on-amber',
      'prompter',
      'on-prompter',
      'sketch-paper',
      'sketch-ink',
    ] as const) {
      expect(c[t]).toBe(colors.dark[t]);
    }
  });
});

describe('contrastRatio', () => {
  it('is 21 for black on white and 1 for a colour on itself', () => {
    expect(contrastRatio('#000000', '#FFFFFF')).toBeCloseTo(21, 5);
    expect(contrastRatio('#F4B740', '#F4B740')).toBe(1);
  });

  it('refuses anything but #RRGGBB', () => {
    expect(() => contrastRatio('amber', '#FFFFFF')).toThrow(/Not a #RRGGBB colour/);
  });
});

describe('themeVariables', () => {
  it('names one custom property per token', () => {
    const vars = themeVariables('light');
    expect(Object.keys(vars)).toHaveLength(COLOR_TOKENS.length);
    expect(vars['--ss-panel-2']).toBe('#FBF8F3');
  });
});
