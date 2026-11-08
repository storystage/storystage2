import type { BackstageItem } from '@storystage/backstage';
import { exampleProduction, type Production } from '@storystage/production';
import type { BackstageId } from '@storystage/story-api';
import { describe, expect, it } from 'vitest';
import { filmCredits, usedModels, type FilmCreditable } from './credits.ts';

const item = (over: Partial<FilmCreditable> & Pick<FilmCreditable, 'id'>): FilmCreditable => ({
  section: 'cast',
  licence: 'CC0-1.0',
  credit: 'Something (CC0)',
  origin: 'shipped',
  ...over,
});
const id = (s: string) => s as BackstageId;

/** The example production, with these models in scene 1 and on its backdrop. */
function using(objects: readonly string[], backdrop: { ground?: string; sky?: string } = {}) {
  const p = exampleProduction();
  const [first, ...rest] = p.scenes;
  const setup = {
    ...first!.setup,
    backdrop: {
      ...(backdrop.ground ? { ground: id(backdrop.ground) } : {}),
      ...(backdrop.sky ? { sky: id(backdrop.sky) } : {}),
    },
    objects: objects.map((m, i) => ({
      ...first!.setup.objects[0]!,
      id: `o${i}` as never,
      model: m.startsWith('standIn:') ? { standIn: m.slice(8) } : id(m),
    })),
  };
  return {
    ...p,
    scenes: [
      { ...first!, setup },
      ...rest.map((s) => ({ ...s, setup: { ...s.setup, backdrop: {}, objects: [] } })),
    ],
  } satisfies Production;
}

const CAST: Readonly<Record<string, FilmCreditable>> = {
  owl: item({ id: id('sc/Flyer/owl'), credit: 'Owl from the StoryStage Cast (CC0)' }),
  cat: item({ id: id('sc/Quadruped/cat'), credit: 'Cat from the StoryStage Cast (CC0)' }),
  robot: item({ id: id('sc/Biped/robot'), credit: 'Robot from the StoryStage Cast (CC0)' }),
  knight: item({
    id: id('kk/Biped/knight'),
    credit: 'Knight by Kay Lousberg, KayKit (CC BY 4.0)',
    licence: 'CC-BY-4.0',
  }),
  mug: item({
    id: id('kk/Prop/mug'),
    section: 'props',
    credit: 'Mug by Kay Lousberg, KayKit (CC0)',
  }),
  grass: item({ id: id('bd/grass'), section: 'backdrops', credit: 'Grass by Poly Haven (CC0)' }),
  alice: item({
    id: id('Quadruped/Cat/AbyssinianCat'),
    credit: 'Abyssinian cat, from Alice 3 (permission)',
    licence: 'permission',
  }),
};
const find = (i: BackstageId) => Object.values(CAST).find((c) => c.id === i);

describe('usedModels', () => {
  it('lists each model once, from every scene and backdrop, leaving out stand-ins', () => {
    const p = using(['sc/Flyer/owl', 'standIn:box', 'sc/Flyer/owl'], { ground: 'bd/grass' });
    expect(usedModels(p)).toEqual(['bd/grass', 'sc/Flyer/owl']);
  });
});

describe('filmCredits', () => {
  it('runs: story and code, the models by section, sound, notices, then StoryStage', () => {
    const p = using(['sc/Flyer/owl', 'kk/Prop/mug'], { ground: 'bd/grass' });
    const withNames: Production = {
      ...p,
      manifest: {
        ...p.manifest,
        credits: { names: ['Ana', 'Sam'] },
        audio: [{ file: 'a.webm', scene: null, label: 'Rain on the window' }],
      },
    };
    const blocks = filmCredits(withNames, find, {
      notices: (i) => (i.licence === 'permission' ? 'CMU' : null),
    });
    expect(blocks.map((b) => b.heading)).toEqual([
      'Story and code',
      'Cast',
      'Props',
      'Backdrops',
      'Sound',
      null,
    ]);
    expect(blocks[0]!.lines.map((l) => l.text)).toEqual(['Ana', 'Sam']);
    expect(blocks[4]!.lines.map((l) => l.text)).toEqual(['Rain on the window']);
    expect(blocks.at(-1)!.lines.map((l) => l.text)).toEqual(['Made with StoryStage 2']);
  });

  it('leaves out story and code when there are no names, and sound when nothing was recorded', () => {
    const blocks = filmCredits(using(['sc/Flyer/owl']), find);
    expect(blocks.map((b) => b.heading)).toEqual(['Cast', null]);
  });

  it('groups shipped models from one source', () => {
    const blocks = filmCredits(
      using(['sc/Quadruped/cat', 'sc/Flyer/owl', 'sc/Biped/robot', 'kk/Biped/knight']),
      find,
    );
    expect(blocks[0]!.lines.map((l) => l.text)).toEqual([
      'Cat, Owl and Robot from the StoryStage Cast (CC0)',
      'Knight by Kay Lousberg, KayKit (CC BY 4.0)',
    ]);
  });

  it("gives a Creative Commons licence's name and deed", () => {
    const blocks = filmCredits(using(['kk/Biped/knight']), find);
    expect(blocks[0]!.lines[0]).toEqual({
      text: 'Knight by Kay Lousberg, KayKit (CC BY 4.0)',
      licence: { name: 'CC BY 4.0', url: 'https://creativecommons.org/licenses/by/4.0/' },
    });
  });

  it('marks a model the class imported, from the file, and never groups it', () => {
    const imported: BackstageItem = {
      ...(item({
        id: id('class/Biped/gran'),
        credit: 'Gran from the StoryStage Cast (CC0)',
        origin: 'imported',
      }) as BackstageItem),
    };
    const p = using(['sc/Flyer/owl', 'class/Biped/gran']);
    const packed: Production = {
      ...p,
      manifest: { ...p.manifest, models: [{ folder: 'gran', item: imported }] },
    };
    const blocks = filmCredits(packed, find);
    expect(blocks[0]!.lines).toEqual([
      { text: 'Gran from the StoryStage Cast (CC0)', imported: true },
      { text: 'Owl from the StoryStage Cast (CC0)' },
    ]);
  });

  it('adds each notice once, and leaves out a model nothing knows', () => {
    const blocks = filmCredits(
      using(['Quadruped/Cat/AbyssinianCat', 'Quadruped/Cat/AbyssinianCat', 'gone/model']),
      find,
      { notices: (i) => (i.licence === 'permission' ? 'Made with models from Alice, CMU.' : null) },
    );
    expect(blocks.map((b) => b.heading)).toEqual(['Cast', 'Notices', null]);
    expect(blocks[1]!.lines.map((l) => l.text)).toEqual(['Made with models from Alice, CMU.']);
  });

  it('takes the headings in another language, and keeps the rest as it is', () => {
    const blocks = filmCredits(using(['sc/Flyer/owl']), find, {
      headings: { cast: 'Reparto' },
    });
    expect(blocks[0]!.heading).toBe('Reparto');
    expect(blocks.at(-1)!.lines[0]!.text).toBe('Made with StoryStage 2');
  });
});
