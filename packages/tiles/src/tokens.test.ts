// @vitest-environment node
import { readFileSync } from 'node:fs';
import { contrastRatio } from '@storystage/ui';
import { describe, expect, it } from 'vitest';
import { OUTLINE_PAIRS, TEXT_PAIRS, TILE_COLOURS } from './tokens.ts';

describe('tile colours', () => {
  it.each(TEXT_PAIRS)('%s text on %s passes 4.5:1', (text, background) => {
    expect(contrastRatio(TILE_COLOURS[text], TILE_COLOURS[background])).toBeGreaterThanOrEqual(4.5);
  });

  it.each(OUTLINE_PAIRS)('%s against %s passes 3:1', (line, background) => {
    expect(contrastRatio(TILE_COLOURS[line], TILE_COLOURS[background])).toBeGreaterThanOrEqual(3);
  });
});

describe('tiles.css', () => {
  const rules = readFileSync(new URL('./tiles.css', import.meta.url), 'utf8').replace(
    /\/\*[\s\S]*?\*\//g,
    '',
  );

  it('uses the tile tokens only, never a colour value', () => {
    expect(rules.match(/#[0-9a-f]{3,8}\b|\brgba?\(|\bhsla?\(/gi) ?? []).toEqual([]);
  });

  it('names only tokens that exist', () => {
    const used = new Set([...rules.matchAll(/var\(--tl-([a-z0-9-]+)/g)].map((m) => m[1]));
    expect([...used].filter((name) => name && !(name in TILE_COLOURS))).toEqual([]);
  });

  it('gives every row and empty list 44 px of height or more', () => {
    for (const selector of ['.tl-row', '.tl-empty']) {
      const block = new RegExp(`\\${selector} \\{([^}]*)\\}`).exec(rules)?.[1] ?? '';
      expect(block, selector).toContain('min-height: 44px');
    }
  });
});
