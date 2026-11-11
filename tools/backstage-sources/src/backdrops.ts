/**
 * WP3b (workplan 3.7): Backdrops from CC0 pictures (spec 17 section 2, agreed with S3). A
 * ground is one square tile of its texture, colour-matched to the stage's flat colour; a sky is a
 * dome around the scene with an equirectangular picture. The stage finds both in Backstage under
 * the backdrop's own id, and draws its flat colour where there's none.
 *
 * Pictures are handled with sharp, a build-only tool (`sharp-encoder.ts`), never in the app.
 */
import sharp, { type ResizeOptions, type Sharp } from 'sharp';
import { Document, type Texture } from '@gltf-transform/core';
import { EXTTextureWebP, KHRMaterialsUnlit } from '@gltf-transform/extensions';

/** A ground's texture, at most (spec 17 section 2). */
export const GROUND_TEXTURE_PX = 1024;
/** A sky's picture: twice as wide as high. */
export const SKY_TEXTURE_PX = 2048;
/** The dome's radius in metres: inside the stage's 256 m far clip. */
export const SKY_RADIUS = 200;
/** How far a ground's average colour may be from its look, on each channel (sRGB, 0 to 1). */
export const COLOUR_TOLERANCE = 0.1;
/** A thumbnail's side, as for every other item. */
const THUMBNAIL_PX = 320;
/** The dome's divisions: 32 around and 16 from top to bottom, 1,024 triangles. */
const AROUND = 32;
const DOWN = 16;

/** Red, green and blue in sRGB, each 0 to 1. */
export type Rgb = readonly [number, number, number];

const toLinear = (c: number) => (c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4);
const toSrgb = (c: number) => (c <= 0.0031308 ? c * 12.92 : 1.055 * c ** (1 / 2.4) - 0.055);

/** `rrggbb` as sRGB, each 0 to 1. */
export function hexToRgb(hex: string): Rgb {
  if (!/^[0-9a-f]{6}$/i.test(hex)) throw new Error(`${hex} is not an rrggbb colour.`);
  const n = parseInt(hex, 16);
  return [((n >> 16) & 255) / 255, ((n >> 8) & 255) / 255, (n & 255) / 255];
}

export const rgbToHex = (c: Rgb) =>
  c
    .map((v) =>
      Math.round(Math.min(1, Math.max(0, v)) * 255)
        .toString(16)
        .padStart(2, '0'),
    )
    .join('');

/** The average sRGB colour of `rgb`, three bytes a pixel, over rows `from` to `to` (fractions). */
export function averageColour(
  rgb: Uint8Array,
  width: number,
  height: number,
  from = 0,
  to = 1,
): Rgb {
  const top = Math.floor(from * height);
  const bottom = Math.max(top + 1, Math.ceil(to * height));
  const sum = [0, 0, 0];
  for (let y = top; y < bottom; y++)
    for (let x = 0; x < width; x++) {
      const i = (y * width + x) * 3;
      for (let k = 0; k < 3; k++) sum[k]! += rgb[i + k]!;
    }
  const n = (bottom - top) * width * 255;
  return [sum[0]! / n, sum[1]! / n, sum[2]! / n];
}

/**
 * Scales each channel of `rgb` in linear light so that its average sRGB colour is `look`, as
 * near as 8-bit pixels allow. Light and shade keep their proportions; a channel that would go past
 * full is held there, so the gain is found by search rather than worked out.
 */
export function matchColour(rgb: Uint8Array, look: Rgb): Uint8Array {
  const pixels = rgb.length / 3;
  const out = new Uint8Array(rgb.length);
  for (let k = 0; k < 3; k++) {
    const counts = new Float64Array(256);
    for (let i = k; i < rgb.length; i += 3) counts[rgb[i]!]!++;
    const mean = (gain: number) => {
      let sum = 0;
      for (let v = 0; v < 256; v++)
        if (counts[v]) sum += counts[v]! * toSrgb(Math.min(1, gain * toLinear(v / 255)));
      return sum / pixels;
    };
    let lo = 0;
    let hi = 64;
    for (let step = 0; step < 50; step++) {
      const mid = (lo + hi) / 2;
      if (mean(mid) < look[k]!) lo = mid;
      else hi = mid;
    }
    const gain = (lo + hi) / 2;
    const table = new Uint8Array(256);
    for (let v = 0; v < 256; v++)
      table[v] = Math.round(toSrgb(Math.min(1, gain * toLinear(v / 255))) * 255);
    for (let i = k; i < rgb.length; i += 3) out[i] = table[rgb[i]!]!;
  }
  return out;
}

/**
 * `rgb` with its light scaled by `exposure` in linear light, and tinted: white becomes `tint`
 * (sRGB, 0 to 1), so a cool tint makes a night bluer.
 */
export function expose(rgb: Uint8Array, exposure: number, tint: Rgb = [1, 1, 1]): Uint8Array {
  const tables = tint.map((t) => {
    const gain = exposure * toLinear(t);
    const table = new Uint8Array(256);
    for (let v = 0; v < 256; v++)
      table[v] = Math.round(toSrgb(Math.min(1, toLinear(v / 255) * gain)) * 255);
    return table;
  });
  return rgb.map((v, i) => tables[i % 3]![v]!);
}

/**
 * `rgb`, `width` pixels wide, turned so that its column at `ahead` (0 to 1 across) is in the
 * middle: an equirectangular picture wraps round, so nothing is lost.
 */
export function turnPicture(rgb: Uint8Array, width: number, ahead: number): Uint8Array {
  const shift = Math.round((ahead - 0.5) * width);
  if (shift % width === 0) return rgb;
  const out = new Uint8Array(rgb.length);
  const rows = rgb.length / (width * 3);
  for (let y = 0; y < rows; y++)
    for (let x = 0; x < width; x++) {
      const from = (((x + shift) % width) + width) % width;
      out.set(
        rgb.subarray((y * width + from) * 3, (y * width + from) * 3 + 3),
        (y * width + x) * 3,
      );
    }
  return out;
}

/** How to treat a sky's picture (spec 17 section 3). */
export interface SkyOptions {
  /** Its light, from 1 (as it is) down. */
  readonly exposure?: number;
  /** What white becomes. */
  readonly tint?: Rgb;
  /** The picture's column, 0 to 1 across, that faces straight ahead (+Z). Default the middle. */
  readonly ahead?: number;
}

/** A picture's pixels, three bytes each, no wider or taller than `maxPx`. */
async function pixels(picture: Uint8Array, resize: ResizeOptions) {
  const { data, info } = await sharp(picture)
    .removeAlpha()
    .resize(resize)
    .raw()
    .toBuffer({ resolveWithObject: true });
  return { rgb: new Uint8Array(data), width: info.width, height: info.height };
}

const raw = (rgb: Uint8Array, width: number, height: number) =>
  sharp(Buffer.from(rgb), { raw: { width, height, channels: 3 } });

const webp = async (s: Sharp) => new Uint8Array(await s.webp({ quality: 88 }).toBuffer());

function texture(doc: Document, image: Uint8Array, name: string): Texture {
  doc.createExtension(EXTTextureWebP).setRequired(true);
  return doc.createTexture(name).setImage(image).setMimeType('image/webp');
}

function primitive(
  doc: Document,
  positions: number[],
  normals: number[],
  uvs: number[],
  indices: number[],
) {
  const buffer = doc.getRoot().listBuffers()[0] ?? doc.createBuffer();
  const accessor = (
    type: 'VEC3' | 'VEC2' | 'SCALAR',
    array: Float32Array<ArrayBuffer> | Uint16Array<ArrayBuffer>,
  ) => doc.createAccessor().setType(type).setArray(array).setBuffer(buffer);
  return doc
    .createPrimitive()
    .setAttribute('POSITION', accessor('VEC3', new Float32Array(positions)))
    .setAttribute('NORMAL', accessor('VEC3', new Float32Array(normals)))
    .setAttribute('TEXCOORD_0', accessor('VEC2', new Float32Array(uvs)))
    .setIndices(accessor('SCALAR', new Uint16Array(indices)));
}

function scene(doc: Document, name: string, mesh: ReturnType<Document['createMesh']>) {
  const node = doc.createNode(name).setMesh(mesh);
  doc.getRoot().setDefaultScene(doc.createScene(name).addChild(node));
}

export interface GroundTile {
  readonly doc: Document;
  /** The picture's average colour as fetched, and as shipped. */
  readonly before: Rgb;
  readonly after: Rgb;
  /** Its thumbnail, WebP. */
  readonly thumbnail: Uint8Array;
}

/**
 * A ground (spec 17 section 2): one square in the XZ plane, centred on the origin and facing +Y,
 * `tile` metres across, with texture coordinates 0 to 1 over it, and one material whose
 * base-colour texture is the picture, colour-matched to `look` and no more than
 * `GROUND_TEXTURE_PX`, without alpha. The stage tiles it across the ground.
 */
export async function groundTile(
  picture: Uint8Array,
  tile: number,
  look: Rgb,
): Promise<GroundTile> {
  const { rgb, width, height } = await pixels(picture, {
    width: GROUND_TEXTURE_PX,
    height: GROUND_TEXTURE_PX,
    fit: 'inside',
    withoutEnlargement: true,
  });
  const matched = matchColour(rgb, look);
  const doc = new Document();
  doc.createBuffer();
  const material = doc
    .createMaterial('ground')
    .setBaseColorTexture(texture(doc, await webp(raw(matched, width, height)), 'ground'))
    .setMetallicFactor(0)
    .setRoughnessFactor(1);
  const h = tile / 2;
  const square = primitive(
    doc,
    [-h, 0, -h, h, 0, -h, h, 0, h, -h, 0, h],
    [0, 1, 0, 0, 1, 0, 0, 1, 0, 0, 1, 0],
    [0, 0, 1, 0, 1, 1, 0, 1],
    // Counter-clockwise seen from above, so the square faces +Y.
    [0, 2, 1, 0, 3, 2],
  ).setMaterial(material);
  scene(doc, 'ground', doc.createMesh('ground').addPrimitive(square));
  const thumbnail = await webp(
    raw(matched, width, height).resize(THUMBNAIL_PX, THUMBNAIL_PX, { fit: 'cover' }),
  );
  return {
    doc,
    before: averageColour(rgb, width, height),
    after: averageColour(matched, width, height),
    thumbnail,
  };
}

export interface SkyDome {
  readonly doc: Document;
  /** The average of the picture's band just above the horizon: the sky's atmosphere colour. */
  readonly horizon: Rgb;
  /** A suggested lighting to go with it, from above and from below (spec 17 section 2). */
  readonly lighting: { readonly above: Rgb; readonly below: Rgb };
  readonly thumbnail: Uint8Array;
}

/**
 * A picture sky (spec 17 section 2): an inward-facing sphere centred on the origin, `SKY_RADIUS`
 * across, with an unlit material and the equirectangular picture at `SKY_TEXTURE_PX` by half
 * that. The middle of the picture faces +Z, the way the default camera looks, with +Y up.
 *
 * `options.exposure` scales its light in linear light, from 1 (as it is) down, and `tint` colours
 * it: a gallery's tonemapped pictures are each exposed to look bright, so a night sky comes as
 * bright and as grey as noon. `ahead` turns it, so the sun of a sunset is straight ahead.
 */
export async function skyDome(picture: Uint8Array, options: SkyOptions = {}): Promise<SkyDome> {
  const fetched = await pixels(picture, {
    width: SKY_TEXTURE_PX,
    height: SKY_TEXTURE_PX / 2,
    fit: 'fill',
  });
  const { width, height } = fetched;
  const { exposure = 1, tint, ahead = 0.5 } = options;
  const turned = turnPicture(fetched.rgb, width, ahead);
  const rgb = exposure === 1 && !tint ? turned : expose(turned, exposure, tint);
  const doc = new Document();
  doc.createBuffer();
  const unlit = doc.createExtension(KHRMaterialsUnlit);
  const material = doc
    .createMaterial('sky')
    .setBaseColorTexture(texture(doc, await webp(raw(rgb, width, height)), 'sky'))
    .setExtension('KHR_materials_unlit', unlit.createUnlit());

  const positions: number[] = [];
  const normals: number[] = [];
  const uvs: number[] = [];
  for (let j = 0; j <= DOWN; j++) {
    const theta = (j / DOWN) * Math.PI;
    for (let i = 0; i <= AROUND; i++) {
      const u = i / AROUND;
      // Further right in the picture is further to the camera's right, which is -X facing +Z.
      const phi = (u - 0.5) * 2 * Math.PI;
      const dir = [
        -Math.sin(phi) * Math.sin(theta),
        Math.cos(theta),
        Math.cos(phi) * Math.sin(theta),
      ];
      positions.push(...dir.map((d) => d * SKY_RADIUS));
      normals.push(...dir.map((d) => -d));
      uvs.push(u, j / DOWN);
    }
  }
  const indices: number[] = [];
  const at = (i: number, j: number) => j * (AROUND + 1) + i;
  for (let j = 0; j < DOWN; j++)
    for (let i = 0; i < AROUND; i++) {
      const [a, b, c, d] = [at(i, j), at(i + 1, j), at(i, j + 1), at(i + 1, j + 1)];
      // Counter-clockwise seen from the middle, so the dome faces in. The cap's triangles that
      // would have no area are left out.
      if (j > 0) indices.push(a, c, b);
      if (j < DOWN - 1) indices.push(b, c, d);
    }
  const sphere = primitive(doc, positions, normals, uvs, indices).setMaterial(material);
  scene(doc, 'sky', doc.createMesh('sky').addPrimitive(sphere));

  const horizon = averageColour(rgb, width, height, 0.44, 0.5);
  const sky = averageColour(rgb, width, height, 0, 0.5);
  // Light from above takes the sky's hue at full strength by day and dimmer at night; light from
  // below is the horizon, darker, as light the ground sends back.
  const linear = sky.map(toLinear);
  const peak = Math.max(...linear, 1e-6);
  const luminance = 0.2126 * linear[0]! + 0.7152 * linear[1]! + 0.0722 * linear[2]!;
  const strength = Math.min(1, 0.25 + 2 * luminance);
  const above = linear.map((c) => toSrgb((c / peak) * strength)) as unknown as Rgb;
  const below = horizon.map((c) => c * 0.4) as unknown as Rgb;
  const thumbnail = await webp(
    raw(rgb, width, height)
      .extract({
        left: Math.round(width * 0.375),
        top: Math.round(height * 0.2),
        width: Math.round(width * 0.25),
        height: Math.round(height * 0.3),
      })
      .resize(THUMBNAIL_PX, THUMBNAIL_PX, { fit: 'cover' }),
  );
  return { doc, horizon, lighting: { above, below }, thumbnail };
}
