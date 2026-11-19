/**
 * Shrinks a VRM's pictures to the section's texture budget (owner, 19 Nov 2026: 100Avatars'
 * round 3 comes with 2,048 px textures, twice the cast budget). A VRM is otherwise shipped as it
 * is fetched, so this works on the file's bytes: each picture larger than `maxPx` is resized,
 * keeping its format (PNG or JPEG, which every VRM reader takes), and the binary chunk is laid out
 * again with the new pictures. The JSON changes only in the pictures' byte ranges and the buffer's
 * length; the skeleton, expressions, materials and licence settings stay exactly as they were.
 */

/** Resizes a picture to fit `maxPx` on its longer side, in the same format; null to keep it. */
export type PictureShrinker = (
  bytes: Uint8Array,
  mimeType: string,
  maxPx: number,
) => Promise<Uint8Array | null>;

const MAGIC = 0x46546c67;
const JSON_CHUNK = 0x4e4f534a;
const BIN_CHUNK = 0x004e4942;

interface Glb {
  json: {
    images?: { bufferView?: number; mimeType?: string }[];
    bufferViews?: { buffer: number; byteOffset?: number; byteLength: number }[];
    buffers?: { byteLength: number; uri?: string }[];
  };
  bin: Uint8Array;
}

function readGlb(bytes: Uint8Array): Glb | null {
  const v = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  if (bytes.length < 28 || v.getUint32(0, true) !== MAGIC || v.getUint32(16, true) !== JSON_CHUNK)
    return null;
  const jsonLength = v.getUint32(12, true);
  const binAt = 20 + jsonLength;
  if (binAt + 8 > bytes.length || v.getUint32(binAt + 4, true) !== BIN_CHUNK) return null;
  const json = JSON.parse(new TextDecoder().decode(bytes.subarray(20, binAt)));
  const bin = bytes.subarray(binAt + 8, binAt + 8 + v.getUint32(binAt, true));
  return { json, bin };
}

function writeGlb(json: unknown, bin: Uint8Array): Uint8Array {
  const text = new TextEncoder().encode(JSON.stringify(json));
  const jsonPad = (4 - (text.length % 4)) % 4;
  const binPad = (4 - (bin.length % 4)) % 4;
  const total = 12 + 8 + text.length + jsonPad + 8 + bin.length + binPad;
  const out = new Uint8Array(total);
  const v = new DataView(out.buffer);
  v.setUint32(0, MAGIC, true);
  v.setUint32(4, 2, true);
  v.setUint32(8, total, true);
  v.setUint32(12, text.length + jsonPad, true);
  v.setUint32(16, JSON_CHUNK, true);
  out.set(text, 20);
  out.fill(0x20, 20 + text.length, 20 + text.length + jsonPad);
  const binAt = 20 + text.length + jsonPad;
  v.setUint32(binAt, bin.length + binPad, true);
  v.setUint32(binAt + 4, BIN_CHUNK, true);
  out.set(bin, binAt + 8);
  return out;
}

/**
 * The VRM with every picture over `maxPx` shrunk, and how many were; the bytes as they were when
 * none needed it, or the file isn't a single-buffer binary glTF.
 */
export async function shrinkVrmTextures(
  bytes: Uint8Array,
  maxPx: number,
  shrink: PictureShrinker,
): Promise<{ bytes: Uint8Array; shrunk: number }> {
  const glb = readGlb(bytes);
  const views = glb?.json.bufferViews ?? [];
  if (!glb || (glb.json.buffers?.length ?? 0) !== 1 || views.some((b) => b.buffer !== 0))
    return { bytes, shrunk: 0 };
  const replaced = new Map<number, Uint8Array>();
  for (const image of glb.json.images ?? []) {
    if (image.bufferView === undefined || replaced.has(image.bufferView)) continue;
    const view = views[image.bufferView]!;
    const start = view.byteOffset ?? 0;
    const smaller = await shrink(
      glb.bin.subarray(start, start + view.byteLength),
      image.mimeType ?? 'image/png',
      maxPx,
    );
    if (smaller) replaced.set(image.bufferView, smaller);
  }
  if (replaced.size === 0) return { bytes, shrunk: 0 };
  // Lay the views out again in their old order, each 4-byte aligned, with the new pictures.
  const order = views
    .map((_, i) => i)
    .sort((a, b) => (views[a]!.byteOffset ?? 0) - (views[b]!.byteOffset ?? 0));
  const pieces: Uint8Array[] = [];
  let at = 0;
  for (const i of order) {
    const view = views[i]!;
    const start = view.byteOffset ?? 0;
    const data = replaced.get(i) ?? glb.bin.subarray(start, start + view.byteLength);
    const pad = (4 - (at % 4)) % 4;
    if (pad) pieces.push(new Uint8Array(pad));
    at += pad;
    view.byteOffset = at;
    view.byteLength = data.length;
    pieces.push(data);
    at += data.length;
  }
  const bin = new Uint8Array(at);
  let k = 0;
  for (const p of pieces) {
    bin.set(p, k);
    k += p.length;
  }
  glb.json.buffers![0]!.byteLength = bin.length;
  return { bytes: writeGlb(glb.json, bin), shrunk: replaced.size };
}
