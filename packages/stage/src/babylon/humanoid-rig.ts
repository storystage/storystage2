/**
 * A model's humanoid bones, posed from a `HumanPose` (WP4.6's retargeting). Each bone's place in
 * the model is its pose's turn on top of where it rests, so a pose made on one humanoid plays on
 * another whatever the axes of its bones, as long as both rest in a T-pose and face +Z.
 */
import { Matrix, Quaternion, Vector3 } from '@babylonjs/core/Maths/math.vector.js';
import type { TransformNode } from '@babylonjs/core/Meshes/transformNode.js';
import type { JointName, Quat } from '@storystage/story-api';
import { conjugate, IDENTITY_Q, mul, v } from '../math.ts';
import { fromModelTurns, HUMAN_BONES, modelTurns, type HumanPose } from '../humanoid/pose.ts';
import { setRotation } from './view.ts';

const HIPS = 'hips' as JointName;

const quat = (q: Quaternion): Quat => ({ x: q.x, y: q.y, z: q.z, w: q.w });

interface Bone {
  readonly joint: JointName;
  readonly node: TransformNode;
  /** Its turn in the model, at rest. */
  readonly rest: Quat;
}

export class HumanoidRig {
  /** How high the hips rest above the model's feet, in the model's units. */
  readonly hipsHeight: number;
  private readonly root: TransformNode;
  private readonly bones: readonly Bone[];
  private readonly mapped: ReadonlyMap<TransformNode, Bone>;
  /** Every node's own turn at rest, for those between the bones. */
  private readonly restLocal = new Map<TransformNode, Quat>();
  private readonly hips: TransformNode | null;
  private readonly hipsRest: Vector3;
  private readonly hipsRestLocal: Vector3;
  /** From the model's axes to those of the hips' parent. */
  private readonly toHipsParent: Matrix;

  /** `root` is the object's own node; the model must be at rest, as it's loaded. */
  constructor(root: TransformNode, joints: ReadonlyMap<JointName, TransformNode>) {
    this.root = root;
    for (const n of [root, ...root.getDescendants(false)])
      (n as TransformNode).computeWorldMatrix?.(true);
    const bones: Bone[] = [];
    for (const { joint } of HUMAN_BONES) {
      const node = joints.get(joint);
      if (node) bones.push({ joint, node, rest: this.modelTurn(node) });
    }
    // Parents first, so a bone's parent is posed before it.
    const depth = (n: TransformNode) => {
      let d = 0;
      for (let p = n.parent; p; p = p.parent) d++;
      return d;
    };
    this.bones = bones.sort((a, b) => depth(a.node) - depth(b.node));
    this.mapped = new Map(bones.map((b) => [b.node, b]));
    for (const b of bones)
      for (let n: TransformNode | null = b.node; n && n !== root; n = n.parent as TransformNode)
        if (!this.restLocal.has(n))
          this.restLocal.set(
            n,
            quat(n.rotationQuaternion ?? Quaternion.FromEulerVector(n.rotation)),
          );
    this.hips = joints.get(HIPS) ?? null;
    this.hipsRest = this.hips ? this.modelPosition(this.hips) : Vector3.Zero();
    this.hipsRestLocal = this.hips ? this.hips.position.clone() : Vector3.Zero();
    this.hipsHeight = this.hipsRest.y;
    const parent = this.hips?.parent as TransformNode | null | undefined;
    this.toHipsParent = parent ? this.modelMatrix(parent).invert() : Matrix.Identity();
  }

  /** The joints it poses. */
  joints(): JointName[] {
    return this.bones.map((b) => b.joint);
  }

  private modelMatrix(node: TransformNode): Matrix {
    const rootInverse = this.root.getWorldMatrix().clone().invert();
    return node.getWorldMatrix().multiply(rootInverse);
  }

  private modelTurn(node: TransformNode): Quat {
    const q = new Quaternion();
    this.modelMatrix(node).decompose(undefined, q);
    return quat(q);
  }

  private modelPosition(node: TransformNode): Vector3 {
    return Vector3.TransformCoordinates(Vector3.Zero(), this.modelMatrix(node));
  }

  /** The pose the model is in now: for making clips from a model's own (`scripts/make-clips.ts`). */
  read(): HumanPose {
    for (const n of [this.root, ...this.root.getDescendants(false)])
      (n as TransformNode).computeWorldMatrix?.(true);
    const world = new Map<JointName, Quat>();
    for (const b of this.bones) world.set(b.joint, mul(this.modelTurn(b.node), conjugate(b.rest)));
    const at = this.hips ? this.modelPosition(this.hips) : this.hipsRest;
    const h = this.hipsHeight || 1;
    const hips = v(
      (at.x - this.hipsRest.x) / h,
      (at.y - this.hipsRest.y) / h,
      (at.z - this.hipsRest.z) / h,
    );
    return fromModelTurns(world, hips);
  }

  /** Poses the bones, and gives each bone's own turn as it set it. */
  apply(pose: HumanPose): Map<TransformNode, Quat> {
    const turns = modelTurns(pose);
    const placed = new Map<TransformNode, Quat>();
    const inModel = (n: TransformNode | null): Quat => {
      if (!n || n === this.root) return IDENTITY_Q;
      const known = placed.get(n);
      if (known) return known;
      const bone = this.mapped.get(n);
      const q = bone
        ? mul(turns.get(bone.joint)!, bone.rest)
        : mul(inModel(n.parent as TransformNode | null), this.restLocal.get(n) ?? IDENTITY_Q);
      placed.set(n, q);
      return q;
    };
    const set = new Map<TransformNode, Quat>();
    for (const b of this.bones) {
      const local = mul(conjugate(inModel(b.node.parent as TransformNode | null)), inModel(b.node));
      setRotation(b.node, local);
      set.set(b.node, local);
    }
    if (this.hips) {
      const h = this.hipsHeight;
      const at = new Vector3(
        this.hipsRest.x + pose.hips.x * h,
        this.hipsRest.y + pose.hips.y * h,
        this.hipsRest.z + pose.hips.z * h,
      );
      this.hips.position.copyFrom(Vector3.TransformCoordinates(at, this.toHipsParent));
    }
    return set;
  }

  /** Puts every bone back where it rests. */
  rest(): void {
    for (const b of this.bones) setRotation(b.node, this.restLocal.get(b.node)!);
    this.hips?.position.copyFrom(this.hipsRestLocal);
  }
}
