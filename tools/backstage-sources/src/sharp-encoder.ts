/**
 * The build tools' picture code: the texture encoder for `reduceModel` (WP3.9), and the decoder
 * and WebP encoder for colour thumbnails (WP3c). All use sharp, a build-only tool whose
 * libvips is LGPL, so it is a devDependency here and never reaches the app (CLAUDE.md, rule 8;
 * owner, 7 Nov 2026). The app's import worker encodes with the browser's canvas instead.
 */
import sharp from 'sharp';
import type { TextureEncoder } from '@storystage/backstage/optimize';
import type { ImageDecoder, Picture } from '@storystage/sketches';
import type { PictureShrinker } from './vrm-textures.ts';
import type { Painter } from './cover.ts';

/** Always WebP, so it gives the bytes alone. */
export const sharpEncoder = (async (
  image: Uint8Array,
  _mimeType: string,
  maxPx: number,
  _size?: readonly [number, number],
) =>
  new Uint8Array(
    await sharp(image)
      .resize({ width: maxPx, height: maxPx, fit: 'inside', withoutEnlargement: true })
      .webp({ quality: 85, alphaQuality: 90 })
      .toBuffer(),
  )) satisfies TextureEncoder;

/** Decodes a model's picture for its colour thumbnail (`renderThumbnail`). */
export const sharpDecoder: ImageDecoder = async (bytes) => {
  const { data, info } = await sharp(bytes)
    .ensureAlpha()
    .raw()
    .toBuffer({ resolveWithObject: true });
  return { width: info.width, height: info.height, data: new Uint8Array(data) };
};

/** A thumbnail as WebP, keeping its clear background. */
export const thumbnailWebp = async (p: Picture): Promise<Uint8Array> =>
  new Uint8Array(
    await sharp(Buffer.from(p.data), { raw: { width: p.width, height: p.height, channels: 4 } })
      .webp({ quality: 85, alphaQuality: 90 })
      .toBuffer(),
  );

/**
 * Paints boxes over a picture (`cover.ts`): each in its colour, or in the average of a band up to
 * 4 pixels wide just around it, inside the picture. Given back in its own format.
 */
export const sharpPainter: Painter = async (image, mimeType, boxes) => {
  const { data, info } = await sharp(image)
    .ensureAlpha()
    .raw()
    .toBuffer({ resolveWithObject: true });
  const { width: W, height: H } = info;
  for (const { at, colour } of boxes) {
    const [x, y, w, h] = at;
    if (x + w > W || y + h > H)
      throw new Error(`cover: the box ${at.join(', ')} is outside the ${W} × ${H} picture.`);
    let rgba: number[];
    if (colour) {
      const n = parseInt(colour.slice(1), 16);
      rgba = [(n >> 16) & 255, (n >> 8) & 255, n & 255, 255];
    } else {
      const sum = [0, 0, 0, 0];
      let count = 0;
      for (let py = Math.max(0, y - 4); py < Math.min(H, y + h + 4); py++)
        for (let px = Math.max(0, x - 4); px < Math.min(W, x + w + 4); px++) {
          if (px >= x && px < x + w && py >= y && py < y + h) continue;
          for (let c = 0; c < 4; c++) sum[c]! += data[(py * W + px) * 4 + c]!;
          count++;
        }
      if (!count)
        throw new Error(`cover: nothing is around the box ${at.join(', ')}; give its colour.`);
      rgba = sum.map((v) => Math.round(v / count));
    }
    for (let py = y; py < y + h; py++)
      for (let px = x; px < x + w; px++)
        for (let c = 0; c < 4; c++) data[(py * W + px) * 4 + c] = rgba[c]!;
  }
  const out = sharp(data, { raw: { width: W, height: H, channels: 4 } });
  return new Uint8Array(
    mimeType === 'image/jpeg'
      ? await out.jpeg({ quality: 95 }).toBuffer()
      : mimeType === 'image/webp'
        ? await out.webp({ lossless: true }).toBuffer()
        : await out.png().toBuffer(),
  );
};

/**
 * A VRM's picture made to fit `maxPx`, in its own format (PNG, or JPEG), since VRM readers may not
 * take WebP; null when it already fits.
 */
export const sharpShrinker: PictureShrinker = async (bytes, mimeType, maxPx) => {
  const { width = 0, height = 0 } = await sharp(bytes).metadata();
  if (width <= maxPx && height <= maxPx) return null;
  const resized = sharp(bytes).resize({ width: maxPx, height: maxPx, fit: 'inside' });
  return new Uint8Array(
    mimeType === 'image/jpeg'
      ? await resized.jpeg({ quality: 90 }).toBuffer()
      : await resized.png({ compressionLevel: 9 }).toBuffer(),
  );
};
