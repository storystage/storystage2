import { describe, expect, it } from 'vitest';
import { mayDistribute, validateManifest, MANIFEST_VERSION } from '@storystage/backstage';
import { LICENCE_CHOICES, licenceRecord, type LicenceAnswers } from './licence.ts';

const page = 'https://example.org/models/robot';
const made = (answers: LicenceAnswers, name = 'Robot') => {
  const r = licenceRecord(name, answers);
  if (!r.ok) throw new Error(r.problems.join(', '));
  return r.record;
};

describe('licenceRecord (spec 17, section 6)', () => {
  it('makes each credit line from the short list', () => {
    expect(made({ choice: 'CC0', sourceUrl: page, maker: 'A. Maker' }).credit).toBe(
      'Robot by A. Maker (CC0)',
    );
    expect(made({ choice: 'CC0', sourceUrl: page }).credit).toBe('Robot (CC0)');
    expect(made({ choice: 'CC BY', sourceUrl: page, maker: 'A. Maker' })).toEqual({
      licence: 'CC-BY-4.0',
      credit: 'Robot by A. Maker, CC BY 4.0, changed for StoryStage',
      source: { url: page },
    });
    expect(
      made({ choice: 'CC BY', version: '3.0', sourceUrl: page, maker: 'A. Maker' }),
    ).toMatchObject({
      licence: 'CC-BY-3.0',
      credit: 'Robot by A. Maker, CC BY 3.0, changed for StoryStage',
    });
    expect(made({ choice: 'CC BY-SA', sourceUrl: page, maker: 'A. Maker' }).credit).toBe(
      'Robot by A. Maker, CC BY-SA 4.0, changed for StoryStage',
    );
    expect(made({ choice: 'CC BY-NC', sourceUrl: page, maker: 'A. Maker' }).licence).toBe(
      'CC-BY-NC-4.0',
    );
    expect(made({ choice: 'own-work' })).toEqual({
      licence: 'own-work',
      credit: 'Robot, made by our class',
    });
    expect(made({ choice: 'not-sure', sourceUrl: page }).credit).toBe('Robot, source not checked');
  });

  it("never puts a learner's name in an own-work credit", () => {
    expect(made({ choice: 'own-work', maker: 'Sam' }).credit).toBe('Robot, made by our class');
  });

  it('asks for a page except for "I made it", and a maker for every CC BY', () => {
    expect(licenceRecord('Robot', { choice: 'CC BY' })).toEqual({
      ok: false,
      problems: ['needsMaker', 'needsSource'],
    });
    expect(licenceRecord('Robot', { choice: 'not-sure' })).toMatchObject({
      problems: ['needsSource'],
    });
    expect(licenceRecord(' ', { choice: 'own-work' })).toMatchObject({ problems: ['needsName'] });
  });

  it('keeps only web pages, with no name or password in them', () => {
    for (const bad of [
      'javascript:alert(1)',
      'file:///C:/x.glb',
      'not a page',
      'https://u:p@example.org/',
    ])
      expect(licenceRecord('Robot', { choice: 'CC0', sourceUrl: bad })).toMatchObject({
        problems: ['badSource'],
      });
    expect(licenceRecord('Robot', { choice: 'own-work', sourceUrl: 'nope' })).toMatchObject({
      problems: ['badSource'],
    });
  });

  it('puts names on one line', () => {
    expect(
      made({ choice: 'CC0', sourceUrl: page, maker: 'A.\n  Maker' }, 'Big\trobot').credit,
    ).toBe('Big robot by A. Maker (CC0)');
  });

  it('gives records the manifest accepts, and flags the ones that stay in class', () => {
    for (const choice of LICENCE_CHOICES) {
      const record = made({ choice, sourceUrl: page, maker: 'A. Maker' });
      const item = {
        id: 'class/Prop/robot',
        section: 'props',
        class: 'Prop',
        displayName: 'Robot',
        themes: [],
        files: { model: 'model.glb', thumbnail: 'thumbnail.webp' },
        joints: 'prop-only',
        defaultSize: { height: 1 },
        budget: { triangles: 10, textureMaxPx: 0 },
        origin: 'imported',
        sketches: [],
        ...record,
      };
      expect(validateManifest({ manifestVersion: MANIFEST_VERSION, items: [item] })).toMatchObject({
        ok: true,
      });
      expect(mayDistribute({ licence: record.licence, displayName: 'Robot' }).allowed).toBe(
        choice !== 'CC BY-NC' && choice !== 'not-sure',
      );
    }
  });
});
