import { describe, expect, it } from 'vitest';
import { Document, WebIO } from '@gltf-transform/core';
import { ALL_EXTENSIONS, KHRDracoMeshCompression } from '@gltf-transform/extensions';
import draco3d from 'draco3dgltf';
import { undraco, usesDraco } from './draco.ts';

/** A small square, two triangles, as a binary glTF; Draco-compressed if asked. */
async function square(compressed: boolean): Promise<Uint8Array> {
  const doc = new Document();
  const buffer = doc.createBuffer();
  const prim = doc
    .createPrimitive()
    .setAttribute(
      'POSITION',
      doc
        .createAccessor()
        .setType('VEC3')
        .setArray(new Float32Array([0, 0, 0, 1, 0, 0, 1, 1, 0, 0, 1, 0]))
        .setBuffer(buffer),
    )
    .setIndices(
      doc
        .createAccessor()
        .setType('SCALAR')
        .setArray(new Uint16Array([0, 1, 2, 0, 2, 3]))
        .setBuffer(buffer),
    );
  const node = doc.createNode('square').setMesh(doc.createMesh().addPrimitive(prim));
  doc.getRoot().setDefaultScene(doc.createScene().addChild(node));
  const io = new WebIO().registerExtensions(ALL_EXTENSIONS);
  if (compressed) {
    doc.createExtension(KHRDracoMeshCompression).setRequired(true);
    io.registerDependencies({ 'draco3d.encoder': await draco3d.createEncoderModule() });
  }
  return io.writeBinary(doc);
}

describe('undraco (NASA’s models; the owner’s choice of 21 Nov 2026)', () => {
  it('decodes a Draco-compressed model into plain meshes', async () => {
    const packed = await square(true);
    expect(usesDraco(packed)).toBe(true);
    const plain = await undraco(packed);
    expect(usesDraco(plain)).toBe(false);
    const doc = await new WebIO().registerExtensions(ALL_EXTENSIONS).readBinary(plain);
    const prim = doc.getRoot().listMeshes()[0]!.listPrimitives()[0]!;
    expect(prim.getAttribute('POSITION')!.getCount()).toBe(4);
    expect(prim.getIndices()!.getCount()).toBe(6);
    expect(
      doc
        .getRoot()
        .listExtensionsUsed()
        .map((e) => e.extensionName),
    ).not.toContain('KHR_draco_mesh_compression');
  });

  it('leaves a model without Draco byte for byte', async () => {
    const plain = await square(false);
    expect(await undraco(plain)).toBe(plain);
  });

  it('reads only a binary glTF’s own JSON chunk', () => {
    expect(
      usesDraco(new TextEncoder().encode('{"extensionsUsed":["KHR_draco_mesh_compression"]}')),
    ).toBe(false);
    expect(usesDraco(new Uint8Array(8))).toBe(false);
  });
});
