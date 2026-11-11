import { describe, expect, it } from 'vitest';
import { Document, type Node } from '@gltf-transform/core';
import { KHRMaterialsPBRSpecularGlossiness } from '@gltf-transform/extensions';
import { countTriangles, largestTexture, reduceModel, type TextureEncoder } from './optimize.ts';

/**
 * A sphere of radius 1 with `rings` × `segments` quads (two triangles each), optionally skinned
 * to two bones: the top half to one, the bottom half to the other.
 */
function sphere(rings: number, segments: number, skinned = false) {
  const doc = new Document();
  const buffer = doc.createBuffer();
  const positions: number[] = [];
  const joints: number[] = [];
  const weights: number[] = [];
  for (let r = 0; r <= rings; r++) {
    const phi = (Math.PI * r) / rings;
    for (let s = 0; s <= segments; s++) {
      const theta = (2 * Math.PI * s) / segments;
      const y = Math.cos(phi);
      positions.push(Math.sin(phi) * Math.cos(theta), y, Math.sin(phi) * Math.sin(theta));
      const top = (y + 1) / 2;
      joints.push(0, 1, 0, 0);
      weights.push(top, 1 - top, 0, 0);
    }
  }
  const indices: number[] = [];
  const at = (r: number, s: number) => r * (segments + 1) + s;
  for (let r = 0; r < rings; r++)
    for (let s = 0; s < segments; s++)
      indices.push(
        at(r, s),
        at(r + 1, s),
        at(r, s + 1),
        at(r, s + 1),
        at(r + 1, s),
        at(r + 1, s + 1),
      );
  const accessor = (
    type: 'VEC3' | 'VEC4' | 'SCALAR',
    array: Float32Array | Uint16Array | Uint32Array,
  ) => doc.createAccessor().setType(type).setArray(array).setBuffer(buffer);
  const prim = doc
    .createPrimitive()
    .setAttribute('POSITION', accessor('VEC3', new Float32Array(positions)))
    .setIndices(accessor('SCALAR', new Uint32Array(indices)));
  const mesh = doc.createMesh('ball').addPrimitive(prim);
  const node = doc.createNode('ball').setMesh(mesh);
  const scene = doc.createScene().addChild(node);
  doc.getRoot().setDefaultScene(scene);
  if (skinned) {
    const bones: Node[] = [
      doc.createNode('top').setTranslation([0, 0.5, 0]),
      doc.createNode('bottom'),
    ];
    for (const bone of bones) scene.addChild(bone);
    const inverse = new Float32Array([
      ...[1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, 0, -0.5, 0, 1],
      ...[1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1],
    ]);
    const skin = doc.createSkin().addJoint(bones[0]!).addJoint(bones[1]!);
    skin.setInverseBindMatrices(accessor('VEC4', inverse).setType('MAT4'));
    node.setSkin(skin);
    prim
      .setAttribute('JOINTS_0', accessor('VEC4', new Uint16Array(joints)))
      .setAttribute('WEIGHTS_0', accessor('VEC4', new Float32Array(weights)));
  }
  return doc;
}

/** The first bytes of a PNG: its signature and IHDR, which is all a size check reads. */
function png(width: number, height: number): Uint8Array {
  const bytes = new Uint8Array(33);
  bytes.set([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0, 0, 0, 13, 0x49, 0x48, 0x44, 0x52]);
  const view = new DataView(bytes.buffer);
  view.setUint32(16, width);
  view.setUint32(20, height);
  return bytes;
}

function withTexture(doc: Document, image: Uint8Array, mimeType = 'image/png') {
  const texture = doc.createTexture('skin').setImage(image).setMimeType(mimeType);
  const material = doc.createMaterial('skin').setBaseColorTexture(texture);
  for (const mesh of doc.getRoot().listMeshes())
    for (const prim of mesh.listPrimitives()) prim.setMaterial(material);
  return texture;
}

/** A stand-in encoder: a WebP of the size asked for, recorded. */
function fakeEncoder() {
  const calls: { from: number[]; maxPx: number }[] = [];
  const encode: TextureEncoder = async (_image, _mimeType, maxPx, size) => {
    calls.push({ from: [...size], maxPx });
    const scale = Math.min(1, maxPx / Math.max(...size));
    const [w, h] = size.map((n) => Math.round(n * scale)) as [number, number];
    // A RIFF WebP header with a lossless (VP8L) chunk: its size, 14 bits each, after a 0x2f.
    const out = new Uint8Array(26);
    out.set([0x52, 0x49, 0x46, 0x46, 18, 0, 0, 0, 0x57, 0x45, 0x42, 0x50, 0x56, 0x50, 0x38, 0x4c]);
    const view = new DataView(out.buffer);
    view.setUint32(16, 6, true);
    view.setUint8(20, 0x2f);
    view.setUint32(21, ((w - 1) & 0x3fff) | (((h - 1) & 0x3fff) << 14), true);
    return out;
  };
  return { calls, encode };
}

const bounds = (doc: Document) => {
  const lo = [Infinity, Infinity, Infinity];
  const hi = [-Infinity, -Infinity, -Infinity];
  for (const mesh of doc.getRoot().listMeshes())
    for (const prim of mesh.listPrimitives()) {
      const pos = prim.getAttribute('POSITION')!;
      for (let i = 0; i < pos.getCount(); i++)
        pos.getElement(i, []).forEach((v, k) => {
          lo[k] = Math.min(lo[k]!, v);
          hi[k] = Math.max(hi[k]!, v);
        });
    }
  return [...lo, ...hi];
};

describe('countTriangles and largestTexture', () => {
  it('measure a model', () => {
    const doc = sphere(10, 20);
    expect(countTriangles(doc)).toBe(400);
    expect(largestTexture(doc)).toBe(0);
    withTexture(doc, png(512, 2048));
    expect(largestTexture(doc)).toBe(2048);
  });
});

/**
 * A sphere as a scan's picture cuts it: every quad its own island of the texture, so neighbouring
 * quads share positions but never texture coordinates, and no corner can be welded to another.
 */
function scan(rings: number, segments: number) {
  const doc = new Document();
  const buffer = doc.createBuffer();
  const positions: number[] = [];
  const uvs: number[] = [];
  const indices: number[] = [];
  const point = (r: number, s: number) => {
    const phi = (Math.PI * r) / rings;
    const theta = (2 * Math.PI * s) / segments;
    return [Math.sin(phi) * Math.cos(theta), Math.cos(phi), Math.sin(phi) * Math.sin(theta)];
  };
  const across = Math.ceil(Math.sqrt(rings * segments));
  const cell = 1 / across;
  let island = 0;
  for (let r = 0; r < rings; r++)
    for (let s = 0; s < segments; s++, island++) {
      const base = positions.length / 3;
      const u = (island % across) * cell;
      const v = Math.floor(island / across) * cell;
      for (const [dr, ds] of [
        [0, 0],
        [1, 0],
        [0, 1],
        [1, 1],
      ] as const) {
        positions.push(...point(r + dr, s + ds));
        uvs.push(u + ds * cell * 0.9, v + dr * cell * 0.9);
      }
      indices.push(base, base + 1, base + 2, base + 2, base + 1, base + 3);
    }
  const accessor = (type: 'VEC2' | 'VEC3' | 'SCALAR', array: Float32Array | Uint32Array) =>
    doc.createAccessor().setType(type).setArray(array).setBuffer(buffer);
  const prim = doc
    .createPrimitive()
    .setAttribute('POSITION', accessor('VEC3', new Float32Array(positions)))
    .setAttribute('TEXCOORD_0', accessor('VEC2', new Float32Array(uvs)))
    .setIndices(accessor('SCALAR', new Uint32Array(indices)));
  const node = doc.createNode('scan').setMesh(doc.createMesh('scan').addPrimitive(prim));
  doc.getRoot().setDefaultScene(doc.createScene().addChild(node));
  return doc;
}

describe('reduceModel', () => {
  it("brings a scan to its budget too, though its picture's seams stall the gentle steps", async () => {
    const doc = scan(60, 100); // 12,000 triangles, each quad its own island of the picture
    const before = bounds(doc);
    const report = await reduceModel(doc, { triangles: 4_000, textureMaxPx: 1024 });
    expect(report.after.triangles).toBeLessThanOrEqual(4_000);
    expect(report.after.triangles).toBeGreaterThan(1_000);
    expect(report.fits).toBe(true);
    bounds(doc).forEach((v, i) => expect(v).toBeCloseTo(before[i]!, 0));
  });

  it('brings a model down to its budget, keeping its shape', async () => {
    const doc = sphere(100, 200); // 40,000 triangles
    const before = bounds(doc);
    const report = await reduceModel(doc, { triangles: 20_000, textureMaxPx: 1024 });
    expect(report.before.triangles).toBe(40_000);
    expect(report.after.triangles).toBeLessThanOrEqual(20_000);
    expect(report.after.triangles).toBeGreaterThan(10_000);
    expect(report.after.triangles).toBe(countTriangles(doc));
    expect(report.fits).toBe(true);
    bounds(doc).forEach((v, i) => expect(v).toBeCloseTo(before[i]!, 1));
  });

  it('keeps a character skinned: every vertex keeps joints and weights that add up to 1', async () => {
    const doc = sphere(100, 200, true);
    const report = await reduceModel(doc, { triangles: 5_000, textureMaxPx: 1024 });
    expect(report.after.triangles).toBeLessThanOrEqual(5_000);
    const prim = doc.getRoot().listMeshes()[0]!.listPrimitives()[0]!;
    const weights = prim.getAttribute('WEIGHTS_0')!;
    expect(prim.getAttribute('JOINTS_0')!.getCount()).toBe(weights.getCount());
    for (let i = 0; i < weights.getCount(); i++)
      expect(weights.getElement(i, []).reduce((a, b) => a + b, 0)).toBeCloseTo(1, 4);
    expect(doc.getRoot().listSkins()[0]!.listJoints()).toHaveLength(2);
  });

  it('leaves a model already within its budget as it is', async () => {
    const doc = sphere(10, 20);
    const report = await reduceModel(doc, { triangles: 20_000, textureMaxPx: 1024 });
    expect(report.after.triangles).toBe(400);
    expect(report.simplified).toBe(false);
  });

  it('shrinks textures over budget to WebP with the encoder it is given', async () => {
    const doc = sphere(10, 20);
    const big = withTexture(doc, png(4096, 2048));
    const { calls, encode } = fakeEncoder();
    const report = await reduceModel(
      doc,
      { triangles: 20_000, textureMaxPx: 1024 },
      { encodeTexture: encode },
    );
    expect(calls).toEqual([{ from: [4096, 2048], maxPx: 1024 }]);
    expect(big.getMimeType()).toBe('image/webp');
    expect(big.getSize()).toEqual([1024, 512]);
    expect(report.after.textureMaxPx).toBe(1024);
    expect(
      doc
        .getRoot()
        .listExtensionsUsed()
        .map((e) => e.extensionName),
    ).toContain('EXT_texture_webp');
    expect(report.fits).toBe(true);
  });

  it('makes small PNG and JPEG textures WebP too, but leaves WebP ones within budget alone', async () => {
    const doc = sphere(10, 20);
    withTexture(doc, png(256, 256));
    const { calls, encode } = fakeEncoder();
    await reduceModel(doc, { triangles: 20_000, textureMaxPx: 1024 }, { encodeTexture: encode });
    expect(calls).toEqual([{ from: [256, 256], maxPx: 1024 }]);
    const again = fakeEncoder();
    await reduceModel(
      doc,
      { triangles: 20_000, textureMaxPx: 1024 },
      { encodeTexture: again.encode },
    );
    expect(again.calls).toEqual([]);
  });

  it('takes PNG from an encoder that cannot make WebP, as Safari makes (spec 17, section 5)', async () => {
    const doc = sphere(10, 20);
    const big = withTexture(doc, png(4096, 2048));
    const encode: TextureEncoder = async (_image, _mimeType, maxPx) => ({
      bytes: png(maxPx, maxPx / 2),
      mimeType: 'image/png',
    });
    const report = await reduceModel(
      doc,
      { triangles: 20_000, textureMaxPx: 1024 },
      { encodeTexture: encode },
    );
    expect(big.getMimeType()).toBe('image/png');
    expect(big.getSize()).toEqual([1024, 512]);
    expect(report.fits).toBe(true);
    expect(
      doc
        .getRoot()
        .listExtensionsUsed()
        .map((e) => e.extensionName),
    ).not.toContain('EXT_texture_webp');
  });

  it('says so when it cannot shrink textures without an encoder', async () => {
    const doc = sphere(10, 20);
    withTexture(doc, png(4096, 4096));
    const report = await reduceModel(doc, { triangles: 20_000, textureMaxPx: 1024 });
    expect(report.after.textureMaxPx).toBe(4096);
    expect(report.fits).toBe(false);
  });

  it('drops a mesh placed twice in the same place, keeping one placed elsewhere', async () => {
    const doc = sphere(10, 20); // 400 triangles
    const root = doc.getRoot();
    const [node] = root.listNodes();
    const scene = root.getDefaultScene()!;
    // The same shape again, as its own mesh, as some converted models carry it.
    const copy = doc.createMesh('copy');
    for (const p of node!.getMesh()!.listPrimitives()) copy.addPrimitive(p.clone());
    scene.addChild(doc.createNode('copy').setMesh(copy));
    // And once more, moved: that one is meant.
    scene.addChild(doc.createNode('moved').setMesh(node!.getMesh()).setTranslation([2, 0, 0]));
    const report = await reduceModel(doc, { triangles: 20_000, textureMaxPx: 1024 });
    expect(report.before.triangles).toBe(800);
    expect(report.after.triangles).toBe(400);
    expect(
      root
        .listNodes()
        .filter((n) => n.getMesh())
        .map((n) => n.getName()),
    ).toEqual([node!.getName(), 'moved']);
  });

  it('makes an older specular-glossiness material an ordinary base-colour one', async () => {
    const doc = sphere(4, 8);
    const picture = doc.createTexture('hull').setImage(png(64, 64)).setMimeType('image/png');
    const sg = doc.createExtension(KHRMaterialsPBRSpecularGlossiness);
    const material = doc
      .createMaterial('hull')
      .setExtension(
        'KHR_materials_pbrSpecularGlossiness',
        sg
          .createPBRSpecularGlossiness()
          .setDiffuseFactor([0.5, 0.25, 1, 1])
          .setDiffuseTexture(picture)
          .setGlossinessFactor(0.2),
      );
    doc.getRoot().listMeshes()[0]!.listPrimitives()[0]!.setMaterial(material);
    await reduceModel(doc, { triangles: 10_000, textureMaxPx: 1024 });
    const after = doc.getRoot().listMaterials()[0]!;
    expect(after.getBaseColorTexture()).toBe(picture);
    expect(after.getBaseColorFactor()).toEqual([0.5, 0.25, 1, 1]);
    expect(after.getMetallicFactor()).toBe(0);
    expect(after.getRoughnessFactor()).toBeCloseTo(0.8);
    expect(after.getExtension('KHR_materials_pbrSpecularGlossiness')).toBeNull();
    expect(
      doc
        .getRoot()
        .listExtensionsUsed()
        .map((e) => e.extensionName),
    ).not.toContain('KHR_materials_pbrSpecularGlossiness');
  });

  it('drops what nothing uses', async () => {
    const doc = sphere(10, 20);
    doc.createTexture('unused').setImage(png(64, 64)).setMimeType('image/png');
    doc.createMaterial('unused');
    await reduceModel(doc, { triangles: 20_000, textureMaxPx: 1024 });
    expect(doc.getRoot().listTextures()).toHaveLength(0);
    expect(doc.getRoot().listMaterials()).toHaveLength(0);
  });
});
