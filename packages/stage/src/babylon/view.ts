import { Color3 } from '@babylonjs/core/Maths/math.color.js';
import { Quaternion } from '@babylonjs/core/Maths/math.vector.js';
import type { StandardMaterial } from '@babylonjs/core/Materials/standardMaterial.js';
import type { AbstractMesh } from '@babylonjs/core/Meshes/abstractMesh.js';
import type { TransformNode } from '@babylonjs/core/Meshes/transformNode.js';
import type { JointName, Quat, Transform } from '@storystage/story-api';
import type { Box } from '../hull.ts';
import { mul } from '../math.ts';
import { paintColour } from '../paint.ts';
import type { Blend, ObjectState } from '../timeline.ts';
import { color3 } from './materials.ts';

/** Metres between the top of an object and its label. */
const LABEL_GAP = 0.2;

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
  /**
   * A label over the object, `above` metres up at scale 1. It isn't part of the object, so it
   * stays upright and keeps its shape however the object is turned or resized.
   */
  readonly label?: { readonly mesh: AbstractMesh; readonly above: number } | undefined;
}

/** How one object appears in a scene. The timeline says what it's like; this makes it so. */
export class ObjectView {
  readonly box: Box;
  readonly meshes: readonly AbstractMesh[];
  private readonly root: TransformNode;
  private readonly label: ViewParts['label'];
  private readonly surfaces: readonly { material: StandardMaterial; colour: Color3 }[];
  private readonly bones: readonly { joint: JointName; node: TransformNode; rest: Quat }[];
  private posed = false;
  private opacity = 1;
  /** The paint and blend last shown, so an unchanged paint costs nothing. */
  private painted = '';

  constructor({ root, meshes, box, paintable, joints, label }: ViewParts) {
    this.root = root;
    this.meshes = meshes;
    this.box = box;
    this.label = label;
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
    if (this.label) {
      const height = position.y + this.label.above * scale.y + LABEL_GAP;
      this.label.mesh.position.set(position.x, height, position.z);
    }
    if (state.joints.size > 0 || this.posed) this.pose(state);
    if (state.opacity !== this.opacity) this.fade(state.opacity);
    const blend = state.paintBlend;
    const painted = `${state.paint}|${blend ? `${blend.from}|${blend.amount}` : ''}`;
    if (painted !== this.painted) {
      this.painted = painted;
      this.repaint(state.paint, blend);
    }
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
    this.label?.mesh.setEnabled(opacity > 0);
    for (const mesh of this.meshes) mesh.visibility = opacity;
  }

  /** A paint tints each surface; part-way through a blend, the old tint and the new are mixed. */
  private repaint(paint: string | null, blend: Blend | null): void {
    const tint = (name: string | null, own: Color3) => {
      const colour = name === null ? null : paintColour(name);
      return colour ? color3(colour) : own;
    };
    for (const s of this.surfaces) {
      const to = tint(paint, s.colour);
      s.material.diffuseColor = blend
        ? Color3.Lerp(tint(blend.from, s.colour), to, blend.amount)
        : to;
    }
  }
}
