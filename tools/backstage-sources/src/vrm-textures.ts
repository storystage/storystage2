/**
 * Packs a VRM's pictures: each is fitted to the section's texture budget (owner, 19 Nov 2026:
 * 100Avatars' round 3 comes with 2,048 px textures, twice the cast budget) and made WebP where
 * that is smaller (owner, 23 Nov 2026: the shipped Backstage's size, option a; the avatars' PNGs
 * were 114 of its 197 MB of pictures). A VRM is otherwise shipped as it is fetched, so this works
 * on the file's bytes: the binary chunk is laid out again with the new pictures. A WebP picture
 * is marked as glTF's `EXT_texture_webp` asks, required, with no PNG beside it, which the stage
 * reads (S3, 23 Nov). The VRM's own thumbnail is left in its format, for VRM tools that show it.
 * The skeleton, expressions, materials and licence settings stay exactly as they were.
 */

/**
 * A picture fitted to `maxPx` on its longer side, and as WebP where that is smaller, with its
 * type; null to keep it as it is.
 */
export type PicturePacker = (
  bytes: Uint8Array,
  mimeType: string,
  maxPx: number,
) => Promise<{ readonly bytes: Uint8Array; readonly mimeType: string } | null>;

const WEBP = 'EXT_texture_webp';

const MAGIC = 0x46546c67;
const JSON_CHUNK = 0x4e4f534a;
const BIN_CHUNK = 0x004e4942;

interface Glb {
  json: {
    images?: { bufferView?: number; mimeType?: string }[];
    textures?: { source?: number; extensions?: Record<string, { source?: number }> }[];
    bufferViews?: { buffer: number; byteOffset?: number; byteLength: number }[];
    buffers?: { byteLength: number; uri?: string }[];
    extensionsUsed?: string[];
    extensionsRequired?: string[];
    extensions?: {
      VRM?: { meta?: { texture?: number } };
      VRMC_vrm?: { meta?: { thumbnailImage?: number } };
    };
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
 * The VRM with its pictures packed (`PicturePacker`), and how many changed; the bytes as they
 * were when none did, or the file isn't a single-buffer binary glTF.
 */
export async function packVrmTextures(
  bytes: Uint8Array,
  maxPx: number,
  pack: PicturePacker,
): Promise<{ bytes: Uint8Array; changed: number }> {
  const glb = readGlb(bytes);
  const views = glb?.json.bufferViews ?? [];
  if (!glb || (glb.json.buffers?.length ?? 0) !== 1 || views.some((b) => b.buffer !== 0))
    return { bytes, changed: 0 };
  const { json } = glb;
  const images = json.images ?? [];
  const textures = json.textures ?? [];
  // The VRM's thumbnail: 0.x names a texture, 1.0 an image.
  const kept = new Set<number>();
  const thumbTexture = json.extensions?.VRM?.meta?.texture;
  const thumbSource = thumbTexture === undefined ? undefined : textures[thumbTexture]?.source;
  if (thumbSource !== undefined) kept.add(thumbSource);
  const thumbImage = json.extensions?.VRMC_vrm?.meta?.thumbnailImage;
  if (thumbImage !== undefined) kept.add(thumbImage);
  // A picture's bytes, by its buffer view, and the image each view's picture is now.
  const replaced = new Map<number, Uint8Array>();
  const madeWebp = new Set<number>();
  for (const [i, image] of images.entries()) {
    if (image.bufferView === undefined || kept.has(i)) continue;
    // Two images on one view would be packed once and could disagree: leave them both.
    if (images.some((other, k) => k !== i && other.bufferView === image.bufferView)) continue;
    const view = views[image.bufferView]!;
    const start = view.byteOffset ?? 0;
    const packed = await pack(
      glb.bin.subarray(start, start + view.byteLength),
      image.mimeType ?? 'image/png',
      maxPx,
    );
    if (!packed) continue;
    replaced.set(image.bufferView, packed.bytes);
    if (packed.mimeType === 'image/webp' && image.mimeType !== 'image/webp') madeWebp.add(i);
    image.mimeType = packed.mimeType;
  }
  if (replaced.size === 0) return { bytes, changed: 0 };
  if (madeWebp.size > 0) {
    // Each texture of a WebP picture finds it through the extension, as glTF's core takes only
    // PNG and JPEG; with no fallback, the extension is required.
    for (const texture of textures) {
      if (texture.source === undefined || !madeWebp.has(texture.source)) continue;
      texture.extensions = { ...texture.extensions, [WEBP]: { source: texture.source } };
      delete texture.source;
    }
    for (const list of ['extensionsUsed', 'extensionsRequired'] as const)
      if (!(json[list] ?? []).includes(WEBP)) json[list] = [...(json[list] ?? []), WEBP];
  }
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
  return { bytes: writeGlb(glb.json, bin), changed: replaced.size };
}
