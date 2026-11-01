import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { validateSources } from '../../backstage-sources/src/sources.ts';
import { humanInfo, sourceList } from './human-info.ts';
import type { Person } from './people.ts';

const person: Person = {
  id: 'p26',
  name: 'Margaret',
  ageYears: 72,
  gender: 0.15,
  build: { weight: 0.55, muscle: 0.4, height: 0.4, proportions: 0.5 },
  ancestry: { african: 0, asian: 0, caucasian: 1 },
  eyes: 'grey',
  hair: 'bob02',
  hairTint: 'grey',
  eyebrows: 'eyebrow002',
  clothes: ['female_casualsuit02'],
  shoes: 'shoes06',
};

describe('humanInfo', () => {
  it("gives MPFB2 the person's shape, in its macro sliders", () => {
    const info = humanInfo(person);
    expect(info.phenotype).toMatchObject({
      gender: 0.15,
      muscle: 0.4,
      weight: 0.55,
      height: 0.4,
      proportions: 0.5,
      race: { african: 0, asian: 0, caucasian: 1 },
    });
    expect(info.phenotype.age).toBeCloseTo(0.8615, 3);
  });

  it('names assets as files, and uses the game-engine rig and materials', () => {
    expect(humanInfo(person)).toMatchObject({
      name: 'p26',
      rig: 'game_engine',
      hair: 'bob02.mhclo',
      eyebrows: 'eyebrow002.mhclo',
      eyes: 'low-poly.mhclo',
      skin_mhmat: 'old_caucasian_female.mhmat',
      skin_material_type: 'GAMEENGINE',
      clothes_material_type: 'GAMEENGINE',
      clothes: ['female_casualsuit02.mhclo', 'shoes06.mhclo'],
    });
  });

  it('passes on what only the Blender script can do: eye colour and hair tint', () => {
    expect(humanInfo(person)).toMatchObject({ storystage: { eyes: 'grey', hairTint: 'grey' } });
  });

  it('leaves hair empty for someone with none, and adds a hat to the clothes', () => {
    const winston = humanInfo({ ...person, hair: null, hairTint: undefined, hat: 'fedora01' });
    expect(winston.hair).toBe('');
    expect(winston.clothes).toContain('fedora01.mhclo');
    expect(winston.storystage.hairTint).toBeNull();
  });
});

describe('sourceList', () => {
  const people = JSON.parse(
    readFileSync(fileURLToPath(new URL('../people.json', import.meta.url)), 'utf8'),
  ) as Person[];

  it('makes a valid Backstage source list of generated models', () => {
    const list = sourceList(people);
    expect(validateSources(list).ok).toBe(true);
    expect(list.items).toHaveLength(30);
    expect(list.items[25]).toMatchObject({
      id: 'makehuman/Biped/p26',
      displayName: 'Margaret',
      class: 'Biped',
      section: 'cast',
      licence: 'CC0-1.0',
      credit: 'Margaret, made with MakeHuman (CC0)',
      fetch: { generated: 'makehuman/p26.glb' },
    });
  });

  it('files children, teenagers, adults and older people under themes learners can browse', () => {
    const themes = (id: string) => sourceList(people).items.find((i) => i.id.endsWith(id))!.themes;
    expect(themes('p01')).toEqual(['everyday', 'children']);
    expect(themes('p11')).toEqual(['everyday', 'teenagers']);
    expect(themes('p17')).toEqual(['everyday', 'adults']);
    expect(themes('p26')).toEqual(['everyday', 'older people']);
  });
});
