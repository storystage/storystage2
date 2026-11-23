import { describe, expect, it } from 'vitest';
import { packVrmTextures, type PicturePacker } from './vrm-textures.ts';

/**
 * A one-buffer binary glTF: an accessor's 8 bytes, then a 10-byte picture, then 4 more bytes, then
 * a 2-byte picture, its VRM thumbnail. Each picture has a texture; `extensions` is the VRM's own.
 */
function vrm(extensions: object = { VRM: { meta: { title: 'Kept', texture: 1 } } }): Uint8Array {
  const bin = new Uint8Array([
    1, 2, 3, 4, 5, 6, 7, 8, 9, 9, 9, 9, 9, 9, 9, 9, 9, 9, 0, 0, 7, 7, 7, 7, 6, 6, 0, 0,
  ]);
  const json = {
    asset: { version: '2.0' },
    extensionsUsed: ['VRM'],
    extensions,
    buffers: [{ byteLength: bin.length }],
    bufferViews: [
      { buffer: 0, byteOffset: 0, byteLength: 8 },
      { buffer: 0, byteOffset: 8, byteLength: 10 },
      { buffer: 0, byteOffset: 20, byteLength: 4 },
      { buffer: 0, byteOffset: 24, byteLength: 2 },
    ],
    images: [
      { bufferView: 1, mimeType: 'image/png' },
      { bufferView: 3, mimeType: 'image/png' },
    ],
    textures: [{ source: 0, sampler: 0 }, { source: 1 }],
  };
  let text = new TextEncoder().encode(JSON.stringify(json));
  const pad = (4 - (text.length % 4)) % 4;
  text = Uint8Array.from([...text, ...new Array(pad).fill(0x20)]);
  const out = new Uint8Array(20 + text.length + 8 + bin.length);
  const v = new DataView(out.buffer);
  v.setUint32(0, 0x46546c67, true);
  v.setUint32(4, 2, true);
  v.setUint32(8, out.length, true);
  v.setUint32(12, text.length, true);
  v.setUint32(16, 0x4e4f534a, true);
  out.set(text, 20);
  v.setUint32(20 + text.length, bin.length, true);
  v.setUint32(24 + text.length, 0x004e4942, true);
  out.set(bin, 28 + text.length);
  return out;
}

const read = (bytes: Uint8Array) => {
  const v = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  const len = v.getUint32(12, true);
  const json = JSON.parse(new TextDecoder().decode(bytes.subarray(20, 20 + len)));
  const bin = bytes.subarray(28 + len, 28 + len + v.getUint32(20 + len, true));
  const view = (i: number) => {
    const b = json.bufferViews[i];
    return Array.from(bin.subarray(b.byteOffset, b.byteOffset + b.byteLength));
  };
  return { json, view, total: v.getUint32(8, true), length: bytes.length };
};

/** Every picture it's given, as WebP of three bytes. */
const toWebp: PicturePacker = async () => ({
  bytes: new Uint8Array([5, 5, 5]),
  mimeType: 'image/webp',
});

describe('packVrmTextures', () => {
  it('puts the smaller picture in, moves what follows, and keeps the rest of the file', async () => {
    const pack: PicturePacker = async (bytes, mime, maxPx) => {
      expect(Array.from(bytes)).toEqual(new Array(10).fill(9));
      expect(mime).toBe('image/png');
      expect(maxPx).toBe(1024);
      return { bytes: new Uint8Array([5, 5, 5]), mimeType: 'image/png' };
    };
    const out = await packVrmTextures(vrm(), 1024, pack);
    expect(out.changed).toBe(1);
    const r = read(out.bytes);
    expect(r.total).toBe(r.length);
    expect(r.view(0)).toEqual([1, 2, 3, 4, 5, 6, 7, 8]);
    expect(r.view(1)).toEqual([5, 5, 5]);
    expect(r.view(2)).toEqual([7, 7, 7, 7]);
    expect(r.view(3)).toEqual([6, 6]);
    expect(r.json.bufferViews[2].byteOffset % 4).toBe(0);
    expect(r.json.extensions.VRM.meta.title).toBe('Kept');
    // Still PNG: nothing about WebP is added.
    expect(r.json.textures[0]).toEqual({ source: 0, sampler: 0 });
    expect(r.json.extensionsRequired).toBeUndefined();
  });

  it('marks a WebP picture as EXT_texture_webp asks, required, with no PNG beside it', async () => {
    const r = read((await packVrmTextures(vrm(), 1024, toWebp)).bytes);
    expect(r.json.images[0].mimeType).toBe('image/webp');
    expect(r.json.textures[0]).toEqual({
      sampler: 0,
      extensions: { EXT_texture_webp: { source: 0 } },
    });
    expect(r.json.extensionsUsed).toEqual(['VRM', 'EXT_texture_webp']);
    expect(r.json.extensionsRequired).toEqual(['EXT_texture_webp']);
  });

  it("leaves the VRM's own thumbnail in its format, in 0.x and 1.0", async () => {
    const asked: number[][] = [];
    const pack: PicturePacker = async (bytes) => (
      asked.push(Array.from(bytes)),
      toWebp(bytes, '', 0)
    );
    const zero = read((await packVrmTextures(vrm(), 1024, pack)).bytes);
    expect(zero.json.images[1].mimeType).toBe('image/png');
    expect(zero.json.textures[1]).toEqual({ source: 1 });
    expect(zero.view(3)).toEqual([6, 6]);
    const one = vrm({ VRMC_vrm: { meta: { name: 'Kept', thumbnailImage: 1 } } });
    const r = read((await packVrmTextures(one, 1024, pack)).bytes);
    expect(r.json.images[1].mimeType).toBe('image/png');
    expect(r.view(3)).toEqual([6, 6]);
    // Only the first picture was asked, each time.
    expect(asked).toEqual([new Array(10).fill(9), new Array(10).fill(9)]);
  });

  it('gives the file back as it was when every picture is kept', async () => {
    const before = vrm();
    const out = await packVrmTextures(before, 1024, async () => null);
    expect(out).toEqual({ bytes: before, changed: 0 });
  });
});
