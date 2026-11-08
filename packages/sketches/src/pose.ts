/**
 * Standard poses for character sketches (WP10.5; `docs/spec/17-backstage.md`, section 7).
 *
 * A pose gives the direction each limb segment points in model space (Y up, facing +Z, the
 * model's left is +X), not joint rotations, so the same pose works whether a rig rests in a
 * T-pose or an A-pose and whatever its bones' own axes. Only humanoids that map onto the joint
 * map (WP3.3) are posed; anything else is drawn as it is.
 */
import { mapSkeleton } from '@storystage/backstage';
import {
  invert,
  multiply,
  rotationBetween,
  sub,
  transformPoint,
  translation,
  type Mat4,
  type Vec3,
} from './math.ts';
import type { SketchMesh } from './mesh.ts';

/** Poses drawn for characters besides standing. A placed sketch's `pose: null` is standing. */
export const POSES = ['walk', 'point', 'sit'] as const;
export type Pose = (typeof POSES)[number];

type Limb =
  | 'leftUpperArm'
  | 'leftLowerArm'
  | 'rightUpperArm'
  | 'rightLowerArm'
  | 'leftUpperLeg'
  | 'leftLowerLeg'
  | 'rightUpperLeg'
  | 'rightLowerLeg';

/** Each limb segment and the joint at its far end. */
const SEGMENT_END: Readonly<Record<Limb, string>> = {
  leftUpperArm: 'leftLowerArm',
  leftLowerArm: 'leftHand',
  rightUpperArm: 'rightLowerArm',
  rightLowerArm: 'rightHand',
  leftUpperLeg: 'leftLowerLeg',
  leftLowerLeg: 'leftFoot',
  rightUpperLeg: 'rightLowerLeg',
  rightLowerLeg: 'rightFoot',
};

const armsDown = {
  leftUpperArm: [0.18, -1, 0],
  leftLowerArm: [0.1, -1, 0.05],
  rightUpperArm: [-0.18, -1, 0],
  rightLowerArm: [-0.1, -1, 0.05],
} as const;
const legsDown = {
  leftUpperLeg: [0.02, -1, 0],
  leftLowerLeg: [0, -1, 0],
  rightUpperLeg: [-0.02, -1, 0],
  rightLowerLeg: [0, -1, 0],
} as const;

/** Where each limb points, per pose. */
export const POSE_TARGETS: Readonly<Record<'stand' | Pose, Partial<Record<Limb, Vec3>>>> = {
  stand: { ...armsDown, ...legsDown },
  walk: {
    leftUpperLeg: [0.02, -0.94, 0.34],
    leftLowerLeg: [0, -0.98, 0.18],
    rightUpperLeg: [-0.02, -0.96, -0.28],
    rightLowerLeg: [0, -0.82, -0.57],
    leftUpperArm: [0.15, -0.95, -0.28],
    leftLowerArm: [0.1, -0.95, -0.2],
    rightUpperArm: [-0.15, -0.95, 0.3],
    rightLowerArm: [-0.1, -0.75, 0.65],
  },
  point: {
    ...armsDown,
    ...legsDown,
    rightUpperArm: [-0.25, 0.05, 1],
    rightLowerArm: [-0.2, 0.05, 1],
  },
  sit: {
    leftUpperLeg: [0.08, -0.1, 1],
    leftLowerLeg: [0, -1, 0.05],
    rightUpperLeg: [-0.08, -0.1, 1],
    rightLowerLeg: [0, -1, 0.05],
    leftUpperArm: [0.15, -1, 0.15],
    leftLowerArm: [0.05, -0.35, 1],
    rightUpperArm: [-0.15, -1, 0.15],
    rightLowerArm: [-0.05, -0.35, 1],
  },
};

/** The node for each joint of the joint map, if the model maps as a whole humanoid. */
function jointNodes(mesh: SketchMesh): Map<string, number> | null {
  if (!mesh.nodes || !mesh.joints || !mesh.influences) return null;
  const nodes = mesh.nodes;
  const names = mesh.joints.map((i) => nodes[i]!.name);
  const mapping = mapSkeleton(names, 'biped');
  if (mapping.status !== 'mapped') return null;
  const byName = new Map<string, number>();
  for (const i of mesh.joints) if (!byName.has(nodes[i]!.name)) byName.set(nodes[i]!.name, i);
  return new Map(Object.entries(mapping.bones).map(([joint, bone]) => [joint, byName.get(bone)!]));
}

export const canPose = (mesh: SketchMesh): boolean => jointNodes(mesh) !== null;

function restWorld(mesh: SketchMesh): Mat4[] {
  const world: Mat4[] = [];
  mesh.nodes!.forEach((n, i) => {
    world[i] = n.parent < 0 ? n.local : multiply(world[n.parent]!, n.local);
  });
  return world;
}

const ORIGIN: Vec3 = [0, 0, 0];

/** Every node's world transform in the pose, or null if the model can't be posed. */
export function solvePose(mesh: SketchMesh, pose: 'stand' | Pose): Mat4[] | null {
  const joints = jointNodes(mesh);
  if (!joints) return null;
  const rest = restWorld(mesh);
  const targets = new Map<number, { end: number; to: Vec3 }>();
  for (const [limb, to] of Object.entries(POSE_TARGETS[pose]) as [Limb, Vec3][]) {
    const at = joints.get(limb);
    const end = joints.get(SEGMENT_END[limb]);
    if (at !== undefined && end !== undefined) targets.set(at, { end, to });
  }
  const posed: Mat4[] = [];
  mesh.nodes!.forEach((n, i) => {
    let m = n.parent < 0 ? n.local : multiply(posed[n.parent]!, n.local);
    const target = targets.get(i);
    if (target) {
      const from = transformPoint(m, ORIGIN);
      // Where the segment's far end is now, carried rigidly from rest.
      const end = transformPoint(
        multiply(m, multiply(invert(rest[i]!), rest[target.end]!)),
        ORIGIN,
      );
      const turn = rotationBetween(sub(end, from), target.to);
      m = multiply(translation(from), multiply(turn, multiply(translation(sub(ORIGIN, from)), m)));
    }
    posed[i] = m;
  });
  return posed;
}

/** The mesh in a pose. A model that can't be posed comes back unchanged. */
export function poseMesh(mesh: SketchMesh, pose: 'stand' | Pose): SketchMesh {
  const posed = solvePose(mesh, pose);
  if (!posed) return mesh;
  const rest = restWorld(mesh);
  const skin = posed.map((p, i) => multiply(p, invert(rest[i]!)));
  const { nodes, weights } = mesh.influences!;
  const src = mesh.positions;
  const out = new Float32Array(src.length);
  for (let v = 0; v < src.length / 3; v++) {
    const p: Vec3 = [src[v * 3]!, src[v * 3 + 1]!, src[v * 3 + 2]!];
    let x = 0;
    let y = 0;
    let z = 0;
    let total = 0;
    for (let k = 0; k < 4; k++) {
      const w = weights[v * 4 + k]!;
      if (w === 0) continue;
      const q = transformPoint(skin[nodes[v * 4 + k]!]!, p);
      x += w * q[0];
      y += w * q[1];
      z += w * q[2];
      total += w;
    }
    if (total === 0) out.set(p, v * 3);
    else out.set([x / total, y / total, z / total], v * 3);
  }
  return { ...mesh, positions: out };
}
