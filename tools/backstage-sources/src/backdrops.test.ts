import { describe, expect, it } from 'vitest';
import sharp from 'sharp';
import type { Document, Primitive } from '@gltf-transform/core';
import {
  COLOUR_TOLERANCE,
  GROUND_TEXTURE_PX,
  SKY_RADIUS,
  SKY_TEXTURE_PX,
  averageColour,
  expose,
  turnPicture,
  groundTile,
  hexToRgb,
  matchColour,
  rgbToHex,
  skyDome,
  type Rgb,
} from './backdrops.ts';

/** A PNG of `width` by `height` whose pixels `colour(x, y)` gives, as bytes. */
async function png(
  width: number,
  height: number,
  colour: (x: number, y: number) => readonly [number, number, number],
): Promise<Uint8Array> {
  const data = Buffer.alloc(width * height * 3);
  for (let y = 0; y < height; y++)
    for (let x = 0; x < width; x++) data.set(colour(x, y), (y * width + x) * 3);
  return new Uint8Array(
    await sharp(data, { raw: { width, height, channels: 3 } })
      .png()
      .toBuffer(),
  );
}

/** A grainy brown, as a photographed ground might be. */
const grainy = (x: number, y: number) => {
  const n = (x * 37 + y * 101) % 64;
  return [90 + n, 70 + n, 40 + (n >> 1)] as const;
};

const primitiveOf = (doc: Document): Primitive =>
  doc.getRoot().listMeshes()[0]!.listPrimitives()[0]!;

function triangles(p: Primitive) {
  const pos = p.getAttribute('POSITION')!.getArray()!;
  const idx = p.getIndices()!.getArray()!;
  const out: { normal: number[]; centre: number[] }[] = [];
  for (let t = 0; t < idx.length; t += 3) {
    const [a, b, c] = [idx[t]!, idx[t + 1]!, idx[t + 2]!].map((i) => [
      pos[i * 3]!,
      pos[i * 3 + 1]!,
      pos[i * 3 + 2]!,
    ]) as [number[], number[], number[]];
    const e1 = a.map((v, k) => b[k]! - v);
    const e2 = a.map((v, k) => c[k]! - v);
    const normal = [
      e1[1]! * e2[2]! - e1[2]! * e2[1]!,
      e1[2]! * e2[0]! - e1[0]! * e2[2]!,
      e1[0]! * e2[1]! - e1[1]! * e2[0]!,
    ];
    out.push({ normal, centre: a.map((v, k) => (v + b[k]! + c[k]!) / 3) });
  }
  return out;
}

const close = (a: Rgb, b: Rgb, within: number) => a.every((v, k) => Math.abs(v - b[k]!) <= within);

describe('colours', () => {
  it('reads and writes rrggbb', () => {
    expect(rgbToHex(hexToRgb('5f9e3a'))).toBe('5f9e3a');
    expect(() => hexToRgb('green')).toThrow();
  });

  it('matches a picture to a colour in linear light, keeping its grain', () => {
    const width = 32;
    const rgb = new Uint8Array(width * width * 3);
    for (let i = 0; i < width * width; i++)
      rgb.set(grainy(i % width, Math.floor(i / width)), i * 3);
    const look = hexToRgb('5f9e3a');
    const matched = matchColour(rgb, look);
    expect(close(averageColour(matched, width, width), look, 1 / 255)).toBe(true);
    // Lighter pixels stay lighter.
    expect(matched[0]! < matched[(width + 1) * 3]!).toBe(rgb[0]! < rgb[(width + 1) * 3]!);
  });
});

describe('groundTile (spec 17 section 2)', () => {
  it('is one square tile facing up, its size in metres, with texture coordinates 0 to 1', async () => {
    const { doc } = await groundTile(await png(64, 64, grainy), 3, hexToRgb('7a5a3c'));
    const p = primitiveOf(doc);
    const pos = [...p.getAttribute('POSITION')!.getArray()!];
    const xs = pos.filter((_, i) => i % 3 === 0);
    const ys = pos.filter((_, i) => i % 3 === 1);
    expect([Math.min(...xs), Math.max(...xs)]).toEqual([-1.5, 1.5]);
    expect(ys.every((y) => y === 0)).toBe(true);
    const faces = triangles(p);
    expect(faces).toHaveLength(2);
    for (const { normal } of faces) expect(normal[1]!).toBeGreaterThan(0);
    const uv = [...p.getAttribute('TEXCOORD_0')!.getArray()!];
    expect([Math.min(...uv), Math.max(...uv)]).toEqual([0, 1]);
  });

  it('carries only a base-colour picture: WebP, without alpha, no bigger than the limit', async () => {
    const { doc } = await groundTile(await png(1500, 1500, grainy), 2, hexToRgb('7a5a3c'));
    const material = primitiveOf(doc).getMaterial()!;
    expect(material.getNormalTexture()).toBeNull();
    expect(material.getMetallicRoughnessTexture()).toBeNull();
    const texture = material.getBaseColorTexture()!;
    expect(texture.getMimeType()).toBe('image/webp');
    const meta = await sharp(texture.getImage()!).metadata();
    expect([meta.width, meta.height]).toEqual([GROUND_TEXTURE_PX, GROUND_TEXTURE_PX]);
    expect(meta.hasAlpha).toBe(false);
  });

  it("matches its average colour to the stage's flat colour, and says what it was", async () => {
    const look = hexToRgb('5f9e3a');
    const tile = await groundTile(await png(64, 64, grainy), 2, look);
    expect(close(tile.before, look, COLOUR_TOLERANCE)).toBe(false);
    expect(close(tile.after, look, 1 / 255)).toBe(true);
    const meta = await sharp(tile.thumbnail).metadata();
    expect([meta.format, meta.width, meta.height]).toEqual(['webp', 320, 320]);
  });
});

describe('skyDome (spec 17 section 2)', () => {
  // Blue above the horizon, with a pale band just above it, and green below.
  const sky = (_x: number, y: number) =>
    y < 44
      ? ([60, 120, 220] as const)
      : y < 50
        ? ([200, 210, 230] as const)
        : ([40, 90, 30] as const);

  it('faces in, all round, at the radius', async () => {
    const { doc } = await skyDome(await png(200, 100, sky));
    const p = primitiveOf(doc);
    const faces = triangles(p);
    expect(faces.length).toBeLessThanOrEqual(4000);
    for (const { normal, centre } of faces)
      expect(normal.reduce((s, n, k) => s + n * centre[k]!, 0)).toBeLessThan(0);
    const pos = p.getAttribute('POSITION')!.getArray()!;
    for (let i = 0; i < pos.length; i += 3)
      expect(Math.hypot(pos[i]!, pos[i + 1]!, pos[i + 2]!)).toBeCloseTo(SKY_RADIUS, 3);
  });

  it("puts the picture's middle in front of the camera (+Z), with +Y up", async () => {
    const { doc } = await skyDome(await png(200, 100, sky));
    const p = primitiveOf(doc);
    const pos = p.getAttribute('POSITION')!.getArray()!;
    const uv = p.getAttribute('TEXCOORD_0')!.getArray()!;
    const at = (u: number, v: number) => {
      for (let i = 0; i < uv.length / 2; i++)
        if (Math.abs(uv[i * 2]! - u) < 1e-6 && Math.abs(uv[i * 2 + 1]! - v) < 1e-6)
          return [pos[i * 3]!, pos[i * 3 + 1]!, pos[i * 3 + 2]!].map((n) => Math.round(n) + 0);
      throw new Error(`no vertex at ${u}, ${v}`);
    };
    expect(at(0.5, 0.5)).toEqual([0, 0, SKY_RADIUS]);
    expect(at(0.75, 0.5)).toEqual([-SKY_RADIUS, 0, 0]);
    expect(at(0.5, 0)).toEqual([0, SKY_RADIUS, 0]);
  });

  it('is unlit, with its picture twice as wide as high', async () => {
    const { doc } = await skyDome(await png(200, 100, sky));
    const material = primitiveOf(doc).getMaterial()!;
    expect(material.getExtension('KHR_materials_unlit')).not.toBeNull();
    const meta = await sharp(material.getBaseColorTexture()!.getImage()!).metadata();
    expect([meta.width, meta.height]).toEqual([SKY_TEXTURE_PX, SKY_TEXTURE_PX / 2]);
  });

  it('scales its light by its exposure, in linear light, and lights more dimly for it', async () => {
    const bright = await skyDome(await png(200, 100, sky));
    const night = await skyDome(await png(200, 100, sky), { exposure: 0.2 });
    // A fifth of the light is about half the sRGB value, for these colours.
    expect(night.horizon[2]!).toBeLessThan(bright.horizon[2]! * 0.6);
    expect(Math.max(...night.lighting.above)).toBeLessThan(Math.max(...bright.lighting.above));
  });

  it('tints it: white becomes the tint, so a cool tint makes a night bluer', () => {
    const white = new Uint8Array([255, 255, 255, 128, 128, 128]);
    const tinted = expose(white, 1, hexToRgb('8ca5ff'));
    expect([...tinted.subarray(0, 3)]).toEqual([0x8c, 0xa5, 0xff]);
    expect(tinted[5]!).toBeGreaterThan(tinted[3]!);
  });

  it("turns it so the picture's column at ahead faces +Z, wrapping round", async () => {
    // A picture with one bright column, a quarter of the way in from its right edge.
    const width = 8;
    const rgb = new Uint8Array(width * 3);
    rgb.set([255, 255, 255], 6 * 3);
    const turned = turnPicture(rgb, width, 6 / width);
    expect(turned[4 * 3]!).toBe(255);
    expect([...turned].filter((v) => v === 255)).toHaveLength(3);
    expect(turnPicture(rgb, width, 0.5)).toBe(rgb);
    // The dome itself: a sun at u = 0.75 is ahead once ahead is 0.75.
    const sun = (x: number, y: number) =>
      x >= 145 && x < 155 && y > 40 && y < 50
        ? ([255, 240, 200] as const)
        : ([60, 90, 140] as const);
    const dome = await skyDome(await png(200, 100, sun), { ahead: 0.75 });
    const pic = await sharp(primitiveOf(dome.doc).getMaterial()!.getBaseColorTexture()!.getImage()!)
      .removeAlpha()
      .raw()
      .toBuffer({ resolveWithObject: true });
    const w = pic.info.width;
    const row = Math.round(pic.info.height * 0.45);
    const brightest = [...Array(w).keys()].reduce((best, x) =>
      pic.data[(row * w + x) * 3]! > pic.data[(row * w + best) * 3]! ? x : best,
    );
    expect(Math.abs(brightest / w - 0.5)).toBeLessThan(0.03);
  });

  it('reports the horizon band as its atmosphere colour, and a lighting to suit', async () => {
    const dome = await skyDome(await png(200, 100, sky));
    expect(close(dome.horizon, [200 / 255, 210 / 255, 230 / 255], 0.03)).toBe(true);
    // A blue day sky lights from above, bluish and strong; from below, darker than the horizon.
    const [r, g, b] = dome.lighting.above;
    expect(b).toBeGreaterThan(r);
    expect(Math.max(r, g, b)).toBeGreaterThan(0.8);
    expect(dome.lighting.below.every((c, k) => c < dome.horizon[k]!)).toBe(true);
  });
});
