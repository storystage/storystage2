import { describe, expect, it } from 'vitest';
import { Document } from '@gltf-transform/core';
import { meshFromDocument, meshFromGlb } from './gltf.ts';
import { canPose, poseMesh } from './pose.ts';
import { renderSketch } from './render.ts';
import { box, documentFromMesh, figure, glbFromMesh } from './testing.ts';

const sorted = (a: Float32Array) =>
  [...a].map((v) => Math.round(v * 1e4) / 1e4).sort((x, y) => x - y);

describe('meshFromDocument', () => {
  it('reads a plain mesh, placed by its node', () => {
    const doc = documentFromMesh(box([0, 0, 0], [1, 1, 1]));
    doc.getRoot().listNodes()[0]!.setTranslation([2, 0, 0]);
    const mesh = meshFromDocument(doc);
    expect(mesh.indices).toHaveLength(36);
    const xs = Array.from({ length: mesh.positions.length / 3 }, (_, i) => mesh.positions[i * 3]!);
    expect(Math.min(...xs)).toBeCloseTo(2);
    expect(Math.max(...xs)).toBeCloseTo(3);
    expect(mesh.nodes).toBeUndefined();
  });

  it('reads a rigged model in its rest pose, ready to pose', () => {
    const fig = figure();
    const mesh = meshFromDocument(documentFromMesh(fig));
    expect(sorted(mesh.positions)).toEqual(sorted(fig.positions));
    expect(canPose(mesh)).toBe(true);
    // Posed after reading, it matches the figure posed directly.
    expect(sorted(poseMesh(mesh, 'walk').positions)).toEqual(
      sorted(poseMesh(fig, 'walk').positions),
    );
  });

  it('skips points and lines, and copes with an empty document', () => {
    const doc = documentFromMesh(box([0, 0, 0], [1, 1, 1]));
    doc.getRoot().listMeshes()[0]!.listPrimitives()[0]!.setMode(1);
    expect(meshFromDocument(doc).indices).toHaveLength(0);
    expect(meshFromDocument(new Document()).positions).toHaveLength(0);
  });
});

describe('meshFromGlb', () => {
  it('reads a binary glTF and draws the same sketch', async () => {
    const fig = figure();
    const mesh = await meshFromGlb(await glbFromMesh(fig));
    const a = renderSketch(poseMesh(mesh, 'stand'), 'front');
    const b = renderSketch(poseMesh(fig, 'stand'), 'front');
    expect(a.width).toBe(b.width);
    expect(a.metrics.fillRatio).toBeCloseTo(b.metrics.fillRatio, 2);
  });
});
