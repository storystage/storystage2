import { describe, expect, it } from 'vitest';
import { ENTRIES } from '../catalog/entries.ts';
import strings from '../strings/en-GB.json' with { type: 'json' };
import { CATEGORIES, palette } from './palette.ts';
import { field, ID, scene, self } from './testing.ts';

const program = scene();
const keys = (groups: ReturnType<typeof palette>) => groups.map((g) => g.key);
const words = (groups: ReturnType<typeof palette>, key: string) =>
  groups.find((g) => g.key === key)?.items.map((i) => i.words) ?? [];

describe('categories', () => {
  it('put every block in exactly one, on the right tab (spec 14, 2.1)', () => {
    const placed = CATEGORIES.flatMap((c) => c.blocks);
    expect(placed.length).toBe(new Set(placed).size);
    const names = [...new Set(ENTRIES.map((e) => e.name))];
    expect(names.filter((n) => !placed.includes(n))).toEqual([]);
    expect(placed.filter((n) => !names.includes(n))).toEqual([]);
    for (const c of CATEGORIES)
      for (const name of c.blocks) {
        const kinds = new Set(ENTRIES.filter((e) => e.name === name).map((e) => e.kind));
        expect([...kinds], name).toEqual([c.tab === 'actions' ? 'procedure' : 'function']);
      }
  });

  it('all have words', () => {
    const all = strings as Record<string, string>;
    for (const c of CATEGORIES) expect(all[`category.${c.key}`], c.key).toBeTruthy();
    expect(all['category.yours']).toBeTruthy();
  });
});

describe('palette', () => {
  it('lists a biped’s actions in Alice’s order, with ??? for each value', () => {
    const groups = palette(program, field(ID.cat), ID.scene, 'actions');
    expect(keys(groups).slice(0, 3)).toEqual(['sayThink', 'position', 'orientation']);
    expect(words(groups, 'sayThink')).toEqual([
      'cat say ???',
      'cat think ???',
      'cat speak line ???',
    ]);
    expect(words(groups, 'position')[0]).toBe('cat move ??? ???');
    expect(keys(groups)).toContain('movingAbout');
  });

  it('offers only what the class has', () => {
    const chair = keys(palette(program, field(ID.chair), ID.scene, 'actions'));
    expect(chair).not.toContain('movingAbout');
    expect(chair).not.toContain('scenes');
    expect(keys(palette(program, self(), ID.scene, 'actions'))).toContain('scenes');
    expect(words(palette(program, field(ID.camera), ID.scene, 'actions'), 'camera')).toContain(
      'camera frame a ??? of ???',
    );
  });

  it('puts the learner’s own procedures first', () => {
    const groups = palette(program, field(ID.rex), ID.scene, 'actions');
    expect(groups[0]).toMatchObject({ key: 'yours', words: 'your own' });
    expect(words(groups, 'yours')).toEqual(['rex hop height ???']);
    expect(keys(groups)).toContain('position');
  });

  it('lists questions on their own tab', () => {
    const groups = palette(program, field(ID.cat), ID.scene, 'questions');
    expect(keys(groups)).toContain('whereThingsAre');
    expect(keys(groups)).not.toContain('sayThink');
    expect(words(groups, 'whereThingsAre')).toContain('cat is touching ???');
  });

  it('returns a callee each editor can build from', () => {
    const [first] = palette(program, field(ID.cat), ID.scene, 'actions');
    expect(first?.items[0]?.callee).toEqual({ kind: 'story', name: 'say' });
  });
});
