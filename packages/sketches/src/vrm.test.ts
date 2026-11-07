import { describe, expect, it } from 'vitest';
import { WebIO } from '@gltf-transform/core';
import { EXTTextureWebP } from '@gltf-transform/extensions';
import { canPose } from './pose.ts';
import { meshFromModel, readModel } from './vrm.ts';
import { box, documentFromMesh, figure, glbFromMesh, vrmFromMesh } from './testing.ts';

const vrm = (version: '0' | '1') => vrmFromMesh(figure(), version);

const zOf = (positions: Float32Array) =>
  Array.from({ length: positions.length / 3 }, (_, i) => positions[i * 3 + 2]!);

describe('readModel', () => {
  it('reads a plain binary glTF as it is', async () => {
    const model = await readModel(await glbFromMesh(box([0, 0, 0], [1, 1, 1])));
    expect(model.vrm).toBeNull();
  });

  it('reads WebP textures, as the build makes them (EXT_texture_webp)', async () => {
    const doc = documentFromMesh(box([0, 0, 0], [1, 1, 1]));
    // A lossless WebP header: 300 × 200 pixels.
    const webp = new Uint8Array(26);
    webp.set([0x52, 0x49, 0x46, 0x46, 18, 0, 0, 0, 0x57, 0x45, 0x42, 0x50, 0x56, 0x50, 0x38, 0x4c]);
    const view = new DataView(webp.buffer);
    view.setUint32(16, 6, true);
    view.setUint8(20, 0x2f);
    view.setUint32(21, 299 | (199 << 14), true);
    const texture = doc.createTexture('t').setImage(webp).setMimeType('image/webp');
    doc
      .getRoot()
      .listMeshes()[0]!
      .listPrimitives()[0]!
      .setMaterial(doc.createMaterial('m').setBaseColorTexture(texture));
    doc.createExtension(EXTTextureWebP).setRequired(true);
    const bytes = await new WebIO().registerExtensions([EXTTextureWebP]).writeBinary(doc);
    const model = await readModel(bytes);
    expect(model.doc.getRoot().listTextures()[0]!.getSize()).toEqual([300, 200]);
  });

  it('names VRM bones from the VRM table, so any VRM can be posed', async () => {
    for (const version of ['0', '1'] as const) {
      const model = await readModel(await vrm(version));
      expect(model.vrm).toBe(version);
      const names = model.doc
        .getRoot()
        .listNodes()
        .map((n) => n.getName());
      expect(names).toContain('leftUpperArm');
      expect(names).not.toContain('Bone3');
    }
  });
});

describe('meshFromModel', () => {
  it('turns a VRM 0.x avatar, which faces -Z, to face +Z; VRM 1.0 already faces +Z', async () => {
    const plain = figure();
    const nose = Math.max(...zOf(plain.positions)); // the nose and toes point +Z
    const v1 = await meshFromModel(await vrm('1'));
    expect(Math.max(...zOf(v1.positions))).toBeCloseTo(nose, 4);
    const v0 = await meshFromModel(await vrm('0'));
    expect(Math.min(...zOf(v0.positions))).toBeCloseTo(-nose, 4);
    expect(canPose(v0)).toBe(true);
  });
});
