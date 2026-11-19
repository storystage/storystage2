import { describe, expect, it } from 'vitest';
import { shrinkVrmTextures, type PictureShrinker } from './vrm-textures.ts';

/** A one-buffer binary glTF: an accessor's 8 bytes, then a 10-byte "picture", then 4 more bytes. */
function vrm(): Uint8Array {
  const bin = new Uint8Array([
    1, 2, 3, 4, 5, 6, 7, 8, 9, 9, 9, 9, 9, 9, 9, 9, 9, 9, 0, 0, 7, 7, 7, 7,
  ]);
  const json = {
    asset: { version: '2.0' },
    extensions: { VRM: { meta: { title: 'Kept' } } },
    buffers: [{ byteLength: bin.length }],
    bufferViews: [
      { buffer: 0, byteOffset: 0, byteLength: 8 },
      { buffer: 0, byteOffset: 8, byteLength: 10 },
      { buffer: 0, byteOffset: 20, byteLength: 4 },
    ],
    images: [{ bufferView: 1, mimeType: 'image/png' }],
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

describe('shrinkVrmTextures', () => {
  it('puts the smaller picture in, moves what follows, and keeps the rest of the file', async () => {
    const shrink: PictureShrinker = async (bytes, mime, maxPx) => {
      expect(Array.from(bytes)).toEqual(new Array(10).fill(9));
      expect(mime).toBe('image/png');
      expect(maxPx).toBe(1024);
      return new Uint8Array([5, 5, 5]);
    };
    const out = await shrinkVrmTextures(vrm(), 1024, shrink);
    expect(out.shrunk).toBe(1);
    const r = read(out.bytes);
    expect(r.total).toBe(r.length);
    expect(r.view(0)).toEqual([1, 2, 3, 4, 5, 6, 7, 8]);
    expect(r.view(1)).toEqual([5, 5, 5]);
    expect(r.view(2)).toEqual([7, 7, 7, 7]);
    expect(r.json.bufferViews[2].byteOffset % 4).toBe(0);
    expect(r.json.extensions.VRM.meta.title).toBe('Kept');
  });

  it('gives the file back as it was when every picture fits', async () => {
    const before = vrm();
    const out = await shrinkVrmTextures(before, 1024, async () => null);
    expect(out).toEqual({ bytes: before, shrunk: 0 });
  });
});
