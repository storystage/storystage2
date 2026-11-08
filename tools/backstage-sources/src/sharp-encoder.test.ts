import { describe, expect, it } from 'vitest';
import sharp from 'sharp';
import { sharpEncoder } from './sharp-encoder.ts';

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
