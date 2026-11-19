import { describe, expect, it } from 'vitest';
import { alignGlb } from './glb-align.ts';

/** A binary glTF with the given JSON text, unpadded, and a 4-byte BIN chunk. */
function glb(json: string): Uint8Array {
  const text = new TextEncoder().encode(json);
  const out = new Uint8Array(12 + 8 + text.length + 8 + 4);
  const v = new DataView(out.buffer);
  v.setUint32(0, 0x46546c67, true);
  v.setUint32(4, 2, true);
  v.setUint32(8, out.length, true);
  v.setUint32(12, text.length, true);
  v.setUint32(16, 0x4e4f534a, true);
  out.set(text, 20);
  const bin = 20 + text.length;
  v.setUint32(bin, 4, true);
  v.setUint32(bin + 4, 0x004e4942, true);
  out.set([1, 2, 3, 4], bin + 8);
  return out;
}

describe('alignGlb', () => {
  it('pads an unpadded JSON chunk with spaces, and keeps the rest as it was', () => {
    const fixed = alignGlb(glb('{"asset":{}}a'.slice(0, 13)));
    const v = new DataView(fixed.buffer);
    expect(v.getUint32(12, true) % 4).toBe(0);
    expect(v.getUint32(8, true)).toBe(fixed.length);
    const json = new TextDecoder().decode(fixed.subarray(20, 20 + v.getUint32(12, true)));
    expect(json.trimEnd()).toBe('{"asset":{}}a');
    const bin = 20 + v.getUint32(12, true);
    expect(v.getUint32(bin + 4, true)).toBe(0x004e4942);
    expect(Array.from(fixed.subarray(bin + 8))).toEqual([1, 2, 3, 4]);
  });

  it('returns an aligned file, or one that is not a binary glTF, as it is', () => {
    const aligned = glb('{"asset":{}}');
    expect(alignGlb(aligned)).toBe(aligned);
    const other = new Uint8Array([1, 2, 3]);
    expect(alignGlb(other)).toBe(other);
  });
});
