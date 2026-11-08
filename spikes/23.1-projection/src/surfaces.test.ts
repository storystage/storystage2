import { describe, expect, it } from 'vitest';
import {
  box,
  buildingFront,
  meshArrays,
  overlaps,
  packAtlas,
  quadNormal,
  quadSize,
} from './surfaces.ts';

describe.each([
  ['a box', box(1)],
  ['a building front', buildingFront()],
])('the texture layout of %s', (_, quads) => {
  const { rects, scale } = packAtlas(quads);

  it('keeps every UV in 0–1', () => {
    for (const r of rects) for (const v of r) expect(v).toBeGreaterThanOrEqual(0);
    for (const r of rects) for (const v of r) expect(v).toBeLessThanOrEqual(1);
  });

  it('gives no two faces the same texture space', () => {
    expect(overlaps(rects)).toBe(false);
  });

  it('gives each face texture space in proportion to its size', () => {
    quads.forEach((q, i) => {
      const { w, h } = quadSize(q);
      const [u0, v0, u1, v1] = rects[i]!;
      expect(u1 - u0).toBeCloseTo(w * scale, 9);
      expect(v1 - v0).toBeCloseTo(h * scale, 9);
    });
  });

  it('makes two triangles per face', () => {
    const m = meshArrays(quads, rects);
    expect(m.indices).toHaveLength(quads.length * 6);
    expect(m.uvs).toHaveLength(quads.length * 8);
  });
});

describe('normals', () => {
  it('point out of the box', () => {
    const byName = Object.fromEntries(box(1).map((q) => [q.name, quadNormal(q)]));
    expect(byName.front).toEqual([0, 0, -1]);
    expect(byName.top).toEqual([0, 1, 0]);
    expect(byName.right).toEqual([1, 0, 0]);
    expect(byName.left!.map((v) => v + 0)).toEqual([-1, 0, 0]);
  });

  it('point the roof up and towards the audience', () => {
    const roof = buildingFront().find((q) => q.name === 'roof')!;
    const [, y, z] = quadNormal(roof);
    expect(y).toBeGreaterThan(0);
    expect(z).toBeLessThan(0);
  });
});

describe('overlaps', () => {
  it('spots two rectangles on top of each other', () => {
    expect(
      overlaps([
        [0, 0, 0.5, 0.5],
        [0.4, 0.4, 0.9, 0.9],
      ]),
    ).toBe(true);
  });
});
