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

  it('reads a second set of joints and weights, keeping the strongest four', () => {
    const doc = documentFromMesh(figure());
    const prim = doc.getRoot().listMeshes()[0]!.listPrimitives()[0]!;
    const n = prim.getAttribute('POSITION')!.getCount();
    const w0 = new Float32Array(n * 4);
    const j1 = new Uint16Array(n * 4);
    const w1 = new Float32Array(n * 4);
    for (let v = 0; v < n; v++) {
      w0[v * 4] = 0.3; // each vertex's own node, from the figure
      j1[v * 4] = 0; // hips
      w1[v * 4] = 0.7;
    }
    const buffer = doc.getRoot().listBuffers()[0]!;
    const acc = (a: Float32Array | Uint16Array) =>
      doc.createAccessor().setType('VEC4').setArray(a).setBuffer(buffer);
    prim.setAttribute('WEIGHTS_0', acc(w0));
    prim.setAttribute('JOINTS_1', acc(j1)).setAttribute('WEIGHTS_1', acc(w1));
    const mesh = meshFromDocument(doc);
    const hips = mesh.nodes!.findIndex((x) => x.name === 'hips');
    const head = mesh.nodes!.findIndex((x) => x.name === 'head');
    expect(mesh.influences!.nodes[0]).toBe(hips);
    expect(mesh.influences!.weights[0]).toBeCloseTo(0.7);
    // A head vertex: hips first (0.7), then its own head joint (0.3).
    const v = [...Array(n).keys()].find((i) => mesh.influences!.nodes[i * 4 + 1] === head)!;
    expect(mesh.influences!.weights[v * 4 + 1]).toBeCloseTo(0.3);
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
