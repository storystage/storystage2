/**
 * The build tools' picture code: the texture encoder for `reduceModel` (WP3.9), and the decoder
 * and WebP encoder for colour thumbnails (WP3c). All use sharp, a build-only tool whose
 * libvips is LGPL, so it is a devDependency here and never reaches the app (CLAUDE.md, rule 8;
 * owner, 7 Nov 2026). The app's import worker encodes with the browser's canvas instead.
 */
import sharp from 'sharp';
import type { TextureEncoder } from '@storystage/backstage/optimize';
import type { ImageDecoder, Picture } from '@storystage/sketches';

export const sharpEncoder: TextureEncoder = async (image, _mimeType, maxPx) =>
  new Uint8Array(
    await sharp(image)
      .resize({ width: maxPx, height: maxPx, fit: 'inside', withoutEnlargement: true })
      .webp({ quality: 85, alphaQuality: 90 })
      .toBuffer(),
  );

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
