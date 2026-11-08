import { describe, expect, it } from 'vitest';
import sharp from 'sharp';
import { sharpDecoder, sharpEncoder, thumbnailWebp } from './sharp-encoder.ts';

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
