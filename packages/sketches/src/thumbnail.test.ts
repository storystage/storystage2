import { describe, expect, it } from 'vitest';
import { meshFromDocument } from './gltf.ts';
import type { SketchMaterial, SketchMesh } from './mesh.ts';
import { box, documentFromMesh, figure } from './testing.ts';
import { THUMBNAIL_SIZE, renderThumbnail, type Picture } from './thumbnail.ts';

const material = (over: Partial<SketchMaterial> = {}): SketchMaterial => ({
  colour: [1, 1, 1, 1],
  image: -1,
  alpha: 'OPAQUE',
  cutoff: 0.5,
  unlit: true,
  ...over,
});

/** A mesh with one material on every triangle, and every corner at (u, v). */
const dressed = (mesh: SketchMesh, m: SketchMaterial, uv: [number, number] = [0.5, 0.5]) => {
  const vertices = mesh.positions.length / 3;
  return {
    ...mesh,
    surface: {
      uvs: new Float32Array(vertices * 2).map((_, i) => uv[i % 2]!),
      colours: new Float32Array(vertices * 4).fill(1),
      triangleMaterial: new Uint16Array(mesh.indices.length / 3),
      materials: [m],
      images: [{ bytes: new Uint8Array([1]), mimeType: 'image/png' }],
    },
  };
};

const pixel = (p: Picture, x: number, y: number) => [
  ...p.data.slice((y * p.width + x) * 4, (y * p.width + x) * 4 + 4),
];
const centre = (p: Picture) => pixel(p, p.width >> 1, p.height >> 1);

/** A 2 x 2 picture of one colour. */
const solid = (rgba: [number, number, number, number]) => async (): Promise<Picture> => ({
  width: 2,
  height: 2,
  data: new Uint8Array(16).map((_, i) => rgba[i % 4]!),
});

const cube = box([-0.5, 0, -0.5], [0.5, 1, 0.5]);

describe('renderThumbnail', () => {
  it('draws a square picture with the model in the middle and a clear background', async () => {
    const p = await renderThumbnail(dressed(cube, material({ colour: [0.2, 0.4, 0.8, 1] })));
    expect([p.width, p.height]).toEqual([THUMBNAIL_SIZE, THUMBNAIL_SIZE]);
    expect(centre(p)[3]).toBe(255);
    expect(pixel(p, 2, 2)[3]).toBe(0);
    expect(pixel(p, p.width - 3, p.height - 3)[3]).toBe(0);
  });

  it('shows an unlit material in its own colour, in sRGB', async () => {
    const p = await renderThumbnail(dressed(cube, material({ colour: [0.2, 0.4, 0.8, 1] })));
    // Linear 0.2, 0.4, 0.8 is sRGB 124, 170, 231.
    expect(centre(p)).toEqual([124, 170, 231, 255]);
  });

  it('lights a lit material softly, never black and never brighter than it is', async () => {
    const p = await renderThumbnail(
      dressed(cube, material({ colour: [0.5, 0.5, 0.5, 1], unlit: false })),
    );
    const [r] = centre(p);
    expect(r).toBeGreaterThan(120);
    expect(r).toBeLessThan(200);
  });

  it("multiplies in the material's picture, decoded by the caller", async () => {
    const red = dressed(cube, material({ image: 0 }));
    const p = await renderThumbnail(red, { decodeImage: solid([255, 0, 0, 255]) });
    expect(centre(p)).toEqual([255, 0, 0, 255]);
    // Without a decoder, the material's own colour stands in.
    expect(centre(await renderThumbnail(red))).toEqual([255, 255, 255, 255]);
    // A picture that can't be decoded is left out, not fatal.
    const broken = await renderThumbnail(red, {
      decodeImage: () => Promise.reject(new Error('bad')),
    });
    expect(centre(broken)).toEqual([255, 255, 255, 255]);
  });

  it('cuts out masked parts and blends see-through ones', async () => {
    const clear = solid([255, 255, 255, 0]);
    const masked = dressed(cube, material({ image: 0, alpha: 'MASK' }));
    expect(centre(await renderThumbnail(masked, { decodeImage: clear }))[3]).toBe(0);
    const half = dressed(cube, material({ colour: [1, 1, 1, 0.5], alpha: 'BLEND' }));
    const [, , , a] = centre(await renderThumbnail(half));
    // Two faces of the cube, front and back, each half see-through: 1 - 0.5 x 0.5.
    expect(a).toBe(191);
  });

  it('stands a character in the standing pose, fitted to its height', async () => {
    const person = figure();
    const p = await renderThumbnail(dressed(person, material()));
    const rows = (pic: Picture) =>
      Array.from({ length: pic.height }, (_, y) =>
        Array.from({ length: pic.width }, (_, x) => pixel(pic, x, y)[3]!).some((a) => a > 0),
      );
    const used = rows(p).filter(Boolean).length;
    expect(used).toBeGreaterThan(p.height * 0.85);
    // Arms down: narrower than tall.
    const cols = Array.from({ length: p.width }, (_, x) =>
      Array.from({ length: p.height }, (_, y) => pixel(p, x, y)[3]!).some((a) => a > 0),
    ).filter(Boolean).length;
    expect(cols).toBeLessThan(used * 0.7);
  });

  it('gives the same picture every time', async () => {
    const m = dressed(figure(), material({ unlit: false }));
    const [a, b] = await Promise.all([renderThumbnail(m), renderThumbnail(m)]);
    expect([...a.data]).toEqual([...b.data]);
  });
});

describe('meshFromDocument surfaces', () => {
  it('reads each material once, with its colour, alpha and picture', () => {
    const doc = documentFromMesh(cube);
    const png = new Uint8Array([137, 80, 78, 71]);
    const texture = doc.createTexture('skin').setImage(png).setMimeType('image/png');
    const m = doc
      .createMaterial('paint')
      .setBaseColorFactor([0.1, 0.2, 0.3, 0.9])
      .setAlphaMode('BLEND')
      .setBaseColorTexture(texture);
    for (const mesh of doc.getRoot().listMeshes())
      for (const prim of mesh.listPrimitives()) prim.setMaterial(m);
    const { surface } = meshFromDocument(doc);
    expect(surface!.materials).toHaveLength(2);
    expect(surface!.materials[1]).toMatchObject({
      colour: [0.1, 0.2, 0.3, 0.9],
      image: 0,
      alpha: 'BLEND',
      unlit: false,
    });
    expect([...surface!.triangleMaterial].every((i) => i === 1)).toBe(true);
    expect(surface!.images).toEqual([{ bytes: png, mimeType: 'image/png' }]);
    expect(surface!.uvs).toHaveLength((cube.positions.length / 3) * 2);
    expect([...surface!.colours.slice(0, 4)]).toEqual([1, 1, 1, 1]);
  });

  it('gives a primitive with no material glTF’s default white', () => {
    const { surface } = meshFromDocument(documentFromMesh(cube));
    expect(surface!.materials[0]).toMatchObject({ colour: [1, 1, 1, 1], image: -1 });
    expect([...surface!.triangleMaterial].every((i) => i === 0)).toBe(true);
  });
});
