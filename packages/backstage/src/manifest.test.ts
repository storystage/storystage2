import { describe, expect, it } from 'vitest';
import { MANIFEST_VERSION, creditLines, mayDistribute, validateManifest } from './manifest.ts';

const cat = {
  id: 'kenney/Quadruped/cat',
  section: 'cast',
  class: 'Quadruped',
  displayName: 'Cat',
  themes: ['animals'],
  files: { model: 'models/kenney/cat.glb', thumbnail: 'thumbs/kenney/cat.webp' },
  joints: ['head', 'neck'],
  defaultSize: { height: 0.3 },
  licence: 'CC0-1.0',
  credit: 'Cat by Kenney (CC0)',
  source: { url: 'https://kenney.nl/assets', retrieved: '2026-10-20' },
  origin: 'shipped',
  sketches: [{ facing: 'front', file: 'sketches/kenney/cat-front.svg' }],
};
const manifest = (...items: unknown[]) => ({ manifestVersion: MANIFEST_VERSION, items });

describe('validateManifest', () => {
  it('accepts a complete item', () => {
    expect(validateManifest(manifest(cat))).toMatchObject({ ok: true });
  });

  it('needs a section, a licence and a credit for every item', () => {
    const r = validateManifest(
      manifest({ ...cat, section: 'scenery', licence: 'MIT', credit: ' ' }),
    );
    expect(r.ok).toBe(false);
    if (r.ok) return;
    expect(r.errors.join('\n')).toMatch(/section/);
    expect(r.errors.join('\n')).toMatch(/licence/);
    expect(r.errors.join('\n')).toMatch(/credit/);
  });

  it('refuses duplicate ids, a missing source, and "not sure" in a shipped model', () => {
    const r = validateManifest(
      manifest(
        cat,
        cat,
        { ...cat, id: 'x', source: undefined },
        { ...cat, id: 'y', licence: 'not-sure' },
      ),
    );
    expect(r.ok).toBe(false);
    if (r.ok) return;
    expect(r.errors).toHaveLength(3);
  });

  it('lets own work leave out the source, and accepts prop-only joints', () => {
    const own = {
      ...cat,
      id: 'class/Prop/box',
      class: 'Prop',
      section: 'props',
      joints: 'prop-only',
      licence: 'own-work',
      source: undefined,
      origin: 'imported',
    };
    expect(validateManifest(manifest(own))).toMatchObject({ ok: true });
  });

  it('needs a permission record for a "permission" licence', () => {
    expect(validateManifest(manifest({ ...cat, licence: 'permission' })).ok).toBe(false);
    expect(
      validateManifest(manifest({ ...cat, licence: 'permission', permission: 'docs/legal/cmu.md' }))
        .ok,
    ).toBe(true);
  });

  it('refuses the wrong version and junk', () => {
    expect(validateManifest({ manifestVersion: '0.1', items: [] }).ok).toBe(false);
    expect(validateManifest(null).ok).toBe(false);
    expect(validateManifest(manifest('cat')).ok).toBe(false);
  });
});

describe('mayDistribute', () => {
  it('keeps non-commercial and "not sure" models in school, with a plain reason', () => {
    expect(mayDistribute({ licence: 'CC0-1.0', displayName: 'Cat' })).toEqual({ allowed: true });
    expect(mayDistribute({ licence: 'CC-BY-4.0', displayName: 'Cat' })).toEqual({ allowed: true });
    const nc = mayDistribute({ licence: 'CC-BY-NC-4.0', displayName: 'Dragon' });
    expect(nc.allowed).toBe(false);
    if (!nc.allowed) expect(nc.reason).toMatch(/Dragon/);
    expect(mayDistribute({ licence: 'not-sure', displayName: 'Robot' }).allowed).toBe(false);
  });
});

describe('creditLines', () => {
  it('lists each model once, in a stable order', () => {
    const lines = creditLines([
      { id: 'b' as never, credit: 'B by someone' },
      { id: 'a' as never, credit: 'A by someone' },
      { id: 'b' as never, credit: 'B by someone' },
    ]);
    expect(lines).toEqual(['A by someone', 'B by someone']);
  });
});
