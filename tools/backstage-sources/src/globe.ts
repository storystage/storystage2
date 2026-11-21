/**
 * The Sun, the Moon and the planets, made by the build from flat pictures (the owner's choice of
 * 21 Nov 2026: Solar System Scope's textures, CC BY 4.0). Each is a sphere one metre across with
 * the picture wrapped round it, its longitude 0 facing the front (+Z), north up; Saturn adds its
 * ring from a second picture, read from its inner edge to its outer. The Sun glows with its own
 * picture. The build then reduces, sizes and stands it as any model (`build.ts`).
 */
import { Document, type Texture } from '@gltf-transform/core';

export interface Globe {
  /** A ring round the equator: its picture, in the same repository and commit, and its edges in
   * radii of the globe. */
  readonly ring?: { readonly path: string; readonly inner: number; readonly outer: number };
  /** Lit by itself, as the Sun. */
  readonly glow?: boolean;
}

/** Segments round the equator and from pole to pole: 4,096 triangles. */
const AROUND = 64;
const DOWN = 32;
const RING_AROUND = 128;

/** What's wrong with a `globe`, or null. */
export function globeProblem(v: unknown): string | null {
  if (typeof v !== 'object' || v === null || Array.isArray(v))
    return 'globe must be { ring?, glow? }.';
  const { ring, glow, ...rest } = v as Record<string, unknown>;
  if (Object.keys(rest).length) return 'globe has only ring and glow.';
  if (glow !== undefined && typeof glow !== 'boolean') return 'globe.glow must be true or false.';
  if (ring !== undefined) {
    if (typeof ring !== 'object' || ring === null)
      return 'globe.ring must be { path, inner, outer }.';
    const { path, inner, outer, ...more } = ring as Record<string, unknown>;
    if (Object.keys(more).length) return 'globe.ring has only path, inner and outer.';
    if (typeof path !== 'string' || !/^[\w./ -]+\.(png|webp)$/.test(path) || path.includes('..'))
      return "globe.ring.path must be its picture's path, .png or .webp, with its transparency.";
    if (
      typeof inner !== 'number' ||
      typeof outer !== 'number' ||
      !(inner > 1 && outer > inner && outer < 10)
    )
      return 'globe.ring needs inner and outer edges in radii, 1 < inner < outer < 10.';
  }
  return null;
}

type Picture = { readonly bytes: Uint8Array; readonly mimeType: string };

/** The globe as a glTF document: the picture's sphere, and its ring if it has one. */
export function makeGlobe(name: string, picture: Picture, globe: Globe, ring?: Picture): Document {
  const doc = new Document();
  const buffer = doc.createBuffer();
  const accessor = (
    type: 'VEC3' | 'VEC2' | 'SCALAR',
    array: Float32Array<ArrayBuffer> | Uint16Array<ArrayBuffer>,
  ) => doc.createAccessor().setType(type).setArray(array).setBuffer(buffer);
  const texture = (p: Picture, what: string): Texture =>
    doc.createTexture(`${name} ${what}`).setImage(p.bytes).setMimeType(p.mimeType);

  // The sphere, radius 0.5 round the origin. u runs east from longitude -180; v from north.
  const positions: number[] = [];
  const normals: number[] = [];
  const uvs: number[] = [];
  for (let j = 0; j <= DOWN; j++) {
    const v = j / DOWN;
    const phi = v * Math.PI;
    for (let i = 0; i <= AROUND; i++) {
      const u = i / AROUND;
      const theta = u * 2 * Math.PI;
      // u = 0.5 (longitude 0) faces +Z; east is to the viewer's right, +X.
      const n = [-Math.sin(phi) * Math.sin(theta), Math.cos(phi), -Math.sin(phi) * Math.cos(theta)];
      normals.push(...n);
      positions.push(...n.map((c) => c * 0.5));
      uvs.push(u, v);
    }
  }
  const indices: number[] = [];
  for (let j = 0; j < DOWN; j++)
    for (let i = 0; i < AROUND; i++) {
      const a = j * (AROUND + 1) + i;
      const b = a + AROUND + 1;
      // Wound so each face looks outwards.
      if (j > 0) indices.push(a, b, a + 1);
      if (j < DOWN - 1) indices.push(a + 1, b, b + 1);
    }
  const surface = doc
    .createMaterial(`${name} surface`)
    .setBaseColorTexture(texture(picture, 'surface'))
    .setMetallicFactor(0)
    .setRoughnessFactor(1);
  if (globe.glow)
    surface.setEmissiveTexture(surface.getBaseColorTexture()).setEmissiveFactor([1, 1, 1]);
  const mesh = doc.createMesh(name).addPrimitive(
    doc
      .createPrimitive()
      .setAttribute('POSITION', accessor('VEC3', new Float32Array(positions)))
      .setAttribute('NORMAL', accessor('VEC3', new Float32Array(normals)))
      .setAttribute('TEXCOORD_0', accessor('VEC2', new Float32Array(uvs)))
      .setIndices(accessor('SCALAR', new Uint16Array(indices)))
      .setMaterial(surface),
  );

  if (globe.ring && ring) {
    const { inner, outer } = globe.ring;
    const rp: number[] = [];
    const rn: number[] = [];
    const ru: number[] = [];
    for (let i = 0; i <= RING_AROUND; i++) {
      const t = (i / RING_AROUND) * 2 * Math.PI;
      for (const [r, u] of [
        [inner, 0],
        [outer, 1],
      ] as const) {
        rp.push(Math.cos(t) * r * 0.5, 0, Math.sin(t) * r * 0.5);
        rn.push(0, 1, 0);
        ru.push(u, 0.5);
      }
    }
    const ri: number[] = [];
    for (let i = 0; i < RING_AROUND; i++) {
      const a = i * 2;
      ri.push(a, a + 1, a + 2, a + 1, a + 3, a + 2);
    }
    const band = doc
      .createMaterial(`${name} ring`)
      .setBaseColorTexture(texture(ring, 'ring'))
      .setAlphaMode('BLEND')
      .setDoubleSided(true)
      .setMetallicFactor(0)
      .setRoughnessFactor(1);
    mesh.addPrimitive(
      doc
        .createPrimitive()
        .setAttribute('POSITION', accessor('VEC3', new Float32Array(rp)))
        .setAttribute('NORMAL', accessor('VEC3', new Float32Array(rn)))
        .setAttribute('TEXCOORD_0', accessor('VEC2', new Float32Array(ru)))
        .setIndices(accessor('SCALAR', new Uint16Array(ri)))
        .setMaterial(band),
    );
  }
  doc.getRoot().setDefaultScene(doc.createScene(name).addChild(doc.createNode(name).setMesh(mesh)));
  return doc;
}
