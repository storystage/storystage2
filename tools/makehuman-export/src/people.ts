/**
 * WP3.5: the everyday people made with MakeHuman (`people.json`), checked against the assets in
 * MakeHuman's CC0 system pack, and described in plain words for the owner's review of
 * respectful, varied representation (`people.md`).
 *
 * The pipeline that makes them (MPFB2 in Blender, headless, in the assets repository's CI) reads
 * the same file.
 */
import { descriptionProblem } from '@storystage/backstage';

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

/**
 * Plain glasses in the community's `glasses01_cc0.zip` (CC0), as its page lists them:
 * https://static.makehumancommunity.org/assets/assetpacks/glasses01.html. Only everyday frames:
 * the pack's costume and tinted ones (3-D glasses, goggles, sunglasses) aren't offered.
 */
export const GLASSES = [
  'kwnet_at_optical_glasses',
  'spamrakuen_sagerfrogs_glasses_01',
  'spamrakuen_sagerfrogs_glasses_02',
  'spamrakuen_sagerfrogs_glasses_03',
  'spamrakuen_sagerfrogs_glasses_04',
  'spamrakuen_tbm_glasses_frames_01',
] as const;

/**
 * Outfits in the pack that nobody wears (owner, 1 Nov 2026): the crop top and the short denim
 * shorts don't suit a tool for 6 to 13-year-olds, and the rest carry MakeHuman's logo.
 */
export const RETIRED_CLOTHES = [
  'female_sportsuit01',
  'female_casualsuit01',
  'female_casualsuit02',
  'male_casualsuit02',
  'male_casualsuit04',
  // Its T-shirt carries MakeHuman's logo too, faint once recoloured (found in the renders, 8 Nov).
  'male_casualsuit06',
] as const;

/**
 * Outfits worn only in their own colours: recolouring the plain shirt and grey jeans
 * (`male_casualsuit01`) leaves the shirt navy and stains the belt and the jeans' knees instead
 * (found in the renders, 8 Nov 2026).
 */
export const NOT_RECOLOURED = ['male_casualsuit01'] as const;

/**
 * Colours for an outfit, red, green and blue from 0 to 1, so 30 people don't look like a team in
 * uniform. The pipeline leaves denim alone and recolours the rest of the outfit.
 */
export const CLOTHES_COLOURS = {
  coral: [0.91, 0.45, 0.36],
  green: [0.3, 0.6, 0.35],
  lilac: [0.66, 0.55, 0.82],
  mustard: [0.85, 0.66, 0.2],
  plum: [0.52, 0.27, 0.5],
  rose: [0.85, 0.5, 0.6],
  rust: [0.7, 0.36, 0.2],
  teal: [0.16, 0.56, 0.58],
} as const;
export type ClothesColour = keyof typeof CLOTHES_COLOURS;

/**
 * Colours for an outfit's jeans, so not every child is in denim (owner, 16 Nov 2026): the
 * pipeline recolours the denim and keeps its folds. Only the outfits whose jeans are blue denim
 * (`WITH_JEANS`) can have them; the rest have no jeans, or grey ones the pipeline can't tell apart.
 */
export const TROUSERS_COLOURS = {
  black: [0.12, 0.12, 0.13],
  grey: [0.45, 0.46, 0.48],
  khaki: [0.62, 0.55, 0.38],
  navy: [0.14, 0.18, 0.34],
} as const;
export type TrousersColour = keyof typeof TROUSERS_COLOURS;
export const WITH_JEANS = ['male_casualsuit03', 'male_casualsuit05'] as const;

/**
 * The shirt's pattern, so not everyone wears the pack's stripes (owner, 17 Nov 2026): "plain"
 * smooths the stripes out of the picture and keeps its folds, and the others lay a pattern over
 * that: a gingham ("checks"), spots ("dots"), small five-petalled flowers ("flowers") or a
 * knitted fleck ("flecks").
 * Only for an outfit that is a shirt or a blouse on its own (`WITH_PATTERN`): the jacket outfit's
 * jacket shares the shirt's picture and would lose its own detail. It needs a `clothesColour`.
 */
export const PATTERNS = ['plain', 'checks', 'dots', 'flowers', 'flecks'] as const;
export type Pattern = (typeof PATTERNS)[number];
export const WITH_PATTERN = ['male_casualsuit03', 'female_elegantsuit01'] as const;

/** How long a skirt is: the pack's, to the knee, or to the ankle (owner, 17 Nov 2026). */
export const SKIRT_LENGTHS = ['ankle'] as const;
export type SkirtLength = (typeof SKIRT_LENGTHS)[number];

/**
 * Whether the pipeline levels a skirt's hem: the pack's skirt hangs to a point on a child (16 Nov
 * 2026) and, less, on some adults (Lin, Eileen), so every skirt's is levelled (owner, 17 Nov).
 */
export const straightHem = (p: Pick<Person, 'clothes'>): boolean =>
  p.clothes[0] === 'female_elegantsuit01';

/**
 * Headwear the pipeline makes itself (`make_people.py`), as no community pack has any (searched
 * 10 Nov 2026; the owner's choice of 16 Nov: make our own, CC0). Each is shaped from the person's
 * own head, so it fits and moves with it. A hijab, a turban and a patka cover the hair, so whoever
 * wears one has none (`hair: null`); a kippah sits on the hair.
 */
export const HEADWEAR = ['hijab', 'turban', 'patka', 'kippah'] as const;
export type Headwear = (typeof HEADWEAR)[number];
export const COVERS_HAIR: readonly Headwear[] = ['hijab', 'turban', 'patka'];

/**
 * Colours for headwear and hearing aids, red, green and blue from 0 to 1. Children's hearing aids
 * are bright, so they show on a small screen; adults' are grey or beige (owner, 16 Nov 2026).
 */
export const PIECE_COLOURS = {
  ...CLOTHES_COLOURS,
  beige: [0.82, 0.72, 0.6],
  black: [0.08, 0.08, 0.09],
  blue: [0.15, 0.45, 0.85],
  grey: [0.55, 0.56, 0.58],
  maroon: [0.45, 0.1, 0.15],
  navy: [0.1, 0.15, 0.35],
  purple: [0.5, 0.25, 0.75],
  red: [0.85, 0.15, 0.15],
  saffron: [0.95, 0.6, 0.1],
  white: [0.92, 0.92, 0.9],
} as const;
export type PieceColour = keyof typeof PIECE_COLOURS;

export interface Person {
  /** `p01` to `p30`; the Backstage id is `makehuman/Biped/<id>`. */
  readonly id: string;
  /** The name learners see in Backstage. */
  readonly name: string;
  /**
   * What they look like, for the Prompter's catalogue, search and screen readers: age, hair,
   * clothes, never skin colour or ancestry (owner, 8 Nov 2026; spec 17, section 1, rule 5).
   * Written from their render, so it changes when the render does.
   */
  readonly description: string;
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
  /**
   * The pack's hair comes in fixed colours, none of them grey, so older people's hair is tinted
   * in the pipeline (owner, 1 Nov 2026).
   */
  readonly hairTint?: 'grey' | 'white';
  readonly eyebrows: string;
  readonly clothes: readonly string[];
  /** The outfit's colour; left out, it keeps the pack's. */
  readonly clothesColour?: ClothesColour;
  /** The jeans' colour, for an outfit with jeans (`WITH_JEANS`); left out, they stay denim. */
  readonly trousersColour?: TrousersColour;
  /** The shirt's pattern (`PATTERNS`); left out, the pack's stripes. */
  readonly pattern?: Pattern;
  /** A skirt to the ankle (`SKIRT_LENGTHS`); left out, the pack's, to the knee. */
  readonly skirtLength?: SkirtLength;
  readonly shoes: string;
  readonly hat?: string;
  /** Glasses from the community's CC0 glasses pack (`GLASSES`). */
  readonly glasses?: string;
  /** Headwear the pipeline makes (`HEADWEAR`), in one of `PIECE_COLOURS`. */
  readonly headwear?: { readonly kind: Headwear; readonly colour: PieceColour };
  /** Behind-the-ear hearing aids, one on each ear, in one of `PIECE_COLOURS`. */
  readonly hearingAids?: PieceColour;
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
    const problem =
      typeof p.description === 'string'
        ? descriptionProblem(p.description)
        : 'needs a description.';
    if (problem) e(problem);
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
    if (p.hairTint !== undefined && (p.hair === null || !['grey', 'white'].includes(p.hairTint)))
      e('hairTint must be grey or white, on someone with hair.');
    if (!has(SYSTEM_ASSETS.eyebrows, p.eyebrows)) e('eyebrows must be eyebrow001 to eyebrow012.');
    if (!Array.isArray(p.clothes) || p.clothes.length === 0) e('needs clothes.');
    else
      for (const c of p.clothes)
        if (!has(SYSTEM_ASSETS.clothes, c)) e(`clothes: "${c}" is not in the system pack.`);
        else if (has(RETIRED_CLOTHES, c)) e(`clothes: "${c}" is retired.`);
    if (p.clothesColour !== undefined && !(p.clothesColour in CLOTHES_COLOURS))
      e(`clothesColour must be one of ${Object.keys(CLOTHES_COLOURS).join(', ')}.`);
    else if (p.clothesColour !== undefined && p.clothes?.some((c) => has(NOT_RECOLOURED, c)))
      e(`clothes: "${p.clothes.find((c) => has(NOT_RECOLOURED, c))}" can't be recoloured.`);
    if (p.trousersColour !== undefined && !(p.trousersColour in TROUSERS_COLOURS))
      e(`trousersColour must be one of ${Object.keys(TROUSERS_COLOURS).join(', ')}.`);
    else if (p.trousersColour !== undefined && !has(WITH_JEANS, p.clothes?.[0]))
      e(`trousersColour needs an outfit with jeans: ${WITH_JEANS.join(', ')}.`);
    if (p.pattern !== undefined && !has(PATTERNS, p.pattern))
      e(`pattern must be one of ${PATTERNS.join(', ')}.`);
    else if (p.pattern !== undefined && !has(WITH_PATTERN, p.clothes?.[0]))
      e(`pattern needs a shirt or blouse on its own: ${WITH_PATTERN.join(', ')}.`);
    else if (p.pattern !== undefined && p.clothesColour === undefined)
      e('pattern needs a clothesColour.');
    if (p.skirtLength !== undefined && !has(SKIRT_LENGTHS, p.skirtLength))
      e(`skirtLength must be one of ${SKIRT_LENGTHS.join(', ')}.`);
    else if (p.skirtLength !== undefined && p.clothes?.[0] !== 'female_elegantsuit01')
      e('skirtLength needs the skirt, female_elegantsuit01.');
    if (!has(SYSTEM_ASSETS.shoes, p.shoes))
      e(`shoes must be one of ${SYSTEM_ASSETS.shoes.join(', ')}.`);
    if (p.hat !== undefined && !has(SYSTEM_ASSETS.hats, p.hat))
      e(`hat must be one of ${SYSTEM_ASSETS.hats.join(', ')}.`);
    if (p.glasses !== undefined && !has(GLASSES, p.glasses))
      e(`glasses must be one of ${GLASSES.join(', ')}.`);
    const colours = Object.keys(PIECE_COLOURS);
    if (p.headwear !== undefined) {
      const w = p.headwear;
      if (typeof w !== 'object' || w === null || !has(HEADWEAR, w.kind))
        e(`headwear.kind must be one of ${HEADWEAR.join(', ')}.`);
      else {
        if (!has(colours, w.colour)) e(`headwear.colour must be one of ${colours.join(', ')}.`);
        if (COVERS_HAIR.includes(w.kind) && p.hair !== null)
          e(`a ${w.kind} covers the hair, so hair must be null.`);
        if (p.hat !== undefined) e("a hat and headwear can't be worn together.");
      }
    }
    if (p.hearingAids !== undefined && !has(colours, p.hearingAids))
      e(`hearingAids must be one of ${colours.join(', ')}.`);
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

const hairWords = (p: Person) =>
  p.hair === null
    ? p.headwear && COVERS_HAIR.includes(p.headwear.kind)
      ? 'covered'
      : 'none'
    : p.hairTint
      ? `${p.hair}, tinted ${p.hairTint}`
      : p.hair;

const clothesWords = (p: Person) =>
  [
    ...p.clothes.map((c) =>
      p.clothesColour ? `${c} (${[p.clothesColour, p.pattern].filter(Boolean).join(', ')})` : c,
    ),
    ...(p.trousersColour ? [`${p.trousersColour} trousers`] : []),
    ...(p.skirtLength ? [`skirt to the ${p.skirtLength}`] : []),
    p.shoes,
    ...(p.hat ? [p.hat] : []),
    ...(p.glasses ? [p.glasses] : []),
    ...(p.headwear ? [`${p.headwear.kind} (${p.headwear.colour}, made)`] : []),
    ...(p.hearingAids ? [`hearing aids (${p.hearingAids}, made)`] : []),
  ].join(', ');

/** The review table: one row per person, in plain words. */
export function peopleTable(people: readonly Person[]): string {
  return [
    '| # | Name | Age | Build | MakeHuman ancestry | Skin | Hair | Eyes | Clothes | Description (for the Prompter) |',
    '|---|---|---|---|---|---|---|---|---|---|',
    ...people.map(
      (p, i) =>
        `| ${i + 1} | ${p.name} | ${p.ageYears} | ${buildWords(p.build)} | ${ancestryWords(p.ancestry)} | ${skinFor(p)} | ${hairWords(p)} | ${p.eyes} | ${clothesWords(p)} | ${p.description} |`,
    ),
  ].join('\n');
}
