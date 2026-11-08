/**
 * WP3c: a colour thumbnail of a model, for Backstage's browse views (spec 17, section 7a). Like
 * the sketches, it is drawn on the CPU in TypeScript, so the same code runs in the build tools
 * and, for imports, in a Web Worker in the app (3.11), with no graphics card.
 *
 * Steps: stand the model in the sketches' standing pose; look at it from the front, square on
 * (orthographic), fitted to the picture; give each corner a smooth normal, keeping sharp folds
 * sharp; fill each triangle with its material's colour, picture and vertex colours, lit softly
 * from the front, above and to the left; draw see-through parts last, back to front; and
 * average each 3 x 3 block of pixels so edges are smooth. The background is clear.
 *
 * Pictures are decoded by the caller (`decodeImage`): sharp in the tools, the browser's own
 * decoder in the app. Without one, each material is drawn in its plain colour.
 */
import type { Facing } from '@storystage/backstage';
import { cross, dot, normalize, sub, type Vec3 } from './math.ts';
import { weld, type SketchMesh } from './mesh.ts';
import { canPose, poseMesh } from './pose.ts';
import { viewOf } from './render.ts';

/** Red, green, blue and alpha bytes per pixel, row by row from the top; sRGB, not premultiplied. */
export interface Picture {
  readonly width: number;
  readonly height: number;
  readonly data: Uint8Array | Uint8ClampedArray;
}

export type ImageDecoder = (bytes: Uint8Array, mimeType: string) => Promise<Picture>;

export interface ThumbnailOptions {
  /** Width and height in pixels. Default `THUMBNAIL_SIZE`. */
  readonly size?: number;
  readonly decodeImage?: ImageDecoder;
  /** Default front, as the manifest's `files.thumbnail` says. */
  readonly facing?: Facing;
}

/** The same as a sketch's default size, so a thumbnail and a sketch line up. */
export const THUMBNAIL_SIZE = 320;
const SUPERSAMPLE = 3;
/** Clear space round the model, as a share of the picture. */
const MARGIN = 0.05;
/** Folds sharper than this keep a hard edge. */
const CREASE_COS = Math.cos((50 * Math.PI) / 180);
/**
 * Where in each pixel to sample: just off its centre, so an edge two triangles share almost never
 * runs exactly through a sample. Otherwise both would draw it, and a see-through part would be
 * blended twice along the seam.
 */
const SAMPLE_X = 0.5 + 1.37e-4;
const SAMPLE_Y = 0.5 + 2.91e-4;
const AMBIENT = 0.5;
const DIFFUSE = 0.6;

const SRGB_TO_LINEAR = Float32Array.from({ length: 256 }, (_, i) => {
  const c = i / 255;
  return c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
});
const toSrgbByte = (l: number) => {
  const c = l <= 0.0031308 ? l * 12.92 : 1.055 * l ** (1 / 2.4) - 0.055;
  return Math.round(Math.min(1, Math.max(0, c)) * 255);
};

/** A decoded picture in linear colour, ready to sample. */
interface Texture {
  readonly width: number;
  readonly height: number;
  /** Linear red, green, blue, and alpha 0 to 1, per pixel. */
  readonly rgba: Float32Array;
}

function linearise(p: Picture): Texture {
  const rgba = new Float32Array(p.width * p.height * 4);
  for (let i = 0; i < p.width * p.height; i++) {
    rgba[i * 4] = SRGB_TO_LINEAR[p.data[i * 4]!]!;
    rgba[i * 4 + 1] = SRGB_TO_LINEAR[p.data[i * 4 + 1]!]!;
    rgba[i * 4 + 2] = SRGB_TO_LINEAR[p.data[i * 4 + 2]!]!;
    rgba[i * 4 + 3] = p.data[i * 4 + 3]! / 255;
  }
  return { width: p.width, height: p.height, rgba };
}

/** Bilinear, repeating at the edges as glTF's default sampler does. */
function sample(t: Texture, u: number, v: number, out: Float32Array) {
  const x = (u - Math.floor(u)) * t.width - 0.5;
  const y = (v - Math.floor(v)) * t.height - 0.5;
  const x0 = Math.floor(x);
  const y0 = Math.floor(y);
  const fx = x - x0;
  const fy = y - y0;
  const wrapX = (i: number) => ((i % t.width) + t.width) % t.width;
  const wrapY = (i: number) => ((i % t.height) + t.height) % t.height;
  out.fill(0);
  for (const [dx, dy, w] of [
    [0, 0, (1 - fx) * (1 - fy)],
    [1, 0, fx * (1 - fy)],
    [0, 1, (1 - fx) * fy],
    [1, 1, fx * fy],
  ] as const) {
    const i = (wrapY(y0 + dy) * t.width + wrapX(x0 + dx)) * 4;
    for (let k = 0; k < 4; k++) out[k] = out[k]! + w * t.rgba[i + k]!;
  }
}

/**
 * A normal for each triangle corner: the faces round it that meet at less than the crease angle,
 * weighted by area. Corners are matched by position, so texture seams don't show.
 */
function cornerNormals(positions: Float32Array, indices: Uint32Array): Float32Array {
  const at = (i: number): Vec3 => [positions[i * 3]!, positions[i * 3 + 1]!, positions[i * 3 + 2]!];
  let extent = 0;
  for (let i = 0; i < positions.length; i++) extent = Math.max(extent, Math.abs(positions[i]!));
  const welded = weld(positions, indices, Math.max(extent, 1e-6) * 1e-5);
  const triangles = indices.length / 3;
  const face: Vec3[] = [];
  const unit: Vec3[] = [];
  const around = new Map<number, number[]>();
  for (let t = 0; t < triangles; t++) {
    const a = at(indices[t * 3]!);
    const n = cross(sub(at(indices[t * 3 + 1]!), a), sub(at(indices[t * 3 + 2]!), a));
    face.push(n);
    unit.push(dot(n, n) > 0 ? normalize(n) : [0, 0, 0]);
    for (let k = 0; k < 3; k++) {
      const v = welded[t * 3 + k]!;
      const list = around.get(v);
      if (list) list.push(t);
      else around.set(v, [t]);
    }
  }
  const out = new Float32Array(indices.length * 3);
  for (let t = 0; t < triangles; t++) {
    for (let k = 0; k < 3; k++) {
      let [x, y, z] = [0, 0, 0];
      for (const o of around.get(welded[t * 3 + k]!) ?? []) {
        if (dot(unit[t]!, unit[o]!) < CREASE_COS) continue;
        x += face[o]![0];
        y += face[o]![1];
        z += face[o]![2];
      }
      const n: Vec3 = x || y || z ? normalize([x, y, z]) : unit[t]!;
      out.set(n, (t * 3 + k) * 3);
    }
  }
  return out;
}

export async function renderThumbnail(
  mesh: SketchMesh,
  options: ThumbnailOptions = {},
): Promise<Picture> {
  const size = options.size ?? THUMBNAIL_SIZE;
  const view = viewOf(options.facing ?? 'front');
  const posed = canPose(mesh) ? poseMesh(mesh, 'stand') : mesh;
  const { positions, indices } = posed;
  const surface = posed.surface;
  const decode = options.decodeImage;
  const textures: (Texture | null)[] =
    surface && decode
      ? await Promise.all(
          surface.images.map((im) => decode(im.bytes, im.mimeType).then(linearise, () => null)),
        )
      : [];

  // Into the picture: x right, y down, depth away from the viewer.
  const n = positions.length / 3;
  const px = new Float32Array(n);
  const py = new Float32Array(n);
  const pz = new Float32Array(n);
  let [minX, maxX, minY, maxY] = [Infinity, -Infinity, Infinity, -Infinity];
  for (let v = 0; v < n; v++) {
    const p: Vec3 = [positions[v * 3]!, positions[v * 3 + 1]!, positions[v * 3 + 2]!];
    px[v] = dot(p, view.right);
    py[v] = dot(p, view.up);
    pz[v] = dot(p, view.forward);
    minX = Math.min(minX, px[v]!);
    maxX = Math.max(maxX, px[v]!);
    minY = Math.min(minY, py[v]!);
    maxY = Math.max(maxY, py[v]!);
  }
  const W = size * SUPERSAMPLE;
  const scale = n ? (W * (1 - 2 * MARGIN)) / Math.max(maxX - minX, maxY - minY, 1e-9) : 1;
  const [cx, cy] = [(minX + maxX) / 2, (minY + maxY) / 2];
  for (let v = 0; v < n; v++) {
    px[v] = (px[v]! - cx) * scale + W / 2;
    py[v] = W / 2 - (py[v]! - cy) * scale;
  }

  const normals = cornerNormals(positions, indices);
  const light = normalize([
    -0.75 * view.forward[0] + 0.55 * view.up[0] - 0.35 * view.right[0],
    -0.75 * view.forward[1] + 0.55 * view.up[1] - 0.35 * view.right[1],
    -0.75 * view.forward[2] + 0.55 * view.up[2] - 0.35 * view.right[2],
  ]);

  const colour = new Float32Array(W * W * 4); // linear, premultiplied
  const depth = new Float32Array(W * W).fill(Infinity);
  const texel = new Float32Array(4);
  const triangles = indices.length / 3;
  const materialOf = (t: number) => surface?.materials[surface.triangleMaterial[t]!];

  const draw = (t: number, blend: boolean) => {
    const [a, b, c] = [indices[t * 3]!, indices[t * 3 + 1]!, indices[t * 3 + 2]!];
    const area = (px[b]! - px[a]!) * (py[c]! - py[a]!) - (px[c]! - px[a]!) * (py[b]! - py[a]!);
    if (Math.abs(area) < 1e-12) return;
    const material = materialOf(t);
    const texture = material && material.image >= 0 ? (textures[material.image] ?? null) : null;
    const x0 = Math.max(0, Math.floor(Math.min(px[a]!, px[b]!, px[c]!)));
    const x1 = Math.min(W - 1, Math.ceil(Math.max(px[a]!, px[b]!, px[c]!)));
    const y0 = Math.max(0, Math.floor(Math.min(py[a]!, py[b]!, py[c]!)));
    const y1 = Math.min(W - 1, Math.ceil(Math.max(py[a]!, py[b]!, py[c]!)));
    for (let y = y0; y <= y1; y++) {
      const sy = y + SAMPLE_Y;
      for (let x = x0; x <= x1; x++) {
        const sx = x + SAMPLE_X;
        // Barycentric weights; either winding is drawn, as both sides of a card can be seen.
        const wa = ((px[b]! - sx) * (py[c]! - sy) - (px[c]! - sx) * (py[b]! - sy)) / area;
        const wb = ((px[c]! - sx) * (py[a]! - sy) - (px[a]! - sx) * (py[c]! - sy)) / area;
        const wc = 1 - wa - wb;
        if (wa < 0 || wb < 0 || wc < 0) continue;
        const i = y * W + x;
        const z = wa * pz[a]! + wb * pz[b]! + wc * pz[c]!;
        if (z >= depth[i]!) continue;

        let [r, g, bl, al] = material ? material.colour : [0.8, 0.8, 0.8, 1];
        if (surface) {
          const vc = surface.colours;
          r *= wa * vc[a * 4]! + wb * vc[b * 4]! + wc * vc[c * 4]!;
          g *= wa * vc[a * 4 + 1]! + wb * vc[b * 4 + 1]! + wc * vc[c * 4 + 1]!;
          bl *= wa * vc[a * 4 + 2]! + wb * vc[b * 4 + 2]! + wc * vc[c * 4 + 2]!;
          al *= wa * vc[a * 4 + 3]! + wb * vc[b * 4 + 3]! + wc * vc[c * 4 + 3]!;
          if (texture) {
            const uv = surface.uvs;
            sample(
              texture,
              wa * uv[a * 2]! + wb * uv[b * 2]! + wc * uv[c * 2]!,
              wa * uv[a * 2 + 1]! + wb * uv[b * 2 + 1]! + wc * uv[c * 2 + 1]!,
              texel,
            );
            r *= texel[0]!;
            g *= texel[1]!;
            bl *= texel[2]!;
            al *= texel[3]!;
          }
        }
        const mode = material?.alpha ?? 'OPAQUE';
        if (mode === 'OPAQUE') al = 1;
        else if (mode === 'MASK') {
          if (al < (material?.cutoff ?? 0.5)) continue;
          al = 1;
        } else if (al <= 0.01) continue;

        let shade = 1;
        if (!material?.unlit) {
          const k = t * 9;
          let nx = wa * normals[k]! + wb * normals[k + 3]! + wc * normals[k + 6]!;
          let ny = wa * normals[k + 1]! + wb * normals[k + 4]! + wc * normals[k + 7]!;
          let nz = wa * normals[k + 2]! + wb * normals[k + 5]! + wc * normals[k + 8]!;
          // Light the side the viewer sees.
          if (nx * view.forward[0] + ny * view.forward[1] + nz * view.forward[2] > 0)
            [nx, ny, nz] = [-nx, -ny, -nz];
          const len = Math.hypot(nx, ny, nz) || 1;
          const lambert = (nx * light[0] + ny * light[1] + nz * light[2]) / len;
          shade = AMBIENT + DIFFUSE * Math.max(0, lambert);
        }
        // Over what is already there (nothing shows through a solid part, whose alpha is 1).
        const o = i * 4;
        const keep = 1 - al;
        colour[o] = r * shade * al + colour[o]! * keep;
        colour[o + 1] = g * shade * al + colour[o + 1]! * keep;
        colour[o + 2] = bl * shade * al + colour[o + 2]! * keep;
        colour[o + 3] = al + colour[o + 3]! * keep;
        // A nearly solid see-through part hides what's further back, as a solid one does.
        if (!blend || al > 0.95) depth[i] = z;
      }
    }
  };

  const seeThrough: number[] = [];
  for (let t = 0; t < triangles; t++) {
    if (materialOf(t)?.alpha === 'BLEND') seeThrough.push(t);
    else draw(t, false);
  }
  // See-through parts after the solid ones, furthest first.
  const far = (t: number) =>
    pz[indices[t * 3]!]! + pz[indices[t * 3 + 1]!]! + pz[indices[t * 3 + 2]!]!;
  seeThrough.sort((p, q) => far(q) - far(p) || p - q);
  for (const t of seeThrough) draw(t, true);

  // Average each block, then back to sRGB bytes without premultiplying.
  const data = new Uint8ClampedArray(size * size * 4);
  const block = SUPERSAMPLE * SUPERSAMPLE;
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      let [r, g, b, a] = [0, 0, 0, 0];
      for (let dy = 0; dy < SUPERSAMPLE; dy++) {
        for (let dx = 0; dx < SUPERSAMPLE; dx++) {
          const o = ((y * SUPERSAMPLE + dy) * W + x * SUPERSAMPLE + dx) * 4;
          r += colour[o]!;
          g += colour[o + 1]!;
          b += colour[o + 2]!;
          a += colour[o + 3]!;
        }
      }
      const o = (y * size + x) * 4;
      if (a <= 0) continue;
      data[o] = toSrgbByte(r / a);
      data[o + 1] = toSrgbByte(g / a);
      data[o + 2] = toSrgbByte(b / a);
      data[o + 3] = Math.round((a / block) * 255);
    }
  }
  return { width: size, height: size, data };
}
