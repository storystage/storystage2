import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { exportPeople } from './export.ts';
import type { Person } from './people.ts';

const everyone = JSON.parse(
  readFileSync(fileURLToPath(new URL('../people.json', import.meta.url)), 'utf8'),
) as Person[];

describe('exportPeople', () => {
  it('makes everyone, and lists everyone', () => {
    const { toMake, sources } = exportPeople(everyone);
    expect(toMake).toHaveLength(30);
    expect(sources.items).toHaveLength(30);
  });

  // A partial run once wrote a list of just the people it made, so the next Backstage build
  // dropped the other 23 (8 Nov 2026).
  it('makes only some with --only, but still lists everyone', () => {
    const { toMake, sources } = exportPeople(everyone, ['p02', 'p24']);
    expect(toMake).toHaveLength(2);
    expect(sources.items).toHaveLength(30);
    expect(sources.items.map((i) => i.id)).toContain('makehuman/Biped/p01');
  });
});
