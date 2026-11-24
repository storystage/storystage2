/**
 * How low a humanoid's arms can hang beside its body (owner's choice, 24 Nov). KayKit's clips
 * hold the arms out, as KayKit's wide, short-armed characters need; on a slimmer body that reads
 * as a T-pose. This measures, from the model's own mesh as it rests, the lowest each straight arm
 * can hang without going into the body, so the clips can let it hang that low (`Body.settleArms`).
 */
import { VertexBuffer } from '@babylonjs/core/Buffers/buffer.js';
import { Vector3 } from '@babylonjs/core/Maths/math.vector.js';
import type { AbstractMesh } from '@babylonjs/core/Meshes/abstractMesh.js';
import type { TransformNode } from '@babylonjs/core/Meshes/transformNode.js';
import type { Node } from '@babylonjs/core/node.js';
import type { JointName, Vec3 } from '@storystage/story-api';
import { ARMS_HELD } from '../humanoid/body.ts';

const J = (name: string) => name as JointName;
/** The body the arms hang beside: what these bones carry, skirts and capes included. */
const TRUNK = new Set(['hips', 'spine', 'chest', 'upperChest'].map(J));
/** The lowest an arm is let hang, from level: nearly straight down. */
const LOWEST = (80 * Math.PI) / 180;
const STEP = Math.PI / 180;

/**
 * The lowest the arms can hang, in radians below level, both sides; at least `ARMS_HELD`, as
 * KayKit's clips hold them. Undefined for a model whose mesh can't say (one without a trunk).
 */
export function armHang(
  meshes: readonly AbstractMesh[],
  joints: ReadonlyMap<JointName, TransformNode>,
  places: ReadonlyMap<JointName, Vec3>,
): number | undefined {
  const jointOf = new Map<Node, JointName>([...joints].map(([j, n]) => [n, j]));
  /** The joint a node moves with: its own, or the nearest one above it. */
  const carrier = (node: Node | null): JointName | undefined => {
    for (let n = node; n; n = n.parent) {
      const j = jointOf.get(n);
      if (j) return j;
    }
    return undefined;
  };
  const trunk: Vec3[] = [];
  const arms = new Map<JointName, Vec3[]>();
  for (const mesh of meshes) {
    const at = vertices(mesh);
    if (!at) continue;
    const bones = mesh.skeleton?.bones;
    const indices = bones ? mesh.getVerticesData(VertexBuffer.MatricesIndicesKind) : null;
    const weights = bones ? mesh.getVerticesData(VertexBuffer.MatricesWeightsKind) : null;
    const boneJoints = bones?.map((b) => carrier(b.getTransformNode()));
    const own = carrier(mesh);
    for (let i = 0; i < at.length; i++) {
      let joint = own;
      if (indices && weights && boneJoints) {
        // The bone that moves it most.
        let most = 0;
        for (let k = 0; k < 4; k++)
          if (weights[i * 4 + k]! > most) {
            most = weights[i * 4 + k]!;
            joint = boneJoints[indices[i * 4 + k]!];
          }
      }
      if (!joint) continue;
      if (TRUNK.has(joint)) trunk.push(at[i]!);
      else if (/UpperArm$/.test(joint))
        (arms.get(joint) ?? arms.set(joint, []).get(joint)!).push(at[i]!);
    }
  }
  if (trunk.length === 0) return undefined;
  let hang = LOWEST;
  for (const side of ['left', 'right'] as const) {
    const lowest = sideHang(side, trunk, arms.get(J(`${side}UpperArm`)) ?? [], places);
    if (lowest === undefined) return undefined;
    hang = Math.min(hang, lowest);
  }
  return hang;
}

/** Each vertex where it rests, in the object's space (its root is at the origin, unturned). */
function vertices(mesh: AbstractMesh): Vec3[] | null {
  mesh.skeleton?.prepare(true);
  const data = mesh.getPositionData(true, false);
  if (!data) return null;
  const world = mesh.computeWorldMatrix(true);
  const out: Vec3[] = [];
  const p = new Vector3();
  for (let i = 0; i + 2 < data.length; i += 3) {
    Vector3.TransformCoordinatesFromFloatsToRef(data[i]!, data[i + 1]!, data[i + 2]!, world, p);
    out.push({ x: p.x, y: p.y, z: p.z });
  }
  return out;
}

function sideHang(
  side: 'left' | 'right',
  trunk: readonly Vec3[],
  arm: readonly Vec3[],
  places: ReadonlyMap<JointName, Vec3>,
): number | undefined {
  const shoulder = places.get(J(`${side}UpperArm`));
  const elbow = places.get(J(`${side}LowerArm`));
  const hand = places.get(J(`${side}Hand`));
  const hips = places.get(J('hips'));
  if (!shoulder || !elbow || !hand || !hips) return undefined;
  // A model faces +Z with +X on its left.
  const out = side === 'left' ? 1 : -1;
  const length = dist(shoulder, elbow) + dist(elbow, hand);
  if (!(length > 0)) return undefined;
  const thick = radius(arm, shoulder, elbow) ?? 0.12 * dist(shoulder, elbow);
  // How far out the trunk reaches on this side, near the arm's plane, in slices down from the
  // shoulder to the hips.
  const slice = length / 50;
  const reach = new Map<number, number>();
  for (const p of trunk) {
    if (p.y > shoulder.y || p.y < hips.y) continue;
    if (Math.abs(p.z - shoulder.z) > 2 * thick + slice) continue;
    const k = Math.floor((shoulder.y - p.y) / slice);
    reach.set(k, Math.max(reach.get(k) ?? -Infinity, out * p.x));
  }
  const clear = (angle: number) => {
    for (let s = 0; s <= length; s += slice) {
      const y = shoulder.y - s * Math.sin(angle);
      // Under the armpit, where the arm's side meets the trunk's.
      if (shoulder.y - y < 2 * thick) continue;
      const k = Math.floor((shoulder.y - y) / slice);
      const x = out * shoulder.x + s * Math.cos(angle);
      for (const near of [k - 1, k, k + 1]) {
        const edge = reach.get(near);
        if (edge !== undefined && x - thick < edge) return false;
      }
    }
    return true;
  };
  for (let angle = LOWEST; angle > ARMS_HELD; angle -= STEP) if (clear(angle)) return angle;
  return ARMS_HELD;
}

/** How thick the upper arm is: most of its mesh is within this of its bone. */
function radius(arm: readonly Vec3[], from: Vec3, to: Vec3): number | undefined {
  if (arm.length < 8) return undefined;
  const d = sub(to, from);
  const len2 = d.x * d.x + d.y * d.y + d.z * d.z;
  if (!(len2 > 0)) return undefined;
  const off = arm
    .map((p) => {
      const q = sub(p, from);
      const t = Math.max(0, Math.min(1, (q.x * d.x + q.y * d.y + q.z * d.z) / len2));
      return dist(p, { x: from.x + d.x * t, y: from.y + d.y * t, z: from.z + d.z * t });
    })
    .sort((a, b) => a - b);
  return off[Math.floor(off.length * 0.8)];
}

const sub = (a: Vec3, b: Vec3): Vec3 => ({ x: a.x - b.x, y: a.y - b.y, z: a.z - b.z });
const dist = (a: Vec3, b: Vec3) => Math.hypot(a.x - b.x, a.y - b.y, a.z - b.z);
