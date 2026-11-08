import { describe, expect, it } from 'vitest';
import { CHANGED, LICENCE_LINKS, creditFor, creditsBySection, type Creditable } from './credits.ts';
import { LICENCES } from './manifest.ts';

const item = (over: Record<string, unknown> & { id: string }): Creditable =>
  ({
    section: 'cast',
    licence: 'CC0-1.0',
    credit: `${over.id} by someone (CC0)`,
    source: { url: `https://example.org/${over.id}` },
    ...over,
  }) as unknown as Creditable;

describe('creditsBySection', () => {
  const sections = creditsBySection([
    item({ id: 'b/Prop/mug', section: 'props', credit: 'Mug by Kay Lousberg, KayKit (CC0)' }),
    item({ id: 'a/Biped/knight', credit: 'Knight by Kay Lousberg, KayKit (CC0)' }),
    item({ id: 'c/Biped/alfie', credit: 'Alfie, made with MakeHuman (CC0)' }),
    item({ id: 'a/Biped/knight', credit: 'Knight by Kay Lousberg, KayKit (CC0)' }),
    item({
      id: 'd/Set/tree',
      section: 'set',
      licence: 'CC-BY-4.0',
      credit: 'Tree by Ann, CC BY 4.0, via Poly Pizza, changed for StoryStage',
    }),
  ]);

  it('groups the credits as Cast, Props, Set and Backdrops, leaving out empty sections', () => {
    expect(sections.map((s) => s.title)).toEqual(['Cast', 'Props', 'Set']);
  });

  it('lists each model once, in alphabetical order within its section', () => {
    expect(sections[0]!.lines.map((l) => l.text)).toEqual([
      'Alfie, made with MakeHuman (CC0)',
      'Knight by Kay Lousberg, KayKit (CC0)',
    ]);
  });

  it("gives each line its licence's name and link, and the model's own page", () => {
    expect(sections[2]!.lines[0]).toEqual({
      id: 'd/Set/tree',
      text: 'Tree by Ann, CC BY 4.0, via Poly Pizza, changed for StoryStage',
      licence: { name: 'CC BY 4.0', url: 'https://creativecommons.org/licenses/by/4.0/' },
      source: 'https://example.org/d/Set/tree',
    });
  });

  it('leaves out the licence link where there is none, and the page where there is none', () => {
    const [own] = creditsBySection([
      item({
        id: 'class/Biped/robot',
        licence: 'own-work',
        credit: 'Robot by Sam',
        source: undefined,
      }),
    ]);
    expect(own!.lines[0]).toEqual({ id: 'class/Biped/robot', text: 'Robot by Sam' });
  });

  it('is empty for no models', () => {
    expect(creditsBySection([])).toEqual([]);
  });
});

describe('LICENCE_LINKS', () => {
  it('names and links every Creative Commons licence on the list', () => {
    for (const licence of LICENCES.filter((l) => l.startsWith('CC')))
      expect(LICENCE_LINKS[licence]?.url).toMatch(/^https:\/\/creativecommons\.org\//);
  });
});

describe('creditFor', () => {
  const tree = { licence: 'CC-BY-4.0', credit: 'Tree by Ann, CC BY 4.0, via Poly Pizza' } as const;

  it('says a changed CC BY model was changed (owner, 8 Nov 2026)', () => {
    expect(creditFor(tree, true)).toBe(`Tree by Ann, CC BY 4.0, via Poly Pizza${CHANGED}`);
    expect(creditFor({ ...tree, licence: 'CC-BY-SA-4.0' }, true)).toMatch(
      /changed for StoryStage$/,
    );
    expect(creditFor({ ...tree, licence: 'CC-BY-NC-4.0' }, true)).toMatch(
      /changed for StoryStage$/,
    );
  });

  it('says it only once, and only when it was changed', () => {
    expect(creditFor({ ...tree, credit: creditFor(tree, true) }, true)).toBe(creditFor(tree, true));
    expect(creditFor(tree, false)).toBe(tree.credit);
  });

  it('leaves other licences as written: CC0 and permission ask for no such notice', () => {
    expect(creditFor({ licence: 'CC0-1.0', credit: 'Knight (CC0)' }, true)).toBe('Knight (CC0)');
    expect(creditFor({ licence: 'permission', credit: 'Cat, CMU' }, true)).toBe('Cat, CMU');
  });
});
