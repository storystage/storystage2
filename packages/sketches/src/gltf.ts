/**
 * Reads a glTF model into a `SketchMesh`, with glTF Transform (MIT; workplan 3.9 uses it too).
 * Works the same in Node (`tools/make-sketches`) and in a Web Worker (imports, 3.11).
 *
 * Every node becomes a `SketchNode`. Skinned vertices are moved to the rest pose and weighted
 * to their joints; other vertices are weighted wholly to the node that holds them, so a hat on
 * a head bone follows the head when the model is posed.
 */
import { Primitive, WebIO, type Document, type Node } from '@gltf-transform/core';
import { IDENTITY, multiply, transformPoint, type Mat4, type Vec3 } from './math.ts';
import type { SketchMesh, SketchNode } from './mesh.ts';

export async function meshFromGlb(bytes: Uint8Array): Promise<SketchMesh> {
  return meshFromDocument(await new WebIO().readBinary(bytes));
}

export function meshFromDocument(doc: Document): SketchMesh {
  const root = doc.getRoot();
  const scene = root.getDefaultScene() ?? root.listScenes()[0];
  const order: Node[] = [];
  const index = new Map<Node, number>();
  const parentOf: number[] = [];
  const visit = (node: Node, parent: number) => {
    if (index.has(node)) return;
    index.set(node, order.length);
    order.push(node);
    parentOf.push(parent);
    const me = order.length - 1;
    for (const child of node.listChildren()) visit(child, me);
  };
  for (const node of scene ? scene.listChildren() : []) visit(node, -1);

  const nodes: SketchNode[] = order.map((n, i) => ({
    name: n.getName() || `node${i}`,
    parent: parentOf[i]!,
    local: [...n.getMatrix()],
  }));
  const world: Mat4[] = [];
  nodes.forEach((n, i) => {
    world[i] = n.parent < 0 ? n.local : multiply(world[n.parent]!, n.local);
  });

  const positions: number[] = [];
  const indices: number[] = [];
  const infNodes: number[] = [];
  const infWeights: number[] = [];
  const jointSet = new Set<number>();
  const el: number[] = [];

  order.forEach((node, ni) => {
    const mesh = node.getMesh();
    if (!mesh) return;
    const skin = node.getSkin();
    const skinJoints = skin ? skin.listJoints().map((j) => index.get(j)) : [];
    const ibm = skin?.getInverseBindMatrices() ?? null;
    const jointMats: Mat4[] = skinJoints.map((j, k) => {
      if (j === undefined) return IDENTITY;
      jointSet.add(j);
      const inv = ibm ? (ibm.getElement(k, el) as number[]).slice(0, 16) : [...IDENTITY];
      return multiply(world[j]!, inv);
    });
    for (const prim of mesh.listPrimitives()) {
      if (prim.getMode() !== Primitive.Mode.TRIANGLES) continue;
      const pos = prim.getAttribute('POSITION');
      if (!pos) continue;
      const jointsAttr = skin ? prim.getAttribute('JOINTS_0') : null;
      const weightsAttr = skin ? prim.getAttribute('WEIGHTS_0') : null;
      const base = positions.length / 3;
      for (let v = 0; v < pos.getCount(); v++) {
        const p = pos.getElement(v, el).slice(0, 3) as unknown as Vec3;
        if (jointsAttr && weightsAttr) {
          const js = jointsAttr.getElement(v, []);
          const ws = weightsAttr.getElement(v, []);
          const total = ws.reduce((a, b) => a + b, 0) || 1;
          let [x, y, z] = [0, 0, 0];
          for (let k = 0; k < 4; k++) {
            const w = (ws[k] ?? 0) / total;
            const j = skinJoints[js[k] ?? 0];
            infNodes.push(j ?? 0);
            infWeights.push(j === undefined ? 0 : w);
            if (w === 0 || j === undefined) continue;
            const q = transformPoint(jointMats[js[k]!]!, p);
            x += w * q[0];
            y += w * q[1];
            z += w * q[2];
          }
          positions.push(x, y, z);
        } else {
          positions.push(...transformPoint(world[ni]!, p));
          infNodes.push(ni, 0, 0, 0);
          infWeights.push(1, 0, 0, 0);
        }
      }
      const idx = prim.getIndices();
      const count = idx ? idx.getCount() : pos.getCount();
      for (let i = 0; i + 2 < count; i += 3)
        for (let k = 0; k < 3; k++) indices.push(base + (idx ? idx.getScalar(i + k) : i + k));
    }
  });

  const mesh: SketchMesh = {
    positions: new Float32Array(positions),
    indices: new Uint32Array(indices),
  };
  if (jointSet.size === 0) return mesh;
  return {
    ...mesh,
    nodes,
    joints: [...jointSet].sort((a, b) => a - b),
    influences: { nodes: new Uint16Array(infNodes), weights: new Float32Array(infWeights) },
  };
}
