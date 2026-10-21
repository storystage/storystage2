/**
 * Spike 1.2: rigged characters made in code, so the budget sweep needs no model files (and no
 * licence questions). Bipeds use VRM bone names, the internal ids proposed in
 * `docs/spec/10-crosswalk.md`; quadrupeds use Alice's joint set. Each character is one skinned
 * mesh: an ellipsoid per bone, sized to hit a triangle target, with each vertex shared between
 * its bone and the bone's parent near the joint, as a real skin would be.
 */
import {
  Bone,
  Color3,
  DynamicTexture,
  Matrix,
  Mesh,
  Scene,
  Skeleton,
  StandardMaterial,
  Vector3,
  VertexData,
} from '@babylonjs/core';

export type RigKind = 'biped' | 'bipedWithFingers' | 'quadruped';

interface Joint {
  name: string;
  parent: string | null;
  /** Offset from the parent joint at rest, in metres. */
  at: [number, number, number];
  /** Radius of this bone's piece of the body, in metres. */
  r: number;
}

const mirror = (joints: Joint[]): Joint[] =>
  joints.map((j) => ({
    ...j,
    name: j.name.replace(/^left/, 'right'),
    parent: j.parent?.replace(/^left/, 'right') ?? null,
    at: [-j.at[0], j.at[1], j.at[2]],
  }));

const BIPED_LEFT: Joint[] = [
  { name: 'leftShoulder', parent: 'upperChest', at: [0.04, 0.08, 0], r: 0.05 },
  { name: 'leftUpperArm', parent: 'leftShoulder', at: [0.13, 0, 0], r: 0.05 },
  { name: 'leftLowerArm', parent: 'leftUpperArm', at: [0.27, 0, 0], r: 0.04 },
  { name: 'leftHand', parent: 'leftLowerArm', at: [0.25, 0, 0], r: 0.045 },
  { name: 'leftUpperLeg', parent: 'hips', at: [0.09, -0.06, 0], r: 0.075 },
  { name: 'leftLowerLeg', parent: 'leftUpperLeg', at: [0, -0.42, 0], r: 0.06 },
  { name: 'leftFoot', parent: 'leftLowerLeg', at: [0, -0.42, 0], r: 0.05 },
  { name: 'leftToes', parent: 'leftFoot', at: [0, -0.06, 0.12], r: 0.035 },
];
const BIPED: Joint[] = [
  { name: 'hips', parent: null, at: [0, 0.95, 0], r: 0.13 },
  { name: 'spine', parent: 'hips', at: [0, 0.12, 0], r: 0.13 },
  { name: 'chest', parent: 'spine', at: [0, 0.15, 0], r: 0.14 },
  { name: 'upperChest', parent: 'chest', at: [0, 0.12, 0], r: 0.14 },
  { name: 'neck', parent: 'upperChest', at: [0, 0.14, 0], r: 0.05 },
  { name: 'head', parent: 'neck', at: [0, 0.1, 0], r: 0.11 },
  ...BIPED_LEFT,
  ...mirror(BIPED_LEFT),
];
const FINGERS = ['Thumb', 'Index', 'Middle', 'Ring', 'Little'];
const SEGMENTS = [
  ['Metacarpal', 'Proximal', 'Distal'],
  ['Proximal', 'Intermediate', 'Distal'],
];
const FINGERS_LEFT: Joint[] = FINGERS.flatMap((f, i) => {
  const names = (f === 'Thumb' ? SEGMENTS[0]! : SEGMENTS[1]!).map((s) => `left${f}${s}`);
  return names.map((name, k) => ({
    name,
    parent: k === 0 ? 'leftHand' : names[k - 1]!,
    at: (k === 0 ? [0.06, 0, 0.03 - i * 0.015] : [0.025, 0, 0]) as [number, number, number],
    r: 0.009,
  }));
});
const BIPED_WITH_FINGERS: Joint[] = [...BIPED, ...FINGERS_LEFT, ...mirror(FINGERS_LEFT)];

const QUAD_LEFT: Joint[] = [
  { name: 'frontLeftShoulder', parent: 'spineMiddle', at: [0.12, -0.05, 0.25], r: 0.07 },
  { name: 'frontLeftKnee', parent: 'frontLeftShoulder', at: [0, -0.22, 0], r: 0.05 },
  { name: 'frontLeftAnkle', parent: 'frontLeftKnee', at: [0, -0.2, 0], r: 0.04 },
  { name: 'frontLeftFoot', parent: 'frontLeftAnkle', at: [0, -0.06, 0.04], r: 0.04 },
  { name: 'backLeftHip', parent: 'pelvis', at: [0.12, -0.05, 0], r: 0.08 },
  { name: 'backLeftKnee', parent: 'backLeftHip', at: [0, -0.22, 0.05], r: 0.055 },
  { name: 'backLeftHock', parent: 'backLeftKnee', at: [0, -0.18, -0.06], r: 0.04 },
  { name: 'backLeftFoot', parent: 'backLeftHock', at: [0, -0.08, 0.04], r: 0.04 },
  { name: 'leftEar', parent: 'head', at: [0.06, 0.1, -0.02], r: 0.03 },
];
const mirrorQuad = (joints: Joint[]) =>
  joints.map((j) => ({
    ...j,
    name: j.name.replace('Left', 'Right').replace(/^left/, 'right'),
    parent: j.parent?.replace('Left', 'Right').replace(/^left/, 'right') ?? null,
    at: [-j.at[0], j.at[1], j.at[2]] as [number, number, number],
  }));
const QUADRUPED: Joint[] = [
  { name: 'pelvis', parent: null, at: [0, 0.6, -0.3], r: 0.14 },
  { name: 'spineBase', parent: 'pelvis', at: [0, 0.02, 0.2], r: 0.15 },
  { name: 'spineMiddle', parent: 'spineBase', at: [0, 0.02, 0.2], r: 0.15 },
  { name: 'neck', parent: 'spineMiddle', at: [0, 0.12, 0.25], r: 0.07 },
  { name: 'head', parent: 'neck', at: [0, 0.12, 0.08], r: 0.1 },
  { name: 'mouth', parent: 'head', at: [0, -0.04, 0.1], r: 0.05 },
  { name: 'tail', parent: 'pelvis', at: [0, 0.05, -0.12], r: 0.03 },
  { name: 'tail2', parent: 'tail', at: [0, 0.03, -0.15], r: 0.025 },
  { name: 'tail3', parent: 'tail2', at: [0, 0.02, -0.15], r: 0.02 },
  ...QUAD_LEFT,
  ...mirrorQuad(QUAD_LEFT),
];

export const RIGS: Record<RigKind, Joint[]> = {
  biped: BIPED,
  bipedWithFingers: BIPED_WITH_FINGERS,
  quadruped: QUADRUPED,
};

export interface Character {
  mesh: Mesh;
  skeleton: Skeleton;
  bones: Map<string, Bone>;
  kind: RigKind;
  triangles: number;
  vertices: number;
  textureSize: number;
}

/** A generated texture: a pattern drawn on a canvas, the size of a real model's colour map. */
function makeTexture(scene: Scene, size: number, hue: number) {
  const tex = new DynamicTexture(`tex-${size}-${hue}`, { width: size, height: size }, scene, true);
  const ctx = tex.getContext();
  const cell = size / 16;
  for (let y = 0; y < 16; y++)
    for (let x = 0; x < 16; x++) {
      ctx.fillStyle = `hsl(${hue + ((x + y) % 2) * 20}, 55%, ${45 + ((x * 7 + y * 3) % 5) * 5}%)`;
      ctx.fillRect(x * cell, y * cell, cell, cell);
    }
  tex.update();
  return tex;
}

export function makeCharacter(
  scene: Scene,
  kind: RigKind,
  triangles: number,
  textureSize: number,
  hue: number,
): Character {
  const joints = RIGS[kind];
  const skeleton = new Skeleton(`${kind}-${hue}`, `${kind}-${hue}`, scene);
  const bones = new Map<string, Bone>();
  const rest = new Map<string, Vector3>();
  joints.forEach((j) => {
    const parent = j.parent ? bones.get(j.parent)! : null;
    const bone = new Bone(j.name, skeleton, parent, Matrix.Translation(...j.at));
    bones.set(j.name, bone);
    rest.set(j.name, (j.parent ? rest.get(j.parent)! : Vector3.Zero()).add(new Vector3(...j.at)));
  });
  const index = new Map(joints.map((j, i) => [j.name, i]));
  const children = new Map<string, Joint[]>();
  for (const j of joints)
    if (j.parent) children.set(j.parent, [...(children.get(j.parent) ?? []), j]);

  // An ellipsoid per bone, from the joint towards its first child, sized for the triangle target.
  const rings = Math.max(3, Math.round(Math.sqrt(triangles / (4 * joints.length))));
  const segs = rings * 2;
  const positions: number[] = [];
  const normals: number[] = [];
  const uvs: number[] = [];
  const indices: number[] = [];
  const mIndices: number[] = [];
  const mWeights: number[] = [];
  for (const j of joints) {
    const start = rest.get(j.name)!;
    const child = children.get(j.name)?.[0];
    const end = child ? rest.get(child.name)! : start.add(new Vector3(0, j.r, 0));
    const centre = start.add(end).scale(0.5);
    const axis = end.subtract(start);
    const half = Math.max(axis.length() / 2, j.r);
    const dir = axis.length() > 1e-6 ? axis.normalize() : new Vector3(0, 1, 0);
    // Build an orthonormal basis around the bone's axis.
    const side =
      Math.abs(dir.y) < 0.9 ? Vector3.Cross(dir, Vector3.Up()).normalize() : new Vector3(1, 0, 0);
    const up = Vector3.Cross(side, dir).normalize();
    const base = positions.length / 3;
    const bi = index.get(j.name)!;
    const pi = j.parent ? index.get(j.parent)! : bi;
    for (let a = 0; a <= rings; a++) {
      const theta = (a / rings) * Math.PI; // along the bone
      for (let b = 0; b <= segs; b++) {
        const phi = (b / segs) * Math.PI * 2;
        const along = -Math.cos(theta);
        const ring = Math.sin(theta);
        const n = dir
          .scale(along)
          .add(side.scale(ring * Math.cos(phi)))
          .add(up.scale(ring * Math.sin(phi)));
        const p = centre
          .add(dir.scale(along * half))
          .add(side.scale(ring * Math.cos(phi) * j.r))
          .add(up.scale(ring * Math.sin(phi) * j.r));
        positions.push(p.x, p.y, p.z);
        normals.push(n.x, n.y, n.z);
        uvs.push(b / segs, a / rings);
        // Near the joint, share the vertex with the parent bone, as a skin bends.
        const w = Math.min(1, Math.max(0, (along + 1) / 0.6));
        mIndices.push(bi, pi, 0, 0);
        mWeights.push(w, 1 - w, 0, 0);
      }
    }
    for (let a = 0; a < rings; a++)
      for (let b = 0; b < segs; b++) {
        const i0 = base + a * (segs + 1) + b;
        const i1 = i0 + segs + 1;
        indices.push(i0, i1, i0 + 1, i0 + 1, i1, i1 + 1);
      }
  }
  const mesh = new Mesh(`${kind}-${hue}`, scene);
  const data = new VertexData();
  data.positions = positions;
  data.normals = normals;
  data.uvs = uvs;
  data.indices = indices;
  data.matricesIndices = mIndices;
  data.matricesWeights = mWeights;
  data.applyToMesh(mesh);
  mesh.skeleton = skeleton;
  mesh.numBoneInfluencers = 2;
  const mat = new StandardMaterial(`mat-${kind}-${hue}`, scene);
  mat.diffuseTexture = makeTexture(scene, textureSize, hue);
  mat.specularColor = new Color3(0.1, 0.1, 0.1);
  mesh.material = mat;
  return {
    mesh,
    skeleton,
    bones,
    kind,
    triangles: indices.length / 3,
    vertices: positions.length / 3,
    textureSize,
  };
}

/** A prop: a static mesh with no bones, at its own triangle count. */
export function makeProp(scene: Scene, triangles: number, i: number): Mesh {
  const rings = Math.max(3, Math.round(Math.sqrt(triangles / 4)));
  const data = VertexData.CreateSphere({ segments: rings, diameter: 0.6 });
  const mesh = new Mesh(`prop-${i}`, scene);
  data.applyToMesh(mesh);
  const mat = new StandardMaterial(`prop-mat-${i}`, scene);
  mat.diffuseColor = Color3.FromHSV((i * 47) % 360, 0.5, 0.8);
  mesh.material = mat;
  return mesh;
}

/** Turns the head and walks: the two movements spike 1.2 asks for. Works on any rig by joint name. */
export function animate(c: { bones: Map<string, Bone>; kind?: RigKind }, t: number) {
  const set = (name: string, x: number, y: number, z: number) =>
    c.bones.get(name)?.setRotation(new Vector3(x, y, z));
  const step = Math.sin(t * 5);
  set('head', 0, 0.6 * Math.sin(t * 1.3), 0);
  if (c.kind === 'quadruped') {
    set('frontLeftShoulder', 0.45 * step, 0, 0);
    set('backRightHip', 0.45 * step, 0, 0);
    set('frontRightShoulder', -0.45 * step, 0, 0);
    set('backLeftHip', -0.45 * step, 0, 0);
    set('frontLeftKnee', Math.max(0, -step) * 0.6, 0, 0);
    set('frontRightKnee', Math.max(0, step) * 0.6, 0, 0);
    set('tail', 0, 0.5 * Math.sin(t * 8), 0);
    return;
  }
  set('leftUpperLeg', 0.5 * step, 0, 0);
  set('rightUpperLeg', -0.5 * step, 0, 0);
  set('leftLowerLeg', Math.max(0, -step) * 0.9, 0, 0);
  set('rightLowerLeg', Math.max(0, step) * 0.9, 0, 0);
  set('leftUpperArm', -0.4 * step, 0, -1.2);
  set('rightUpperArm', 0.4 * step, 0, 1.2);
  set('spine', 0, 0.1 * step, 0);
}
