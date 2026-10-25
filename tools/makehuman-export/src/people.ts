/**
 * WP3.5: the everyday people made with MakeHuman (`people.json`), checked against the assets in
 * MakeHuman's CC0 system pack, and described in plain words for the owner's review of
 * respectful, varied representation (`people.md`).
 *
 * The pipeline that makes them (MPFB2 in Blender, headless, in the assets repository's CI) reads
 * the same file.
 */

/**
 * Asset names in `makehuman_system_assets_cc0.zip` (CC0), as its page lists them:
 * https://static.makehumancommunity.org/assets/assetpacks/makehuman_system_assets.html
 */
export const SYSTEM_ASSETS = {
  hair: [
    'afro01',
    'bob01',
    'bob02',
    'braid01',
    'long01',
    'ponytail01',
    'short01',
    'short02',
    'short03',
    'short04',
  ],
  eyebrows: Array.from({ length: 12 }, (_, i) => `eyebrow${String(i + 1).padStart(3, '0')}`),
  eyes: [
    'blue',
    'bluegreen',
    'brown',
    'brownlight',
    'deepblue',
    'green',
    'grey',
    'ice',
    'lightblue',
  ],
  clothes: [
    'female_casualsuit01',
    'female_casualsuit02',
    'female_elegantsuit01',
    'female_sportsuit01',
    'male_casualsuit01',
    'male_casualsuit02',
    'male_casualsuit03',
    'male_casualsuit04',
    'male_casualsuit05',
    'male_casualsuit06',
    'male_elegantsuit01',
    'male_worksuit01',
  ],
  shoes: ['shoes01', 'shoes02', 'shoes03', 'shoes04', 'shoes05', 'shoes06'],
  hats: ['fedora01', 'fedora_cocked'],
} as const;

export interface Person {
  /** `p01` to `p30`; the Backstage id is `makehuman/Biped/<id>`. */
  readonly id: string;
  /** The name learners see in Backstage. */
  readonly name: string;
  readonly ageYears: number;
  /** MakeHuman's gender slider: 0 a female body, 1 a male body, 0.5 in between. */
  readonly gender: number;
  /** MakeHuman's macro sliders, 0 to 1; 0.5 is average. */
  readonly build: {
    readonly weight: number;
    readonly muscle: number;
    readonly height: number;
    readonly proportions: number;
  };
  /** MakeHuman's three ancestry sliders, which add up to 1. */
  readonly ancestry: {
    readonly african: number;
    readonly asian: number;
    readonly caucasian: number;
  };
  readonly eyes: string;
  /** null for no hair. */
  readonly hair: string | null;
  readonly eyebrows: string;
  readonly clothes: readonly string[];
  readonly shoes: string;
  readonly hat?: string;
}

/**
 * MakeHuman's age slider: 0 is 1 year, 0.1875 is 11, 0.5 is 25 and 1 is 90, straight lines
 * between.
 */
export function ageToMacro(years: number): number {
  if (years <= 11) return ((years - 1) / 10) * 0.1875;
  if (years <= 25) return 0.1875 + ((years - 11) / 14) * 0.3125;
  return 0.5 + ((years - 25) / 65) * 0.5;
}

/** The system pack's skin for a person: age band, largest ancestry share, body. */
export function skinFor(p: Person): string {
  const band = p.ageYears < 35 ? 'young' : p.ageYears < 60 ? 'middleage' : 'old';
  const [group] = (Object.entries(p.ancestry) as [string, number][]).sort(
    (a, b) => b[1] - a[1],
  )[0]!;
  return `${band}_${group}_${p.gender < 0.5 ? 'female' : 'male'}`;
}

type Result = { ok: true } | { ok: false; errors: string[] };

const in01 = (x: unknown) => typeof x === 'number' && x >= 0 && x <= 1;

export function validatePeople(people: readonly Person[]): Result {
  const errors: string[] = [];
  const seen = new Set<string>();
  people.forEach((p, i) => {
    const e = (m: string) => errors.push(`people[${i}] (${p.id ?? '?'}): ${m}`);
    if (!/^p\d{2}$/.test(p.id)) e('id must be p01 to p99.');
    else if (seen.has(p.id)) e('has the same id as an earlier person.');
    else seen.add(p.id);
    if (typeof p.name !== 'string' || !p.name.trim()) e('needs a name.');
    if (!(p.ageYears >= 1 && p.ageYears <= 90)) e('age must be 1 to 90 years.');
    if (!in01(p.gender)) e('gender must be 0 to 1.');
    for (const k of ['weight', 'muscle', 'height', 'proportions'] as const)
      if (!in01(p.build?.[k])) e(`build.${k} must be 0 to 1.`);
    const a = p.ancestry ?? {};
    const sum = (a.african ?? -1) + (a.asian ?? -1) + (a.caucasian ?? -1);
    if (![a.african, a.asian, a.caucasian].every(in01) || Math.abs(sum - 1) > 0.01)
      e('ancestry must be three shares from 0 to 1 that add up to 1.');
    const has = (list: readonly string[], x: unknown) => typeof x === 'string' && list.includes(x);
    if (!has(SYSTEM_ASSETS.eyes, p.eyes))
      e(`eyes must be one of ${SYSTEM_ASSETS.eyes.join(', ')}.`);
    if (p.hair !== null && !has(SYSTEM_ASSETS.hair, p.hair))
      e(`hair must be null or one of ${SYSTEM_ASSETS.hair.join(', ')}.`);
    if (!has(SYSTEM_ASSETS.eyebrows, p.eyebrows)) e('eyebrows must be eyebrow001 to eyebrow012.');
    if (!Array.isArray(p.clothes) || p.clothes.length === 0) e('needs clothes.');
    else
      for (const c of p.clothes)
        if (!has(SYSTEM_ASSETS.clothes, c)) e(`clothes: "${c}" is not in the system pack.`);
    if (!has(SYSTEM_ASSETS.shoes, p.shoes))
      e(`shoes must be one of ${SYSTEM_ASSETS.shoes.join(', ')}.`);
    if (p.hat !== undefined && !has(SYSTEM_ASSETS.hats, p.hat))
      e(`hat must be one of ${SYSTEM_ASSETS.hats.join(', ')}.`);
  });
  return errors.length ? { ok: false, errors } : { ok: true };
}

const buildWords = ({ weight, muscle, height }: Person['build']) =>
  [
    height < 0.4 ? 'shorter' : height > 0.65 ? 'taller' : '',
    weight < 0.4 ? 'slight' : weight > 0.65 ? 'larger' : '',
    muscle > 0.65 ? 'muscular' : '',
  ]
    .filter(Boolean)
    .join(', ') || 'average';

const ancestryWords = (a: Person['ancestry']) =>
  (
    [
      ['African', a.african],
      ['Asian', a.asian],
      ['Caucasian', a.caucasian],
    ] as const
  )
    .filter(([, v]) => v > 0)
    .sort((x, y) => y[1] - x[1])
    .map(([k, v]) => `${k} ${Math.round(v * 100)}%`)
    .join(', ');

/** The review table: one row per person, in plain words. */
export function peopleTable(people: readonly Person[]): string {
  return [
    '| # | Name | Age | Build | MakeHuman ancestry | Skin | Hair | Eyes | Clothes |',
    '|---|---|---|---|---|---|---|---|---|',
    ...people.map(
      (p, i) =>
        `| ${i + 1} | ${p.name} | ${p.ageYears} | ${buildWords(p.build)} | ${ancestryWords(p.ancestry)} | ${skinFor(p)} | ${p.hair ?? 'none'} | ${p.eyes} | ${[...p.clothes, p.shoes, ...(p.hat ? [p.hat] : [])].join(', ')} |`,
    ),
  ].join('\n');
}
