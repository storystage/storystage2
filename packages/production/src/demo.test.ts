import { describe, expect, it } from 'vitest';
import { BACKDROP_TEMPLATES, GROUND_TYPES } from '@storystage/stage';
import { demoProduction, exampleProduction } from './example.ts';
import { openProduction, saveProduction } from './file.ts';
import { checkReferences } from './types.ts';

describe('demoProduction (what ?example plays)', () => {
  const demo = demoProduction();

  it('is the example film, with references that all hold', () => {
    const example = exampleProduction();
    expect(demo.scenes.map((s) => s.id)).toEqual(example.scenes.map((s) => s.id));
    expect(demo.script).toEqual(example.script);
    expect(demo.manifest.runningOrder).toEqual(example.manifest.runningOrder);
    expect(checkReferences(demo)).toEqual([]);
  });

  it('uses only the stage’s built-in backdrops, so a real stage finds them', () => {
    const skies = new Set(BACKDROP_TEMPLATES.map((t) => t.backdrop.sky));
    const lighting = new Set(BACKDROP_TEMPLATES.map((t) => t.backdrop.lighting));
    for (const { setup } of demo.scenes) {
      expect(GROUND_TYPES).toContain(setup.backdrop.ground);
      expect(skies.has(setup.backdrop.sky)).toBe(true);
      expect(lighting.has(setup.backdrop.lighting)).toBe(true);
    }
  });

  it('plays its cast as stand-ins of their real size, needing no model files', () => {
    const refs = [
      ...demo.scenes.flatMap((s) => s.setup.objects.map((o) => o.model)),
      ...demo.storyboard.cards.flatMap((c) => c.cast),
      ...demo.frames.flatMap((f) => f.sketches.map((k) => k.item)),
    ];
    for (const ref of refs) {
      expect(typeof ref).toBe('object');
      if (typeof ref === 'object') expect(ref.size).toBeDefined();
    }
  });

  it('saves and opens again unchanged (format 1.2.0)', () => {
    const opened = openProduction(saveProduction(demo));
    expect(opened.status).toBe('ok');
    if (opened.status === 'ok') expect(opened.production).toEqual(demo);
  });
});
