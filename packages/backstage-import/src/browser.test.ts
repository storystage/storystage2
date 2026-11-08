import { describe, expect, it } from 'vitest';
import { browserImageTools, type CanvasApi } from './browser.ts';
import { pictureSize } from './checks.ts';

/** A PNG header of the given size. */
function png(w: number, h: number): Uint8Array<ArrayBuffer> {
  const b = new Uint8Array(33);
  b.set([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0, 0, 0, 13, 0x49, 0x48, 0x44, 0x52]);
  new DataView(b.buffer).setUint32(16, w);
  new DataView(b.buffer).setUint32(20, h);
  return b;
}

/**
 * A stand-in for the browser's canvas: pictures are their PNG headers, and a canvas encodes as
 * a header of its own size. `webp: false` behaves as Safari does, giving PNG when asked for WebP.
 */
function fakeCanvas(webp: boolean) {
  const drawn: { w: number; h: number }[] = [];
  const closed: number[] = [];
  const api: CanvasApi = {
    async createImageBitmap(blob) {
      const size = pictureSize(new Uint8Array(await blob.arrayBuffer()))!;
      return { width: size.width, height: size.height, close: () => closed.push(1) };
    },
    OffscreenCanvas: class {
      readonly width: number;
      readonly height: number;
      constructor(w: number, h: number) {
        this.width = w;
        this.height = h;
      }
      getContext() {
        return {
          drawImage: (_i: unknown, _x: number, _y: number, w: number, h: number) =>
            void drawn.push({ w, h }),
          getImageData: (_x: number, _y: number, w: number, h: number) => ({
            data: new Uint8ClampedArray(w * h * 4).fill(7),
          }),
          putImageData: () => undefined,
          createImageData: (w: number, h: number) => ({ data: new Uint8ClampedArray(w * h * 4) }),
        };
      }
      async convertToBlob(options?: { type?: string }) {
        const type = options?.type === 'image/webp' && webp ? 'image/webp' : 'image/png';
        return new Blob([png(this.width, this.height)], { type });
      }
    },
  };
  return { api, drawn, closed };
}

describe('browserImageTools (spec 17, section 5)', () => {
  it('shrinks a texture to the budget, keeping its shape, as WebP', async () => {
    const { api, drawn, closed } = fakeCanvas(true);
    const out = await browserImageTools(api).encodeTexture(
      png(4096, 2048),
      'image/png',
      1024,
      [4096, 2048],
    );
    expect(out).toMatchObject({ mimeType: 'image/webp' });
    expect(drawn).toEqual([{ w: 1024, h: 512 }]);
    expect(closed).toHaveLength(1);
  });

  it('never enlarges a small texture', async () => {
    const { api, drawn } = fakeCanvas(true);
    await browserImageTools(api).encodeTexture(png(200, 100), 'image/png', 1024, [200, 100]);
    expect(drawn).toEqual([{ w: 200, h: 100 }]);
  });

  it('says it made PNG where the browser can’t make WebP, as Safari', async () => {
    const { api } = fakeCanvas(false);
    const tools = browserImageTools(api);
    const out = await tools.encodeTexture(png(64, 64), 'image/png', 1024, [64, 64]);
    expect(out).toMatchObject({ mimeType: 'image/png' });
    const thumb = await tools.encodeThumbnail({ width: 4, height: 4, data: new Uint8Array(64) });
    expect(thumb.mimeType).toBe('image/png');
  });

  it('decodes a picture to its bytes for the thumbnail', async () => {
    const { api } = fakeCanvas(true);
    const picture = await browserImageTools(api).decodeImage!(png(3, 2), 'image/png');
    expect([picture.width, picture.height, picture.data.length]).toEqual([3, 2, 24]);
  });
});
