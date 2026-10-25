import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { ageToMacro, peopleTable, skinFor, validatePeople, type Person } from './people.ts';

const person = (over: Partial<Person> = {}): Person => ({
  id: 'p01',
  name: 'Alfie',
  ageYears: 6,
  gender: 0.7,
  build: { weight: 0.5, muscle: 0.5, height: 0.5, proportions: 0.5 },
  ancestry: { african: 0, asian: 0, caucasian: 1 },
  eyes: 'blue',
  hair: 'short02',
  eyebrows: 'eyebrow001',
  clothes: ['male_casualsuit01'],
  shoes: 'shoes01',
  ...over,
});

describe('ageToMacro', () => {
  it("follows MakeHuman's age slider: 1, 11, 25 and 90 years at 0, 0.1875, 0.5 and 1", () => {
    expect(ageToMacro(1)).toBe(0);
    expect(ageToMacro(11)).toBeCloseTo(0.1875);
    expect(ageToMacro(25)).toBe(0.5);
    expect(ageToMacro(90)).toBe(1);
    expect(ageToMacro(6)).toBeCloseTo(0.09375);
    expect(ageToMacro(57.5)).toBeCloseTo(0.75);
  });
});

describe('skinFor', () => {
  it('chooses the MakeHuman skin by age band, the largest ancestry share and the body', () => {
    expect(skinFor(person())).toBe('young_caucasian_male');
    expect(
      skinFor(
        person({ ageYears: 45, gender: 0.2, ancestry: { african: 0.7, asian: 0, caucasian: 0.3 } }),
      ),
    ).toBe('middleage_african_female');
    expect(
      skinFor(person({ ageYears: 70, ancestry: { african: 0, asian: 1, caucasian: 0 } })),
    ).toBe('old_asian_male');
  });
});

describe('validatePeople', () => {
  it('accepts people made only of assets in the CC0 system pack', () => {
    expect(validatePeople([person(), person({ id: 'p02', hair: null })]).ok).toBe(true);
  });

  it('refuses unknown assets, ancestry that does not add up, odd ages and repeated ids', () => {
    const r = validatePeople([
      person({ hair: 'dreadlocks01' }),
      person({ id: 'p02', ancestry: { african: 0.5, asian: 0, caucasian: 0.2 } }),
      person({ id: 'p03', ageYears: 120 }),
      person({ id: 'p03', clothes: ['hoodie99'] }),
    ]);
    expect(r.ok).toBe(false);
    if (r.ok) return;
    const all = r.errors.join('\n');
    expect(all).toMatch(/hair/);
    expect(all).toMatch(/ancestry/);
    expect(all).toMatch(/age/);
    expect(all).toMatch(/same id/);
    expect(all).toMatch(/hoodie99/);
  });
});

describe('peopleTable', () => {
  it('describes each person in plain words for review', () => {
    const table = peopleTable([
      person({ build: { weight: 0.8, muscle: 0.5, height: 0.7, proportions: 0.5 } }),
    ]);
    expect(table).toContain(
      '| 1 | Alfie | 6 | taller, larger | Caucasian 100% | young_caucasian_male | short02 | blue | male_casualsuit01, shoes01 |',
    );
  });
});

describe('people.json', () => {
  const file = fileURLToPath(new URL('../people.json', import.meta.url));
  const people = JSON.parse(readFileSync(file, 'utf8')) as Person[];

  it('is valid, with 30 people', () => {
    const r = validatePeople(people);
    expect(r.ok ? [] : r.errors).toEqual([]);
    expect(people).toHaveLength(30);
  });

  it('spans children, teenagers, adults and older people', () => {
    const count = (lo: number, hi: number) =>
      people.filter((p) => p.ageYears >= lo && p.ageYears <= hi).length;
    expect(count(6, 12)).toBeGreaterThanOrEqual(8);
    expect(count(13, 17)).toBeGreaterThanOrEqual(5);
    expect(count(18, 64)).toBeGreaterThanOrEqual(8);
    expect(count(65, 90)).toBeGreaterThanOrEqual(4);
  });
});
