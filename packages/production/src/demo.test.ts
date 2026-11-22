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

  it('stands its cast where its frames show them, so the check flags nothing (S1, 15 Nov)', () => {
    // As `packages/check` sees it: the camera looks along +Z, so the world's +X is the picture's
    // left; a character faces its own +Z; unflipped, a side or three-quarter sketch faces left.
    for (const frame of demo.frames) {
      const setup = demo.scenes.find((s) => s.id === frame.scene)!.setup;
      const camera = setup.camera.transform;
      expect(camera.rotation).toEqual({ x: 0, y: 0, z: 0, w: 1 });
      for (const k of frame.sketches) {
        const o = setup.objects.find(
          (x) =>
            typeof x.model === 'object' &&
            typeof k.item === 'object' &&
            x.model.standIn === k.item.standIn,
        )!;
        const { x: qx, y: qy, z: qz, w: qw } = o.transform.rotation;
        // Its own +Z, turned: the third column of the rotation.
        const ahead = { x: 2 * (qx * qz + qw * qy), z: 1 - 2 * (qx * qx + qy * qy) };
        const toCamera = {
          x: camera.position.x - o.transform.position.x,
          z: camera.position.z - o.transform.position.z,
        };
        const cos =
          (ahead.x * toCamera.x + ahead.z * toCamera.z) /
          (Math.hypot(ahead.x, ahead.z) * Math.hypot(toCamera.x, toCamera.z));
        const angle = (Math.acos(cos) * 180) / Math.PI;
        const label = `${frame.id} ${k.id}`;
        if (k.facing === 'front') expect(angle, label).toBeLessThanOrEqual(30);
        if (k.facing === 'threeQuarter') expect(angle, label).toBeGreaterThan(30);
        if (k.facing === 'threeQuarter') expect(angle, label).toBeLessThanOrEqual(75);
        if (k.facing === 'side') expect(angle, label).toBeGreaterThan(75);
        if (k.facing === 'side') expect(angle, label).toBeLessThanOrEqual(120);
        if (k.facing === 'side' || k.facing === 'threeQuarter')
          expect(ahead.x >= 0 ? 'left' : 'right', label).toBe(k.flipped ? 'right' : 'left');
        if (k.x < 0.35) expect(o.transform.position.x, label).toBeGreaterThan(camera.position.x);
        if (k.x > 0.65) expect(o.transform.position.x, label).toBeLessThan(camera.position.x);
      }
    }
  });

  it('saves and opens again unchanged (format 1.2.0)', () => {
    const opened = openProduction(saveProduction(demo));
    expect(opened.status).toBe('ok');
    if (opened.status === 'ok') expect(opened.production).toEqual(demo);
  });
});
