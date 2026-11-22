import { readFileSync } from 'node:fs';
import { backstageId } from '@storystage/story-api';
import { describe, expect, it } from 'vitest';
import { importAliceWorld } from './import.ts';
import { aliceKeyOf, aliceModelsFrom } from './models.ts';
import { smallAliceWorld } from './testing.ts';

const item = (id: string, height = 0.3) => ({ id: backstageId(id), defaultSize: { height } });

describe('aliceKeyOf (spec 19, 4.2)', () => {
  it('is the folder and the model, without the theme folder', () => {
    expect(aliceKeyOf('Quadruped/Cat/AbyssinianCat')).toBe('Quadruped/AbyssinianCat');
    expect(aliceKeyOf('Prop/Trees/Plants/MangoTree')).toBe('Prop/MangoTree');
    expect(aliceKeyOf('Prop/MangoTree')).toBe('Prop/MangoTree');
  });

  it('is null for a model that isn’t from Alice’s gallery', () => {
    expect(aliceKeyOf('kaykit/Biped/knight')).toBeNull();
    expect(aliceKeyOf('makehuman/Biped/child-7-afro')).toBeNull();
    expect(aliceKeyOf('Prop')).toBeNull();
  });
});

describe('aliceModelsFrom', () => {
  it('keys each Alice gallery model as the import asks, with its height', () => {
    const models = aliceModelsFrom({
      items: [item('kaykit/Biped/knight'), item('Quadruped/Cat/AbyssinianCat', 0.25)],
    });
    expect([...models]).toEqual([
      ['Quadruped/AbyssinianCat', { id: 'Quadruped/Cat/AbyssinianCat', height: 0.25 }],
    ]);
  });

  it('keeps the first by id when two share a key, and no height that isn’t one', () => {
    const models = aliceModelsFrom({
      items: [item('Prop/Trees/MangoTree', 0), item('Prop/Fruit/MangoTree', 4)],
    });
    expect(models.get('Prop/MangoTree')).toEqual({ id: 'Prop/Fruit/MangoTree', height: 4 });
    expect(aliceModelsFrom({ items: [item('Prop/MangoTree', 0)] }).get('Prop/MangoTree')).toEqual({
      id: 'Prop/MangoTree',
      height: null,
    });
  });

  it('gives the import Backstage’s model, scaled to Alice’s size, with nothing to report', () => {
    const models = aliceModelsFrom({ items: [item('Quadruped/Cat/AbyssinianCat', 0.3)] });
    const result = importAliceWorld(smallAliceWorld(), { models });
    if (!result.ok) throw new Error(result.problem.message);
    const cat = result.production.scenes[0]!.setup.objects[0]!;
    expect(cat.model).toBe('Quadruped/Cat/AbyssinianCat');
    expect(cat.transform.scale.y).toBeCloseTo(2, 6); // Alice's 0.6 m over Backstage's 0.3 m
    expect(result.report.counts.model).toBe(0);
  });

  it('loads nothing: the page can import it without the importer', () => {
    const source = readFileSync(new URL('./models.ts', import.meta.url), 'utf8');
    const imports = [...source.matchAll(/^import\s+(type\s+)?[^;]*?from\s+'([^']+)'/gms)];
    // It has imports, all of them `import type`, which load nothing when it runs.
    expect(imports.length).toBeGreaterThan(0);
    expect(imports.filter((m) => !m[1]).map((m) => m[2])).toEqual([]);
  });
});
