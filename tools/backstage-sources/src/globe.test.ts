import { describe, expect, it } from 'vitest';
import { globeProblem, makeGlobe } from './globe.ts';

const picture = { bytes: new Uint8Array([1, 2, 3]), mimeType: 'image/jpeg' };
const ringPicture = { bytes: new Uint8Array([4, 5, 6]), mimeType: 'image/png' };

describe('globeProblem', () => {
  it('takes a plain globe, one that glows, and one with a ring', () => {
    expect(globeProblem({})).toBeNull();
    expect(globeProblem({ glow: true })).toBeNull();
    expect(
      globeProblem({
        ring: { path: 'originals/solar-system/2k_saturn_ring_alpha.png', inner: 1.2, outer: 2.3 },
      }),
    ).toBeNull();
  });

  it('refuses another field, a ring without transparency, or edges the wrong way round', () => {
    expect(globeProblem({ size: 2 })).toMatch(/only ring and glow/);
    expect(globeProblem({ ring: { path: 'ring.jpg', inner: 1.2, outer: 2.3 } })).toMatch(
      /\.png or \.webp/,
    );
    expect(globeProblem({ ring: { path: '../ring.png', inner: 1.2, outer: 2.3 } })).toMatch(
      /\.png or \.webp/,
    );
    expect(globeProblem({ ring: { path: 'ring.png', inner: 2.3, outer: 1.2 } })).toMatch(
      /inner < outer/,
    );
    expect(globeProblem({ glow: 'yes' })).toMatch(/true or false/);
  });
});

describe('makeGlobe (the planets; the owner’s choice of 21 Nov 2026)', () => {
  const doc = makeGlobe('Earth', picture, {});
  const prim = doc.getRoot().listMeshes()[0]!.listPrimitives()[0]!;
  const pos = prim.getAttribute('POSITION')!.getArray()!;
  const uv = prim.getAttribute('TEXCOORD_0')!.getArray()!;
  const idx = prim.getIndices()!.getArray()!;
  const at = (i: number) => [pos[i * 3]!, pos[i * 3 + 1]!, pos[i * 3 + 2]!];

  it('is a sphere one metre across, in about 4,000 triangles', () => {
    for (let i = 0; i < pos.length / 3; i++) expect(Math.hypot(...at(i))).toBeCloseTo(0.5, 6);
    expect(idx.length / 3).toBe(64 * 32 * 2 - 2 * 64);
  });

  it('faces every triangle outwards', () => {
    for (let t = 0; t < idx.length; t += 3) {
      const [a, b, c] = [at(idx[t]!), at(idx[t + 1]!), at(idx[t + 2]!)];
      const e1 = b.map((x, k) => x - a[k]!);
      const e2 = c.map((x, k) => x - a[k]!);
      const n = [
        e1[1]! * e2[2]! - e1[2]! * e2[1]!,
        e1[2]! * e2[0]! - e1[0]! * e2[2]!,
        e1[0]! * e2[1]! - e1[1]! * e2[0]!,
      ];
      const mid = [0, 1, 2].map((k) => a[k]! + b[k]! + c[k]!);
      expect(n[0]! * mid[0]! + n[1]! * mid[1]! + n[2]! * mid[2]!).toBeGreaterThan(0);
    }
  });

  it('turns longitude 0 to the front, north up, and east to the right', () => {
    const find = (u: number, v: number) => {
      for (let i = 0; i < uv.length / 2; i++)
        if (Math.abs(uv[i * 2]! - u) < 1e-6 && Math.abs(uv[i * 2 + 1]! - v) < 1e-6) return at(i);
      throw new Error('no such point');
    };
    const front = find(0.5, 0.5);
    expect(front[0]).toBeCloseTo(0, 6);
    expect(front[2]).toBeCloseTo(0.5, 6);
    expect(find(0.5, 0)[1]).toBeCloseTo(0.5, 6);
    expect(find(0.75, 0.5)[0]).toBeCloseTo(0.5, 6);
  });

  it('adds a double-sided see-through ring, and makes the Sun glow', () => {
    const saturn = makeGlobe(
      'Saturn',
      picture,
      { ring: { path: 'r.png', inner: 1.2, outer: 2.3 } },
      ringPicture,
    );
    const [, ring] = saturn.getRoot().listMeshes()[0]!.listPrimitives();
    expect(ring!.getMaterial()!.getAlphaMode()).toBe('BLEND');
    expect(ring!.getMaterial()!.getDoubleSided()).toBe(true);
    const ringPos = ring!.getAttribute('POSITION')!.getArray()!;
    const radii = [];
    for (let i = 0; i < ringPos.length; i += 3)
      radii.push(Math.hypot(ringPos[i]!, ringPos[i + 2]!));
    expect(Math.min(...radii)).toBeCloseTo(0.6, 6);
    expect(Math.max(...radii)).toBeCloseTo(1.15, 6);
    const sun = makeGlobe('Sun', picture, { glow: true });
    expect(sun.getRoot().listMaterials()[0]!.getEmissiveTexture()).not.toBeNull();
    expect(doc.getRoot().listMaterials()[0]!.getEmissiveTexture()).toBeNull();
  });
});
