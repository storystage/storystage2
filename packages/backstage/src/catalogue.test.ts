import { describe, expect, it } from 'vitest';
import {
  CATALOGUE_TOKEN_BUDGET,
  catalogueText,
  catalogueTokens,
  descriptionProblem,
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
  // keeps each line short enough for about 200 described people.
  it('fits 200 described people in the budget of 12,000 tokens', () => {
    const many = Array.from({ length: 200 }, (_, i) =>
      item({
        id: `makehuman/Biped/p${String(i).padStart(3, '0')}`,
        displayName: 'Margaret',
        description: 'an older woman of 72 with a grey bob, in a pink striped blouse and skirt',
        themes: ['everyday', 'older people'],
        joints: HANDS,
      }),
    );
    expect(catalogueTokens(catalogueText(manifest(...many)))).toBeLessThan(CATALOGUE_TOKEN_BUDGET);
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
