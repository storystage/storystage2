/**
 * The build tools' texture encoder for `reduceModel` (WP3.9): sharp, a build-only tool whose
 * libvips is LGPL, so it is a devDependency here and never reaches the app (CLAUDE.md, rule 8;
 * owner, 7 Nov 2026). The app's import worker encodes with the browser's canvas instead.
 */
import sharp from 'sharp';
import type { TextureEncoder } from '@storystage/backstage/optimize';

export const sharpEncoder: TextureEncoder = async (image, _mimeType, maxPx) =>
  new Uint8Array(
    await sharp(image)
      .resize({ width: maxPx, height: maxPx, fit: 'inside', withoutEnlargement: true })
      .webp({ quality: 85, alphaQuality: 90 })
      .toBuffer(),
  );
