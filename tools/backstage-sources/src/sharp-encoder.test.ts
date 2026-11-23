import { describe, expect, it } from 'vitest';
import sharp from 'sharp';
import { sharpDecoder, sharpEncoder, sharpPicturePacker, thumbnailWebp } from './sharp-encoder.ts';

const picture = (width: number, height: number, channels: 3 | 4 = 4) =>
  sharp({ create: { width, height, channels, background: { r: 200, g: 120, b: 40, alpha: 0.5 } } })
    .png()
    .toBuffer()
    .then((b) => new Uint8Array(b));

describe('sharpEncoder', () => {
  it('shrinks a picture to fit, keeps its shape, and makes it WebP', async () => {
    const out = await sharpEncoder(await picture(4096, 2048), 'image/png', 1024, [4096, 2048]);
    const meta = await sharp(out).metadata();
    expect(meta.format).toBe('webp');
    expect([meta.width, meta.height]).toEqual([1024, 512]);
  });

  it('never enlarges a small picture, and keeps its see-through parts', async () => {
    const out = await sharpEncoder(await picture(200, 100), 'image/png', 1024, [200, 100]);
    const meta = await sharp(out).metadata();
    expect([meta.width, meta.height]).toEqual([200, 100]);
    expect(meta.hasAlpha).toBe(true);
  });
});

/** The colour under a clear pixel of `avatarPicture`: smooth, so lossy WebP keeps it close. */
const hidden = (x: number, y: number) => [x * 2, 255 - (y % 256), 40 + (x % 100)] as const;

/**
 * A PNG as an avatar's texture is: detail WebP packs smaller (a fixed pattern, so the test is the
 * same each run), and its left half clear, with colours under it that an edge's filtering reads.
 */
async function avatarPicture(size: number): Promise<Uint8Array> {
  const data = new Uint8Array(size * size * 4);
  for (let y = 0; y < size; y++)
    for (let x = 0; x < size; x++) {
      const at = (y * size + x) * 4;
      if (x < size / 2) data.set([...hidden(x, y), 0], at);
      else data.set([(x * 37 + y * 11) % 256, (x * y) % 256, (x * 7 + y * 53) % 256, 255], at);
    }
  return new Uint8Array(
    await sharp(Buffer.from(data), { raw: { width: size, height: size, channels: 4 } })
      .png()
      .toBuffer(),
  );
}

describe('sharpPicturePacker (a VRM’s pictures)', () => {
  it('makes a picture that fits WebP when that’s smaller, keeping its size', async () => {
    const png = await avatarPicture(256);
    const out = await sharpPicturePacker(png, 'image/png', 1024);
    expect(out?.mimeType).toBe('image/webp');
    expect(out!.bytes.length).toBeLessThan(png.length);
    const meta = await sharp(out!.bytes).metadata();
    expect([meta.format, meta.width, meta.height, meta.hasAlpha]).toEqual(['webp', 256, 256, true]);
  });

  it('fits a larger picture to the budget', async () => {
    const out = await sharpPicturePacker(await avatarPicture(512), 'image/png', 128);
    const meta = await sharp(out!.bytes).metadata();
    expect([out!.mimeType, meta.width, meta.height]).toEqual(['image/webp', 128, 128]);
  });

  it('leaves a WebP picture that fits as it is', async () => {
    const webp = new Uint8Array(
      await sharp(await avatarPicture(64))
        .webp()
        .toBuffer(),
    );
    expect(await sharpPicturePacker(webp, 'image/webp', 1024)).toBeNull();
  });

  // S3, 23 Nov 2026: without `exact`, libwebp makes up the colour under clear pixels, and a
  // cut-out's edge, where filtering reads it, changes. Here, without it, the colours under the
  // clear half are off by about 215 on average (the three channels' differences added); with it,
  // about 5, as lossy WebP is off anywhere.
  it('keeps the colour under clear pixels', async () => {
    const size = 256;
    const out = await sharpPicturePacker(await avatarPicture(size), 'image/png', 1024);
    const { data } = await sharp(out!.bytes).raw().toBuffer({ resolveWithObject: true });
    let off = 0;
    for (let y = 0; y < size; y++)
      for (let x = 0; x < size / 2; x++) {
        const at = (y * size + x) * 4;
        expect(data[at + 3]).toBe(0);
        const [r, g, b] = hidden(x, y);
        off += Math.abs(data[at]! - r) + Math.abs(data[at + 1]! - g) + Math.abs(data[at + 2]! - b);
      }
    expect(off / (size * (size / 2))).toBeLessThan(20);
  });
});

describe('thumbnail pictures', () => {
  it('decodes a picture to bytes, with alpha even where it had none', async () => {
    const p = await sharpDecoder(await picture(3, 2, 3), 'image/png');
    expect([p.width, p.height, p.data.length]).toEqual([3, 2, 24]);
    expect([...p.data.slice(0, 4)]).toEqual([200, 120, 40, 255]);
  });

  it('writes a thumbnail as WebP, keeping its clear background', async () => {
    const data = new Uint8Array(4 * 4 * 4);
    data.set([255, 0, 0, 255], 0);
    const meta = await sharp(await thumbnailWebp({ width: 4, height: 4, data })).metadata();
    expect([meta.format, meta.width, meta.height, meta.hasAlpha]).toEqual(['webp', 4, 4, true]);
  });
});
