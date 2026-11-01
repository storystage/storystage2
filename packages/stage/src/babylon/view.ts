import type { Color3 } from '@babylonjs/core/Maths/math.color.js';
import { Quaternion } from '@babylonjs/core/Maths/math.vector.js';
import type { StandardMaterial } from '@babylonjs/core/Materials/standardMaterial.js';
import type { AbstractMesh } from '@babylonjs/core/Meshes/abstractMesh.js';
import type { TransformNode } from '@babylonjs/core/Meshes/transformNode.js';
import type { JointName, Quat, Transform } from '@storystage/story-api';
import type { Box } from '../hull.ts';
import { mul } from '../math.ts';
import { paintColour } from '../paint.ts';
import type { ObjectState } from '../timeline.ts';
import { color3 } from './materials.ts';

export function setRotation(node: { rotationQuaternion: Quaternion | null }, q: Quat) {
  (node.rotationQuaternion ??= Quaternion.Identity()).set(q.x, q.y, q.z, q.w);
}

export interface ViewParts {
  readonly root: TransformNode;
  readonly meshes: readonly AbstractMesh[];
  /** Its box at scale 1, for collisions and proximity. */
  readonly box: Box;
  /** The surfaces a paint changes. */
  readonly paintable: readonly StandardMaterial[];
  /** The model's nodes for its joints. */
  readonly joints?: ReadonlyMap<JointName, TransformNode>;
}

/** How one object appears in a scene. The timeline says what it's like; this makes it so. */
export class ObjectView {
  readonly box: Box;
  readonly meshes: readonly AbstractMesh[];
  private readonly root: TransformNode;
  private readonly surfaces: readonly { material: StandardMaterial; colour: Color3 }[];
  private readonly bones: readonly { joint: JointName; node: TransformNode; rest: Quat }[];
  private posed = false;
  private opacity = 1;
  private paint: string | null = null;

  constructor({ root, meshes, box, paintable, joints }: ViewParts) {
    this.root = root;
    this.meshes = meshes;
    this.box = box;
    this.surfaces = paintable.map((material) => ({ material, colour: material.diffuseColor }));
    this.bones = [...(joints ?? [])].map(([joint, node]) => {
      // A copy: `setRotation` writes to the node's own quaternion.
      const { x, y, z, w } = node.rotationQuaternion ?? Quaternion.FromEulerVector(node.rotation);
      return { joint, node, rest: { x, y, z, w } };
    });
  }

  show(state: ObjectState, where: Transform): void {
    const { position, rotation, scale } = where;
    this.root.position.set(position.x, position.y, position.z);
    setRotation(this.root, rotation);
    this.root.scaling.set(scale.x, scale.y, scale.z);
    if (state.joints.size > 0 || this.posed) this.pose(state);
    if (state.opacity !== this.opacity) this.fade(state.opacity);
    if (state.paint !== this.paint) this.repaint(state.paint);
  }

  /** A joint's rotation is on top of the pose it has in the model. */
  private pose(state: ObjectState): void {
    for (const { joint, node, rest } of this.bones) {
      const turn = state.joints.get(joint);
      setRotation(node, turn ? mul(rest, turn) : rest);
    }
    this.posed = state.joints.size > 0;
  }

  private fade(opacity: number): void {
    this.opacity = opacity;
    this.root.setEnabled(opacity > 0);
    for (const mesh of this.meshes) mesh.visibility = opacity;
  }

  private repaint(paint: string | null): void {
    this.paint = paint;
    const colour = paint === null ? null : paintColour(paint);
    for (const s of this.surfaces) s.material.diffuseColor = colour ? color3(colour) : s.colour;
  }
}
