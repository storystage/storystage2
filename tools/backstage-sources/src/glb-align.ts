/**
 * Pads a binary glTF's JSON chunk to a multiple of 4 bytes, as the format requires (glTF 2.0,
 * section 4.4.3) and as readers such as glTF Transform rely on. Some files, 61 of 100Avatars'
 * round 3, leave it unpadded. Spaces are added after the JSON, which JSON ignores, and the header's
 * lengths follow; nothing else in the file changes. A file that is already aligned, or isn't a
 * binary glTF, is returned as it is.
 */
export function alignGlb(bytes: Uint8Array): Uint8Array {
  if (bytes.length < 20) return bytes;
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  const MAGIC = 0x46546c67; // "glTF"
  const JSON_CHUNK = 0x4e4f534a; // "JSON"
  if (view.getUint32(0, true) !== MAGIC || view.getUint32(16, true) !== JSON_CHUNK) return bytes;
  const jsonLength = view.getUint32(12, true);
  const pad = (4 - (jsonLength % 4)) % 4;
  if (pad === 0 || 20 + jsonLength > bytes.length) return bytes;
  const out = new Uint8Array(bytes.length + pad);
  out.set(bytes.subarray(0, 20 + jsonLength), 0);
  out.fill(0x20, 20 + jsonLength, 20 + jsonLength + pad);
  out.set(bytes.subarray(20 + jsonLength), 20 + jsonLength + pad);
  const outView = new DataView(out.buffer);
  outView.setUint32(8, out.length, true);
  outView.setUint32(12, jsonLength + pad, true);
  return out;
}
