/**
 * Small meshes for tests, here and in `tools/make-sketches`: boxes, and a rigged figure in a
 * T-pose. Every box has its own 24 corners (four per face), as glTF files split them.
 */
import { Document, WebIO, type Node } from '@gltf-transform/core';
import { invert, multiply, translation, type Mat4, type Vec3 } from './math.ts';
import type { SketchMesh, SketchNode } from './mesh.ts';

export interface Part {
  readonly min: Vec3;
  readonly max: Vec3;
  /** The node that moves this part when posed. */
  readonly node?: number;
}

// Each face: four corners as [x from min (0) or max (1), y, z], wound outwards.
const FACES: readonly (readonly (readonly [number, number, number])[])[] = [
  [
    [1, 0, 0],
    [1, 1, 0],
    [1, 1, 1],
    [1, 0, 1],
  ], // +X
  [
    [0, 0, 1],
    [0, 1, 1],
    [0, 1, 0],
    [0, 0, 0],
  ], // -X
  [
    [0, 1, 0],
    [0, 1, 1],
    [1, 1, 1],
    [1, 1, 0],
  ], // +Y
  [
    [0, 0, 0],
    [1, 0, 0],
    [1, 0, 1],
    [0, 0, 1],
  ], // -Y
  [
    [0, 0, 1],
    [1, 0, 1],
    [1, 1, 1],
    [0, 1, 1],
  ], // +Z
  [
    [1, 0, 0],
    [0, 0, 0],
    [0, 1, 0],
    [1, 1, 0],
  ], // -Z
];

export function boxes(parts: readonly Part[], nodes?: readonly SketchNode[]): SketchMesh {
  const positions: number[] = [];
  const indices: number[] = [];
  const influence: number[] = [];
  for (const p of parts)
    for (const face of FACES) {
      const base = positions.length / 3;
      for (const c of face) {
        positions.push(...c.map((bit, axis) => (bit ? p.max[axis]! : p.min[axis]!)));
        influence.push(p.node ?? 0);
      }
      indices.push(base, base + 1, base + 2, base, base + 2, base + 3);
    }
  const mesh: SketchMesh = {
    positions: new Float32Array(positions),
    indices: new Uint32Array(indices),
  };
  if (!nodes) return mesh;
  const n = influence.length;
  const infNodes = new Uint16Array(n * 4);
  const weights = new Float32Array(n * 4);
  influence.forEach((node, i) => {
    infNodes[i * 4] = node;
    weights[i * 4] = 1;
  });
  return {
    ...mesh,
    nodes,
    joints: nodes.map((_, i) => i),
    influences: { nodes: infNodes, weights },
  };
}

export const box = (min: Vec3, max: Vec3): SketchMesh => boxes([{ min, max }]);

/**
 * A figure about 1.8 m tall in a T-pose, facing +Z, with a nose on its head and toes pointing
 * forward, so its facing shows in a sketch. Joints use VRM names.
 */
export function figure(): SketchMesh {
  const at: Record<string, [Vec3, string | null]> = {
    hips: [[0, 1, 0], null],
    spine: [[0, 1.1, 0], 'hips'],
    head: [[0, 1.5, 0], 'spine'],
    leftUpperArm: [[0.2, 1.42, 0], 'spine'],
    leftLowerArm: [[0.48, 1.42, 0], 'leftUpperArm'],
    leftHand: [[0.74, 1.42, 0], 'leftLowerArm'],
    rightUpperArm: [[-0.2, 1.42, 0], 'spine'],
    rightLowerArm: [[-0.48, 1.42, 0], 'rightUpperArm'],
    rightHand: [[-0.74, 1.42, 0], 'rightLowerArm'],
    leftUpperLeg: [[0.1, 0.95, 0], 'hips'],
    leftLowerLeg: [[0.1, 0.52, 0], 'leftUpperLeg'],
    leftFoot: [[0.1, 0.08, 0], 'leftLowerLeg'],
    rightUpperLeg: [[-0.1, 0.95, 0], 'hips'],
    rightLowerLeg: [[-0.1, 0.52, 0], 'rightUpperLeg'],
    rightFoot: [[-0.1, 0.08, 0], 'rightLowerLeg'],
  };
  const names = Object.keys(at);
  const nodes: SketchNode[] = names.map((name) => {
    const [pos, parent] = at[name]!;
    const p = parent === null ? -1 : names.indexOf(parent);
    const pp = parent === null ? ([0, 0, 0] as Vec3) : at[parent]![0];
    return {
      name,
      parent: p,
      local: translation([pos[0] - pp[0], pos[1] - pp[1], pos[2] - pp[2]]),
    };
  });
  const n = (name: string) => names.indexOf(name);
  const limb = (from: string, to: string, t: number): Part => {
    const a = at[from]![0];
    const b = at[to]![0];
    return {
      min: [Math.min(a[0], b[0]) - t, Math.min(a[1], b[1]) - t, -t],
      max: [Math.max(a[0], b[0]) + t, Math.max(a[1], b[1]) + t, t],
      node: n(from),
    };
  };
  const parts: Part[] = [
    { min: [-0.18, 0.92, -0.1], max: [0.18, 1.48, 0.1], node: n('spine') },
    { min: [-0.11, 1.5, -0.11], max: [0.11, 1.78, 0.11], node: n('head') },
    { min: [-0.02, 1.6, 0.11], max: [0.02, 1.64, 0.17], node: n('head') }, // nose
    limb('leftUpperArm', 'leftLowerArm', 0.05),
    limb('leftLowerArm', 'leftHand', 0.04),
    { min: [0.74, 1.37, -0.04], max: [0.84, 1.47, 0.04], node: n('leftHand') },
    limb('rightUpperArm', 'rightLowerArm', 0.05),
    limb('rightLowerArm', 'rightHand', 0.04),
    { min: [-0.84, 1.37, -0.04], max: [-0.74, 1.47, 0.04], node: n('rightHand') },
    limb('leftUpperLeg', 'leftLowerLeg', 0.07),
    limb('leftLowerLeg', 'leftFoot', 0.06),
    { min: [0.04, 0, -0.06], max: [0.16, 0.1, 0.2], node: n('leftFoot') },
    limb('rightUpperLeg', 'rightLowerLeg', 0.07),
    limb('rightLowerLeg', 'rightFoot', 0.06),
    { min: [-0.16, 0, -0.06], max: [-0.04, 0.1, 0.2], node: n('rightFoot') },
  ];
  return boxes(parts, nodes);
}

/**
 * A glTF document for a test mesh: a rigged mesh gets a skin over all its nodes, bound in its
 * rest pose; anything else is one plain mesh. Node transforms must be translations.
 */
export function documentFromMesh(mesh: SketchMesh): Document {
  const doc = new Document();
  const buffer = doc.createBuffer();
  // A fresh copy, so the array is over a plain ArrayBuffer as glTF Transform's types expect.
  const accessor = (
    type: 'SCALAR' | 'VEC3' | 'VEC4' | 'MAT4',
    array: Float32Array | Uint16Array | Uint32Array,
  ) => doc.createAccessor().setType(type).setArray(array.slice()).setBuffer(buffer);
  const prim = doc
    .createPrimitive()
    .setAttribute('POSITION', accessor('VEC3', mesh.positions))
    .setIndices(accessor('SCALAR', mesh.indices));
  const gltfMesh = doc.createMesh('model').addPrimitive(prim);
  const scene = doc.createScene();
  doc.getRoot().setDefaultScene(scene);
  const holder = doc.createNode('model').setMesh(gltfMesh);
  scene.addChild(holder);
  if (!mesh.nodes || !mesh.influences) return doc;
  const world: Mat4[] = [];
  const nodes: Node[] = mesh.nodes.map((n, i) => {
    world[i] = n.parent < 0 ? n.local : multiply(world[n.parent]!, n.local);
    return doc.createNode(n.name).setTranslation([n.local[12]!, n.local[13]!, n.local[14]!]);
  });
  mesh.nodes.forEach((n, i) =>
    n.parent < 0 ? scene.addChild(nodes[i]!) : nodes[n.parent]!.addChild(nodes[i]!),
  );
  const ibm = new Float32Array(nodes.length * 16);
  world.forEach((m, i) => ibm.set(invert(m), i * 16));
  const skin = doc.createSkin().setInverseBindMatrices(accessor('MAT4', ibm));
  for (const n of nodes) skin.addJoint(n);
  holder.setSkin(skin);
  prim
    .setAttribute('JOINTS_0', accessor('VEC4', mesh.influences.nodes))
    .setAttribute('WEIGHTS_0', accessor('VEC4', mesh.influences.weights));
  return doc;
}

export const glbFromMesh = (mesh: SketchMesh): Promise<Uint8Array> =>
  new WebIO().writeBinary(documentFromMesh(mesh));
