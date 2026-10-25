// @vitest-environment node
import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { COLOR_TOKENS } from './tokens.ts';

const css = readFileSync(new URL('./styles.css', import.meta.url), 'utf8');
const rules = css.replace(/\/\*[\s\S]*?\*\//g, '');

describe('styles.css', () => {
  it('uses tokens only, never a colour value (07-ux §5)', () => {
    expect(rules.match(/#[0-9a-f]{3,8}\b|\brgba?\(|\bhsla?\(/gi) ?? []).toEqual([]);
  });

  it('names only tokens that exist', () => {
    const used = new Set([...rules.matchAll(/var\(--ss-([a-z0-9-]+)/g)].map((m) => m[1]));
    const known = new Set<string>([
      ...COLOR_TOKENS,
      'surface',
      'font-display',
      'font-body',
      'font-mono',
      'text-size',
    ]);
    expect([...used].filter((name) => name && !known.has(name))).toEqual([]);
  });

  it('gives every button 44 × 44 px or more', () => {
    const button = /\.ss-button \{([^}]*)\}/.exec(rules)?.[1] ?? '';
    expect(button).toContain('min-width: 44px');
    expect(button).toContain('min-height: 44px');
  });
});
