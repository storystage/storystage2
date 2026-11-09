/**
 * WP3.9: reduces a model to its device budget (`budget.ts`; `docs/spec/17-backstage.md`,
 * section 4). The same code runs in the build tools and, in a Web Worker, for imports (3.11).
 *
 * With glTF Transform (MIT) and meshoptimizer (MIT): drop what nothing uses, join duplicate
 * corners, then simplify meshes only as far as the budget needs, gently first. Simplifying keeps
 * a subset of the original corners, so a character's joints and weights carry over unchanged.
 *
 * Textures are shrunk to the budget and made WebP (owner, 7 Nov 2026) by an encoder the caller
 * passes: sharp in the build tools (build-only, its libvips is LGPL), the browser's own canvas in
 * the app. Safari's canvas can't make WebP, so an encoder may say it made PNG instead (spec 17,
 * section 5). Without one, textures are left as they are and the report says the model doesn't fit.
 */
import type { Document } from '@gltf-transform/core';
import { EXTTextureWebP } from '@gltf-transform/extensions';
import { dedup, prune, simplify, weld } from '@gltf-transform/functions';
import { MeshoptSimplifier } from 'meshoptimizer';
import type { Budget } from './budget.ts';

// Teaches glTF Transform to read a WebP's size. Creating the extension doesn't, and without it
// a WebP texture measures 0 pixels, so every reduced model would seem to fit.
EXTTextureWebP.register();

/** A picture an encoder made, and which kind it is. */
export interface EncodedTexture {
  readonly bytes: Uint8Array;
  readonly mimeType: 'image/webp' | 'image/png';
}

/**
 * Encodes one image no larger than `maxPx` on its longer side: as WebP (bytes alone), or, where
 * WebP can't be made, as whichever kind it says.
 */
export type TextureEncoder = (
  image: Uint8Array,
  mimeType: string,
  maxPx: number,
  size: readonly [number, number],
) => Promise<Uint8Array | EncodedTexture>;

export interface ReduceReport {
  readonly before: Budget;
  readonly after: Budget;
  /** Whether any mesh was simplified. */
  readonly simplified: boolean;
  /** Whether the model now fits its budget. */
  readonly fits: boolean;
}

const TRIANGLES = 4;

export function countTriangles(doc: Document): number {
  let n = 0;
  for (const mesh of doc.getRoot().listMeshes())
    for (const prim of mesh.listPrimitives()) {
      if (prim.getMode() !== TRIANGLES) continue;
      const count = prim.getIndices()?.getCount() ?? prim.getAttribute('POSITION')?.getCount() ?? 0;
      n += Math.floor(count / 3);
    }
  return n;
}

/** The longer side of the largest texture, in pixels; 0 with no textures. */
export function largestTexture(doc: Document): number {
  return Math.max(
    0,
    ...doc
      .getRoot()
      .listTextures()
      .map((t) => Math.max(...(t.getSize() ?? [0, 0]))),
  );
}

/**
 * Removes a mesh placed twice in the same place: two nodes with the same world transform whose
 * meshes have the same primitives (after `dedup`, the same accessors and materials), in any
 * order. Some converted models carry such a copy. It costs triangles, and the sketch renderer
 * sees two coincident surfaces and draws nothing clean. Gives how many it removed.
 */
export function dropDuplicateInstances(doc: Document): number {
  const root = doc.getRoot();
  const accessors = root.listAccessors();
  const materials = root.listMaterials();
  const seen = new Set<string>();
  let dropped = 0;
  for (const node of root.listNodes()) {
    const mesh = node.getMesh();
    if (!mesh) continue;
    const parts = mesh
      .listPrimitives()
      .map((p) =>
        [
          p.getMode(),
          accessors.indexOf(p.getIndices()!),
          ...p.listSemantics().map((s) => `${s}:${accessors.indexOf(p.getAttribute(s)!)}`),
          materials.indexOf(p.getMaterial()!),
        ].join(','),
      )
      .sort();
    const where = node
      .getWorldMatrix()
      .map((v) => Math.round(v * 1e5) / 1e5)
      .join(',');
    const key = `${where}|${node.getSkin() ? 'skin' : ''}|${parts.join(';')}`;
    if (seen.has(key)) {
      node.setMesh(null);
      dropped++;
    } else seen.add(key);
  }
  return dropped;
}

/** How far meshoptimizer may move the surface, as a share of the model's size: gentle first. */
const ERRORS = [0.005, 0.01, 0.02, 0.05, 0.1];

export async function reduceModel(
  doc: Document,
  budget: Budget,
  options: { readonly encodeTexture?: TextureEncoder } = {},
): Promise<ReduceReport> {
  const before = { triangles: countTriangles(doc), textureMaxPx: largestTexture(doc) };
  await doc.transform(prune(), dedup());
  if (dropDuplicateInstances(doc) > 0) await doc.transform(prune());
  await doc.transform(weld());

  let simplified = false;
  if (countTriangles(doc) > budget.triangles) {
    await MeshoptSimplifier.ready;
    for (const error of ERRORS) {
      const ratio = budget.triangles / countTriangles(doc);
      await doc.transform(simplify({ simplifier: MeshoptSimplifier, ratio, error }));
      simplified = true;
      if (countTriangles(doc) <= budget.triangles) break;
    }
    await doc.transform(prune());
  }

  if (options.encodeTexture) {
    let webp = false;
    for (const texture of doc.getRoot().listTextures()) {
      const image = texture.getImage();
      const size = texture.getSize();
      if (!image || !size) continue;
      const tooBig = Math.max(...size) > budget.textureMaxPx;
      if (!tooBig && texture.getMimeType() === 'image/webp') continue;
      const made = await options.encodeTexture(
        image,
        texture.getMimeType(),
        budget.textureMaxPx,
        size,
      );
      const encoded = made instanceof Uint8Array ? { bytes: made, mimeType: 'image/webp' } : made;
      texture.setImage(encoded.bytes);
      texture.setMimeType(encoded.mimeType);
      if (encoded.mimeType === 'image/webp') webp = true;
    }
    if (webp) doc.createExtension(EXTTextureWebP).setRequired(true);
  }

  const after = { triangles: countTriangles(doc), textureMaxPx: largestTexture(doc) };
  return {
    before,
    after,
    simplified,
    fits: after.triangles <= budget.triangles && after.textureMaxPx <= budget.textureMaxPx,
  };
}
