/**
 * WP3.11, steps 3 and 5 in the browser: the import's picture tools, from the browser's own
 * canvas (spec 17, section 5). They run in the import worker, where `OffscreenCanvas` and
 * `createImageBitmap` are available, with no graphics library of our own.
 *
 * - **Textures** are shrunk to the budget and encoded as WebP. Safari's canvas can't make WebP:
 *   asked for it, it gives PNG, so the encoder says which it made.
 * - **Pictures for the thumbnail** are decoded to red, green, blue and alpha bytes.
 * - **The thumbnail** is encoded the same way as a texture: WebP, or PNG on Safari.
 */
import type { TextureEncoder } from '@storystage/backstage/optimize';
import type { ImageDecoder, Picture } from '@storystage/sketches';
import type { ImportTools } from './import.ts';

/** What the tools need from the browser, so tests can stand in for it. */
export interface CanvasApi {
  createImageBitmap(blob: Blob): Promise<{ width: number; height: number; close?(): void }>;
  OffscreenCanvas: new (
    width: number,
    height: number,
  ) => {
    getContext(kind: '2d'): {
      drawImage(image: unknown, x: number, y: number, w: number, h: number): void;
      getImageData(x: number, y: number, w: number, h: number): { data: Uint8ClampedArray };
      putImageData(data: unknown, x: number, y: number): void;
      createImageData(w: number, h: number): { data: Uint8ClampedArray };
    } | null;
    convertToBlob(options?: { type?: string; quality?: number }): Promise<Blob>;
  };
}

const WEBP_QUALITY = 0.85;

/** The browser's own, in a worker or a page. */
const browserCanvas = (): CanvasApi => globalThis as unknown as CanvasApi;

type Canvas = InstanceType<CanvasApi['OffscreenCanvas']>;

/** A canvas's picture as WebP, or as PNG where the browser can't make WebP (Safari). */
async function encode(
  canvas: Canvas,
): Promise<{ bytes: Uint8Array; mimeType: 'image/webp' | 'image/png' }> {
  const webp = await canvas.convertToBlob({ type: 'image/webp', quality: WEBP_QUALITY });
  if (webp.type === 'image/webp')
    return { bytes: new Uint8Array(await webp.arrayBuffer()), mimeType: 'image/webp' };
  const png = webp.type === 'image/png' ? webp : await canvas.convertToBlob({ type: 'image/png' });
  return { bytes: new Uint8Array(await png.arrayBuffer()), mimeType: 'image/png' };
}

function context(canvas: Canvas) {
  const ctx = canvas.getContext('2d');
  if (!ctx) throw new Error('This browser can’t draw pictures off screen.');
  return ctx;
}

/** The import's picture tools from a browser's canvas (`OffscreenCanvas`). */
export function browserImageTools(api: CanvasApi = browserCanvas()): ImportTools {
  const encodeTexture: TextureEncoder = async (image, mimeType, maxPx, size) => {
    // The size came from the picture's header, checked against the limits before this runs.
    const scale = Math.min(1, maxPx / Math.max(size[0], size[1], 1));
    const w = Math.max(1, Math.round(size[0] * scale));
    const h = Math.max(1, Math.round(size[1] * scale));
    const bitmap = await api.createImageBitmap(new Blob([image.slice()], { type: mimeType }));
    try {
      const canvas = new api.OffscreenCanvas(w, h);
      context(canvas).drawImage(bitmap, 0, 0, w, h);
      return await encode(canvas);
    } finally {
      bitmap.close?.();
    }
  };

  const decodeImage: ImageDecoder = async (bytes, mimeType) => {
    const bitmap = await api.createImageBitmap(new Blob([bytes.slice()], { type: mimeType }));
    try {
      const { width, height } = bitmap;
      const canvas = new api.OffscreenCanvas(width, height);
      const ctx = context(canvas);
      ctx.drawImage(bitmap, 0, 0, width, height);
      return { width, height, data: ctx.getImageData(0, 0, width, height).data };
    } finally {
      bitmap.close?.();
    }
  };

  const encodeThumbnail = async (picture: Picture) => {
    const canvas = new api.OffscreenCanvas(picture.width, picture.height);
    const ctx = context(canvas);
    const data = ctx.createImageData(picture.width, picture.height);
    data.data.set(picture.data);
    ctx.putImageData(data, 0, 0);
    return encode(canvas);
  };

  return { encodeTexture, decodeImage, encodeThumbnail };
}
