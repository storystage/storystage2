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
import { EXTTextureWebP, type PBRSpecularGlossiness } from '@gltf-transform/extensions';
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

/**
 * Materials in glTF's older specular-glossiness workflow (`KHR_materials_pbrSpecularGlossiness`,
 * which some scans still use) as ordinary base-colour ones, which every renderer reads, our
 * thumbnails and sketches included: the diffuse picture and colour become the base colour, the
 * surface isn't metal, and its roughness is one less its glossiness. No pixel is touched.
 */
function plainMaterials(doc: Document): void {
  const name = 'KHR_materials_pbrSpecularGlossiness';
  const extension = doc
    .getRoot()
    .listExtensionsUsed()
    .find((e) => e.extensionName === name);
  if (!extension) return;
  for (const material of doc.getRoot().listMaterials()) {
    const sg = material.getExtension<PBRSpecularGlossiness>(name);
    if (!sg) continue;
    material.setBaseColorFactor(sg.getDiffuseFactor());
    const picture = sg.getDiffuseTexture();
    if (picture) {
      material.setBaseColorTexture(picture);
      const from = sg.getDiffuseTextureInfo()!;
      material
        .getBaseColorTextureInfo()!
        .setTexCoord(from.getTexCoord())
        .setWrapS(from.getWrapS())
        .setWrapT(from.getWrapT());
    }
    material.setMetallicFactor(0).setRoughnessFactor(1 - sg.getGlossinessFactor());
    material.setExtension(name, null);
  }
  extension.dispose();
}

/** How far meshoptimizer may move the surface, as a share of the model's size: gentle first. */
const ERRORS = [0.005, 0.01, 0.02, 0.05, 0.1];

/**
 * The last step, only when the gentle ones stall above `target`: meshoptimizer's attribute-aware
 * simplifier in its Permissive mode, which may collapse edges across a picture's seams, weighing
 * the texture coordinates so the picture still lands where it should. Each primitive takes its
 * share of the target. It keeps a subset of the original corners, as the gentle steps do, so
 * joints and weights carry over. A primitive with no indices, or with positions not stored as
 * plain floats, is left as it is.
 */
function permissive(doc: Document, target: number): void {
  const total = countTriangles(doc);
  for (const mesh of doc.getRoot().listMeshes())
    for (const prim of mesh.listPrimitives()) {
      const indices = prim.getIndices()?.getArray();
      const positions = prim.getAttribute('POSITION')?.getArray();
      if (prim.getMode() !== 4 || !indices || !(positions instanceof Float32Array)) continue;
      const want = Math.max(3, Math.floor((indices.length * target) / total / 3) * 3);
      if (indices.length <= want) continue;
      const uv = prim.getAttribute('TEXCOORD_0')?.getArray();
      const triangles = new Uint32Array(indices);
      let kept: Uint32Array = triangles;
      for (const error of [0.02, 0.05, 0.1]) {
        [kept] =
          uv instanceof Float32Array
            ? MeshoptSimplifier.simplifyWithAttributes(
                triangles,
                positions,
                3,
                uv,
                2,
                [1, 1],
                null,
                want,
                error,
                ['Permissive'],
              )
            : MeshoptSimplifier.simplify(triangles, positions, 3, want, error, ['Permissive']);
        if (kept.length <= want) break;
      }
      const old = prim.getIndices()!;
      prim.setIndices(
        doc
          .createAccessor()
          .setType('SCALAR')
          .setArray(new Uint32Array(kept))
          .setBuffer(old.getBuffer()),
      );
    }
}

export async function reduceModel(
  doc: Document,
  budget: Budget,
  options: { readonly encodeTexture?: TextureEncoder } = {},
): Promise<ReduceReport> {
  const before = { triangles: countTriangles(doc), textureMaxPx: largestTexture(doc) };
  plainMaterials(doc);
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
    // Scans whose pictures are cut into many small pieces stall above the budget, because the
    // gentle steps never collapse an edge along a picture's seam (museum scans, 11 Nov 2026).
    // Aimed a little under, since each primitive's share is rounded.
    if (countTriangles(doc) > budget.triangles) permissive(doc, budget.triangles * 0.98);
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
