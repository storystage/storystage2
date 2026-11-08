import { describe, expect, it } from 'vitest';
import {
  MANIFEST_VERSION,
  SHIPPED_LICENCES,
  creditLines,
  mayDistribute,
  validateManifest,
} from './manifest.ts';

const cat = {
  id: 'kenney/Quadruped/cat',
  section: 'cast',
  class: 'Quadruped',
  displayName: 'Cat',
  themes: ['animals'],
  files: { model: 'models/kenney/cat.glb', thumbnail: 'thumbs/kenney/cat.webp' },
  joints: ['head', 'neck'],
  defaultSize: { height: 0.3 },
  budget: { triangles: 4386, textureMaxPx: 512 },
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

  it('ships only the licences the audit allows: CC0, CC BY and written permission', () => {
    for (const licence of ['CC-BY-SA-4.0', 'CC-BY-NC-4.0', 'own-work', 'not-sure']) {
      const r = validateManifest(manifest({ ...cat, licence }));
      expect(r.ok, licence).toBe(false);
      if (!r.ok) expect(r.errors.join('\n')).toMatch(/shipped/);
    }
    for (const licence of ['CC0-1.0', 'CC-BY-3.0', 'CC-BY-4.0'])
      expect(validateManifest(manifest({ ...cat, licence })).ok, licence).toBe(true);
    // A class may still import a share-alike or non-commercial model (3.12).
    const imported = { ...cat, origin: 'imported' };
    expect(validateManifest(manifest({ ...imported, licence: 'CC-BY-SA-4.0' })).ok).toBe(true);
    expect(validateManifest(manifest({ ...imported, licence: 'CC-BY-NC-4.0' })).ok).toBe(true);
    expect(SHIPPED_LICENCES).toEqual(['CC0-1.0', 'CC-BY-3.0', 'CC-BY-4.0', 'permission']);
  });

  it('needs what every model was reduced to', () => {
    const noBudget = { ...cat, budget: undefined };
    for (const bad of [
      noBudget,
      { ...cat, budget: { triangles: -1, textureMaxPx: 512 } },
      { ...cat, budget: { triangles: 4386.5, textureMaxPx: 512 } },
      { ...cat, budget: { triangles: 4386 } },
    ]) {
      const r = validateManifest(manifest(bad));
      expect(r.ok).toBe(false);
      if (!r.ok) expect(r.errors.join('\n')).toMatch(/budget/);
    }
    // A model with no textures has a largest texture of 0.
    expect(
      validateManifest(manifest({ ...cat, budget: { triangles: 12, textureMaxPx: 0 } })).ok,
    ).toBe(true);
  });

  it('takes a short one-line description, or none', () => {
    const described = (description: unknown) =>
      validateManifest(manifest({ ...cat, description })).ok;
    expect(described('a ginger cat with a white chest')).toBe(true);
    expect(validateManifest(manifest(cat)).ok).toBe(true);
    expect(described('')).toBe(false);
    expect(described('two\nlines')).toBe(false);
    expect(described('x'.repeat(121))).toBe(false);
    expect(described(7)).toBe(false);
  });

  it("records a VRM file's version, and nothing else there", () => {
    expect(validateManifest(manifest({ ...cat, vrm: '0' })).ok).toBe(true);
    expect(validateManifest(manifest({ ...cat, vrm: '1' })).ok).toBe(true);
    expect(validateManifest(manifest({ ...cat, vrm: '2' })).ok).toBe(false);
  });

  it('refuses the wrong version and junk', () => {
    expect(MANIFEST_VERSION).toBe('2.1.0');
    expect(validateManifest({ manifestVersion: '1.0.0', items: [] }).ok).toBe(false);
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
