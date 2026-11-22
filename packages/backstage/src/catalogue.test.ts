import { describe, expect, it } from 'vitest';
import {
  CATALOGUE_INDEX_TOKEN_BUDGET,
  catalogueData,
  catalogueJson,
  catalogueText,
  catalogueTokens,
  descriptionProblem,
  jointsFor,
  renderIndex,
  searchCatalogue,
} from './catalogue.ts';
import { MANIFEST_VERSION, type BackstageItem, type BackstageManifest } from './manifest.ts';

const BODY = ['hips', 'spine', 'head', 'leftUpperArm', 'rightUpperArm'];
const HANDS = [...BODY, 'leftThumbProximal', 'rightThumbProximal'];

const item = (over: Record<string, unknown> & { id: string }): BackstageItem =>
  ({
    section: 'cast',
    class: 'Biped',
    displayName: over.id.split('/').pop(),
    themes: ['everyday'],
    files: { model: 'm.glb', thumbnail: 't.svg' },
    joints: BODY,
    defaultSize: { height: 1.7 },
    budget: { triangles: 100, textureMaxPx: 0 },
    licence: 'CC0-1.0',
    credit: 'by someone (CC0)',
    source: { url: 'https://example.org', retrieved: '2026-11-08' },
    origin: 'shipped',
    sketches: [],
    ...over,
  }) as unknown as BackstageItem;

const manifest = (...items: BackstageItem[]): BackstageManifest => ({
  manifestVersion: MANIFEST_VERSION,
  items,
});

const shipped = manifest(
  item({
    id: 'makehuman/Biped/p01',
    displayName: 'Alfie',
    description: 'a boy of 6 with short brown hair, in a blue shirt and jeans',
    themes: ['everyday', 'children'],
    joints: HANDS,
    defaultSize: { height: 1 },
  }),
  item({ id: 'kaykit/Biped/knight', displayName: 'Knight', themes: ['fantasy'] }),
  item({
    id: 'kaykit/Prop/mug',
    displayName: 'Mug',
    section: 'props',
    class: 'Prop',
    themes: [],
    joints: 'prop-only',
    defaultSize: { height: 0.12 },
  }),
  item({ id: 'class/Biped/my-robot', displayName: 'My robot', origin: 'imported' }),
);

describe('catalogueText', () => {
  const text = catalogueText(shipped);

  it('lists every shipped model by section and class, with its exact id', () => {
    expect(text).toContain(
      '    makehuman/Biped/p01: Alfie, a boy of 6 with short brown hair, in a blue shirt and jeans [everyday, children] 1 m, joints J2',
    );
    expect(text).toContain('    kaykit/Biped/knight: Knight [fantasy] 1.7 m, joints J1');
    expect(text).toContain('    kaykit/Prop/mug: Mug 0.12 m, no joints');
    const at = (s: string) => text.indexOf(s);
    expect(at('\nCast\n')).toBeLessThan(at('kaykit/Biped/knight'));
    expect(at('kaykit/Biped/knight')).toBeLessThan(at('makehuman/Biped/p01'));
    expect(at('makehuman/Biped/p01')).toBeLessThan(at('\nProps\n'));
    expect(at('\nProps\n')).toBeLessThan(at('kaykit/Prop/mug'));
  });

  it('leaves out imported models: they are learners’ words, sent as data (spec 04, 2.1)', () => {
    expect(text).not.toContain('my-robot');
    expect(text).not.toContain('My robot');
  });

  it('lists each joint set once, numbered as they first appear', () => {
    expect(text).toContain(`  J1: ${BODY.join(', ')}`);
    expect(text).toContain(`  J2: ${HANDS.join(', ')}`);
    expect(text.match(/ {2}J\d+:/g)).toHaveLength(2);
  });

  it('names every section, saying when one has nothing yet', () => {
    expect(text).toContain('\nSet\n  (none yet)\n');
    expect(text).toContain('\nBackdrops\n  (none yet)\n');
  });

  it('lists backdrops without a size or joints, and says they are set, not added', () => {
    const withGround = catalogueText(
      manifest(
        ...shipped.items,
        item({
          id: 'storystage/Ground/grass',
          section: 'backdrops',
          class: 'Ground',
          displayName: 'Grass',
          description: 'short green grass',
          themes: ['nature'],
          joints: 'prop-only',
          defaultSize: { height: 1 },
        }),
      ),
    );
    expect(withGround).toContain(
      "\nBackdrops\n  A scene's ground or sky: set it as the scene's backdrop, never add it as a model.\n  Ground\n    storystage/Ground/grass: Grass, short green grass [nature]\n",
    );
  });

  it('is the same text whatever order the manifest lists them in', () => {
    // The native layer pins the system prompt's hash for a release (spec 04, section 1.8).
    const reversed = manifest(...[...shipped.items].reverse());
    expect(catalogueText(reversed)).toBe(text);
  });
});

describe('catalogueTokens', () => {
  it('counts three characters a token, which overcounts on purpose (spec 04, 2.1)', () => {
    expect(catalogueTokens('abcdef')).toBe(2);
    expect(catalogueTokens('abcdefg')).toBe(3);
  });

  // The real check is the build's, on the real manifest (tools/backstage-sources); this one
  // keeps each index line short enough for about 400 models in half the index's budget.
  it("fits 400 models' index lines in 6,000 tokens, half the index's budget", () => {
    const many = Array.from({ length: 400 }, (_, i) =>
      item({
        id: `makehuman/Biped/p${String(i).padStart(3, '0')}`,
        displayName: 'Margaret',
        description: 'an older woman of 72 with a grey bob, in a pink striped blouse and skirt',
        themes: ['everyday', 'older people'],
        joints: HANDS,
      }),
    );
    expect(catalogueTokens(renderIndex(catalogueData(manifest(...many))))).toBeLessThan(
      CATALOGUE_INDEX_TOKEN_BUDGET / 2,
    );
  });
});

describe('descriptionProblem', () => {
  it('accepts one plain line about what someone looks like', () => {
    expect(descriptionProblem('a girl of 7 with an afro, in a yellow T-shirt and jeans')).toBe(
      null,
    );
    expect(descriptionProblem('an older woman of 85 with a white bob')).toBe(null);
  });

  it('refuses skin colour and ancestry words (spec 17, section 1, rule 5)', () => {
    for (const words of [
      'a boy with dark skin',
      'an Asian woman',
      'a Caucasian man',
      'an African girl',
      'a man of mixed race',
      'a woman of South Asian ancestry',
      'her complexion is fair',
    ])
      expect(descriptionProblem(words)).toMatch(/skin colour or ancestry/);
  });

  it('refuses an empty, long or two-line description', () => {
    expect(descriptionProblem('')).toMatch(/one line/);
    expect(descriptionProblem('two\nlines')).toMatch(/one line/);
    expect(descriptionProblem('x'.repeat(121))).toMatch(/120/);
  });
});

// Spec 04, section 2.7; spec 17, section 4a (the owner's choice of 21 Nov 2026): the Prompter's
// system prompt holds the index, and each request the full lines that matter to it.
const withGround = manifest(
  ...shipped.items,
  item({
    id: 'storystage/Ground/grass',
    section: 'backdrops',
    class: 'Ground',
    displayName: 'Grass',
    description: 'short green grass',
    themes: ['nature'],
    joints: 'prop-only',
    defaultSize: { height: 1 },
  }),
);

describe('catalogueData', () => {
  const data = catalogueData(withGround);
  const byId = (id: string) => data.items.find((i) => i.id === id)!;

  it('lists shipped models only, by section, then class, then id', () => {
    expect(data.items.map((i) => i.id)).toEqual([
      'kaykit/Biped/knight',
      'makehuman/Biped/p01',
      'kaykit/Prop/mug',
      'storystage/Ground/grass',
    ]);
  });

  it('gives each model its full line exactly as the text has it, and its index line', () => {
    const text = catalogueText(withGround);
    for (const i of data.items) expect(text).toContain(`\n    ${i.line}\n`);
    expect(byId('makehuman/Biped/p01')).toMatchObject({
      section: 'cast',
      class: 'Biped',
      name: 'Alfie',
      joints: 'J2',
      short: 'makehuman/Biped/p01: Alfie (J2)',
    });
    expect(byId('kaykit/Prop/mug')).toMatchObject({
      joints: 'none',
      short: 'kaykit/Prop/mug: Mug (no joints)',
    });
    expect(byId('storystage/Ground/grass').short).toBe('storystage/Ground/grass: Grass');
  });

  it('numbers the joint sets as the text does, with their joints', () => {
    expect(data.joints).toEqual({ J1: BODY, J2: HANDS });
  });

  it('gives each model its words once, lower-cased, without the commonest', () => {
    const words = byId('makehuman/Biped/p01').words;
    expect(words).toEqual(
      expect.arrayContaining(['alfie', 'boy', '6', 'brown', 'jeans', 'children', 'biped']),
    );
    expect(words).not.toContain('a');
    expect(words).not.toContain('in');
    expect(new Set(words).size).toBe(words.length);
  });

  it('is the same JSON whatever order the manifest lists them in', () => {
    const json = catalogueJson(withGround);
    expect(catalogueJson(manifest(...[...withGround.items].reverse()))).toBe(json);
    expect(json.endsWith('}\n')).toBe(true);
    expect(JSON.parse(json)).toEqual(data);
  });
});

describe('renderIndex', () => {
  const index = renderIndex(catalogueData(withGround));

  it('lists every model by section and class with its id, name and joint set', () => {
    expect(index).toContain(
      '\nCast\n  Biped\n    kaykit/Biped/knight: Knight (J1)\n    makehuman/Biped/p01: Alfie (J2)\n',
    );
    expect(index).toContain('\nProps\n  Prop\n    kaykit/Prop/mug: Mug (no joints)\n');
    expect(index).toContain('\nSet\n  (none yet)\n');
    expect(index).toContain(
      "\nBackdrops\n  A scene's ground or sky: set it as the scene's backdrop, never add it as a model.\n  Ground\n    storystage/Ground/grass: Grass\n",
    );
  });

  it("leaves the joint sets' lists and the models' descriptions to the full lines", () => {
    expect(index).not.toContain('Joint sets');
    expect(index).not.toContain('leftUpperArm');
    expect(index).not.toContain('short brown hair');
    expect(index).toContain('come with its full line');
  });

  it('is the same text whatever order the manifest lists them in', () => {
    expect(renderIndex(catalogueData(manifest(...[...withGround.items].reverse())))).toBe(index);
  });
});

describe('jointsFor', () => {
  const data = catalogueData(withGround);

  it('gives the joints of each set the models name, once each, and none for a prop', () => {
    const [knight, alfie, mug] = data.items;
    expect(jointsFor(data, [alfie!, mug!])).toEqual({ J2: HANDS });
    expect(jointsFor(data, [alfie!, knight!, alfie!])).toEqual({ J1: BODY, J2: HANDS });
    expect(jointsFor(data, [mug!])).toEqual({});
  });
});

describe('searchCatalogue', () => {
  const data = catalogueData(
    manifest(
      ...withGround.items,
      item({
        id: 'polypizza/Prop/mug-tree',
        section: 'props',
        class: 'Prop',
        displayName: 'Mug tree',
        description: 'a wooden stand for mugs',
        themes: ['kitchen'],
        joints: 'prop-only',
      }),
      item({
        id: 'polypizza/Prop/cupboard',
        section: 'set',
        class: 'Prop',
        displayName: 'Cupboard',
        description: 'a tall cupboard full of mugs',
        themes: ['kitchen'],
        joints: 'prop-only',
      }),
    ),
  );
  const ids = (words: string | string[], options?: Parameters<typeof searchCatalogue>[2]) =>
    searchCatalogue(data.items, words, options).map((i) => i.id);

  it('puts a name match first, folds plain plurals, and leaves out what no word matches', () => {
    // "mugs" is a name word of both mugs (3 each), only a description word of the cupboard (1).
    expect(ids('three mugs')).toEqual([
      'kaykit/Prop/mug',
      'polypizza/Prop/mug-tree',
      'polypizza/Prop/cupboard',
    ]);
  });

  it('adds up the words, so a model matching more of them comes first', () => {
    expect(ids(['a mug', 'in the kitchen'])[0]).toBe('polypizza/Prop/mug-tree');
  });

  it('matches themes and class, and breaks ties by section, then id', () => {
    expect(ids('biped')).toEqual(['kaykit/Biped/knight', 'makehuman/Biped/p01']);
    expect(ids('children')).toEqual(['makehuman/Biped/p01']);
  });

  it('keeps to one section, and to a limit', () => {
    expect(ids('mug', { section: 'set' })).toEqual(['polypizza/Prop/cupboard']);
    expect(ids('mug', { limit: 1 })).toEqual(['kaykit/Prop/mug']);
  });

  it('finds nothing for no words, or only the commonest', () => {
    expect(ids('')).toEqual([]);
    expect(ids('a the with')).toEqual([]);
  });
});
