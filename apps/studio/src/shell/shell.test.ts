// @vitest-environment node
import { readFileSync } from 'node:fs';
import { COLOR_TOKENS } from '@storystage/ui';
import { describe, expect, it } from 'vitest';

/** Every stylesheet in the studio. Each new one joins this list. */
const STYLESHEETS = ['./shell.css', '../storyboard/storyboard.css', '../production/production.css'];

const read = (path: string) =>
  readFileSync(new URL(path, import.meta.url), 'utf8').replace(/\/\*[\s\S]*?\*\//g, '');

describe.each(STYLESHEETS)('%s', (path) => {
  const rules = read(path);

  it('uses tokens only, never a colour value (07-ux §5)', () => {
    expect(rules.match(/#[0-9a-f]{3,8}\b|\brgba?\(|\bhsla?\(/gi) ?? []).toEqual([]);
  });

  it('names only tokens that exist', () => {
    const used = new Set([...rules.matchAll(/var\(--ss-([a-z0-9-]+)/g)].map((m) => m[1]));
    const known = new Set<string>([...COLOR_TOKENS, 'surface', 'font-display', 'font-body']);
    expect([...used].filter((name) => name && !known.has(name))).toEqual([]);
  });
});

describe('shell.css', () => {
  it('switches to the narrow-window note below 1024 px, and folds the wordmark below 1280 px', () => {
    const rules = read('./shell.css');
    expect(rules).toContain('@media (max-width: 1023px)');
    expect(rules).toContain('@media (max-width: 1279px)');
  });
});
