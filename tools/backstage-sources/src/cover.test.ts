import { describe, expect, it } from 'vitest';
import sharp from 'sharp';
import { Document } from '@gltf-transform/core';
import { coverProblem, coverTextures, type Cover } from './cover.ts';
import { sharpPainter } from './sharp-encoder.ts';

/** An 8 × 8 red PNG with a 2 × 2 blue mark at 3, 3: an insignia on a hull. */
async function marked(): Promise<Uint8Array> {
  const data = Buffer.alloc(8 * 8 * 4);
  for (let i = 0; i < 64; i++) data.set([200, 20, 20, 255], i * 4);
  for (const [x, y] of [
    [3, 3],
    [4, 3],
    [3, 4],
    [4, 4],
  ] as const)
    data.set([10, 60, 150, 255], (y * 8 + x) * 4);
  return new Uint8Array(
    await sharp(data, { raw: { width: 8, height: 8, channels: 4 } })
      .png()
      .toBuffer(),
  );
}

const pixel = async (png: Uint8Array, x: number, y: number) => {
  const { data } = await sharp(png).ensureAlpha().raw().toBuffer({ resolveWithObject: true });
  return [...data.subarray((y * 8 + x) * 4, (y * 8 + x) * 4 + 4)];
};

async function model(...names: string[]) {
  const doc = new Document();
  const image = await marked();
  for (const name of names) doc.createTexture(name).setImage(image).setMimeType('image/png');
  return doc;
}

describe('coverProblem', () => {
  it('takes boxes in whole pixels, with an optional colour', () => {
    expect(coverProblem([{ texture: 'hull', at: [3, 3, 2, 2] }])).toBeNull();
    expect(coverProblem([{ texture: 'logo', at: [0, 0, 8, 8], colour: '#d6d7e6' }])).toBeNull();
  });

  it('refuses an empty list, a bad box, a bad colour or another field', () => {
    expect(coverProblem([])).toMatch(/list/);
    expect(coverProblem([{ texture: 'hull', at: [3, 3, 0, 2] }])).toMatch(/four whole numbers/);
    expect(coverProblem([{ texture: 'hull', at: [3.5, 3, 2, 2] }])).toMatch(/four whole numbers/);
    expect(coverProblem([{ texture: 'hull', at: [3, 3, 2, 2], colour: 'blue' }])).toMatch(
      /#rrggbb/,
    );
    expect(coverProblem([{ texture: 'hull', at: [3, 3, 2, 2], size: 2 }])).toMatch(/only/);
  });
});

describe('coverTextures (NASA’s insignia; the owner’s choice of 21 Nov 2026)', () => {
  it('paints a mark out with the colour around it, in every texture of that name', async () => {
    const doc = await model('hull', 'hull', 'other');
    const covers: Cover[] = [{ texture: 'hull', at: [3, 3, 2, 2] }];
    await coverTextures(doc, covers, sharpPainter);
    const [a, b, other] = doc.getRoot().listTextures();
    expect(await pixel(a!.getImage()!, 3, 3)).toEqual([200, 20, 20, 255]);
    expect(await pixel(b!.getImage()!, 4, 4)).toEqual([200, 20, 20, 255]);
    expect(await pixel(other!.getImage()!, 3, 3)).toEqual([10, 60, 150, 255]);
    expect(a!.getMimeType()).toBe('image/png');
  });

  it('fills a picture that is all mark with the colour given', async () => {
    const doc = await model('logo');
    await coverTextures(
      doc,
      [{ texture: 'logo', at: [0, 0, 8, 8], colour: '#d6d7e6' }],
      sharpPainter,
    );
    expect(await pixel(doc.getRoot().listTextures()[0]!.getImage()!, 4, 4)).toEqual([
      214, 215, 230, 255,
    ]);
  });

  it('refuses a texture the model hasn’t, a box outside it, or nothing around it to match', async () => {
    await expect(
      coverTextures(await model('hull'), [{ texture: 'wing', at: [0, 0, 1, 1] }], sharpPainter),
    ).rejects.toThrow(/no texture called "wing"/);
    await expect(
      coverTextures(await model('hull'), [{ texture: 'hull', at: [6, 6, 4, 4] }], sharpPainter),
    ).rejects.toThrow(/outside the 8 × 8 picture/);
    await expect(
      coverTextures(await model('hull'), [{ texture: 'hull', at: [0, 0, 8, 8] }], sharpPainter),
    ).rejects.toThrow(/give its colour/);
  });
});
