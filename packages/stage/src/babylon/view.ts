import type { AnimationGroup } from '@babylonjs/core/Animations/animationGroup.js';
import { Color3 } from '@babylonjs/core/Maths/math.color.js';
import { Quaternion, Vector3 } from '@babylonjs/core/Maths/math.vector.js';
import type { StandardMaterial } from '@babylonjs/core/Materials/standardMaterial.js';
import type { AbstractMesh } from '@babylonjs/core/Meshes/abstractMesh.js';
import type { TransformNode } from '@babylonjs/core/Meshes/transformNode.js';
import type { JointName, Quat, Transform, Vec3 } from '@storystage/story-api';
import type { Box } from '../hull.ts';
import type { HumanPose } from '../humanoid/pose.ts';
import { localAfter, lookTurn, reachTurns } from '../ik.ts';
import { conjugate, mul, rotate, v } from '../math.ts';
import { paintColour } from '../paint.ts';
import type { Blend, ObjectState } from '../timeline.ts';
import { HumanoidRig } from './humanoid-rig.ts';
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
  /** The model's own clips. The stage plays them itself (`Motion`); the scene never does. */
  readonly animations?: readonly AnimationGroup[];
}

/** One of a model's clips, `time` seconds in, counting for `weight` of the pose. */
export interface ClipPose {
  readonly name: string;
  readonly time: number;
  readonly weight: number;
  /** Starts again at its end, as a walk does (the default); or else stops at its last pose. */
  readonly loop?: boolean;
}

/** Bends a limb, from `root` through `middle` to `end`, so that its end is at `target`. */
export interface ReachPose {
  readonly root: JointName;
  readonly middle: JointName;
  readonly end: JointName;
  /** Where, in the scene's axes. */
  readonly target: Vec3;
  /** The middle joint bends towards it: an elbow's outside, a knee's front. */
  readonly pole: Vec3;
}

/** Turns a joint, most often the head, to face `target`, by at most `limit` turns. */
export interface LookPose {
  readonly joint: JointName;
  readonly target: Vec3;
  readonly limit?: number;
}

/**
 * How an object moves besides its joints' turns, applied in this order: the model's own clips,
 * blended; a humanoid pose; the joints' turns on top of them; reaching; then looking.
 */
export interface Motion {
  /** A humanoid pose, from the shared clips (WP4.6), on top of the model's own clips. */
  readonly human?: HumanPose;
  readonly clips?: readonly ClipPose[];
  readonly reach?: readonly ReachPose[];
  readonly look?: readonly LookPose[];
}

/** How far a joint turns to look, unless told otherwise: a fifth of a turn, 72 degrees. */
export const LOOK_LIMIT = 0.2;

const NO_MOTION: Motion = {};
const NO_TURN: Quat = { x: 0, y: 0, z: 0, w: 1 };

type Property = 'position' | 'rotationQuaternion' | 'scaling';

interface NodeRest {
  readonly position: Vector3;
  readonly rotation: Quaternion;
  readonly scaling: Vector3;
}

interface Track {
  readonly node: TransformNode;
  readonly property: Property;
  readonly evaluate: (frame: number) => unknown;
  readonly fps: number;
}

interface Clip {
  readonly from: number;
  readonly to: number;
  readonly tracks: readonly Track[];
}

const quat = (q: Quaternion): Quat => ({ x: q.x, y: q.y, z: q.z, w: q.w });
const vec = (p: Vector3): Vec3 => ({ x: p.x, y: p.y, z: p.z });

/** Brings a node's place in the scene up to date, its parents' first. */
function refresh(node: TransformNode): void {
  const chain: { computeWorldMatrix(force?: boolean): unknown }[] = [];
  for (let n: TransformNode['parent'] = node; n; n = n.parent) chain.unshift(n);
  for (const n of chain) n.computeWorldMatrix(true);
}

/** A node's turn in the scene, once `refresh`ed. */
const worldTurn = (node: TransformNode): Quat => quat(node.absoluteRotationQuaternion);

function parentTurn(node: TransformNode): Quat {
  const parent = node.parent;
  return parent && 'absoluteRotationQuaternion' in parent
    ? worldTurn(parent as TransformNode)
    : NO_TURN;
}

/** The frame of a clip `seconds` in. */
function frameOf(clip: Clip, track: Track, pose: ClipPose): number {
  const length = clip.to - clip.from;
  if (length <= 0) return clip.from;
  const into = pose.time * track.fps;
  if (pose.loop === false) return clip.from + Math.min(Math.max(into, 0), length);
  return clip.from + (((into % length) + length) % length);
}

/** How one object appears in a scene. The timeline says what it's like; this makes it so. */
export class ObjectView {
  readonly box: Box;
  readonly meshes: readonly AbstractMesh[];
  private readonly root: TransformNode;
  private readonly label: ViewParts['label'];
  private readonly surfaces: readonly { material: StandardMaterial; colour: Color3 }[];
  private readonly bones: readonly { joint: JointName; node: TransformNode; rest: Quat }[];
  private readonly jointNodes: ReadonlyMap<JointName, TransformNode>;
  /** The way each joint faces, in its own axes: the way the model faces (+Z), at rest. */
  private readonly facings: ReadonlyMap<JointName, Vec3>;
  private readonly clipsByName: ReadonlyMap<string, Clip>;
  /** The rest of every node a clip moves, to blend with and to go back to. */
  private readonly rests: ReadonlyMap<TransformNode, NodeRest>;
  /** Its humanoid bones, if it has them. */
  private readonly rig: HumanoidRig | null;
  private humanPosed = false;
  private posed = false;
  private opacity = 1;
  /** The paint and blend last shown, so an unchanged paint costs nothing. */
  private painted = '';

  constructor({ root, meshes, box, paintable, joints, label, animations = [] }: ViewParts) {
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
    this.jointNodes = joints ?? new Map();
    // The model is still where it was made, so a joint's turn in the scene is its turn in it.
    this.facings = new Map(
      this.bones.map(({ joint, node }) => {
        refresh(node);
        return [joint, rotate(conjugate(worldTurn(node)), v(0, 0, 1))] as const;
      }),
    );
    const rests = new Map<TransformNode, NodeRest>();
    const clips = new Map<string, Clip>();
    for (const group of animations) {
      // The stage plays clips itself, so a film is posed the same way at the same moment.
      group.stop();
      const tracks: Track[] = [];
      for (const { animation, target } of group.targetedAnimations) {
        const property = animation.targetProperty;
        if (property !== 'position' && property !== 'rotationQuaternion' && property !== 'scaling')
          continue;
        const node = target as TransformNode;
        if (!rests.has(node))
          rests.set(node, {
            position: node.position.clone(),
            rotation: node.rotationQuaternion?.clone() ?? Quaternion.FromEulerVector(node.rotation),
            scaling: node.scaling.clone(),
          });
        const evaluate = (frame: number): unknown => animation.evaluate(frame);
        tracks.push({ node, property, evaluate, fps: animation.framePerSecond });
      }
      clips.set(group.name, { from: group.from, to: group.to, tracks });
    }
    this.rests = rests;
    this.clipsByName = clips;
    this.rig = joints?.has('hips' as JointName) ? new HumanoidRig(root, joints) : null;
  }

  /** The names of the model's clips. */
  clips(): string[] {
    return [...this.clipsByName.keys()];
  }

  show(state: ObjectState, where: Transform, motion: Motion = NO_MOTION): void {
    const { position, rotation, scale } = where;
    this.root.position.set(position.x, position.y, position.z);
    setRotation(this.root, rotation);
    this.root.scaling.set(scale.x, scale.y, scale.z);
    if (this.label) {
      const height = position.y + this.label.above * scale.y + LABEL_GAP;
      this.label.mesh.position.set(position.x, height, position.z);
    }
    const moving = !!(
      motion.human ||
      motion.clips?.length ||
      motion.reach?.length ||
      motion.look?.length
    );
    if (state.joints.size > 0 || moving || this.posed) this.pose(state, motion, moving);
    if (state.opacity !== this.opacity) this.fade(state.opacity);
    const blend = state.paintBlend;
    const painted = `${state.paint}|${blend ? `${blend.from}|${blend.amount}` : ''}`;
    if (painted !== this.painted) {
      this.painted = painted;
      this.repaint(state.paint, blend);
    }
  }

  /**
   * The clips blended, each joint's turn on top of that, then reaching and looking. With no
   * clips, a joint's turn is on top of the pose it has in the model.
   */
  private pose(state: ObjectState, motion: Motion, moving: boolean): void {
    if (this.humanPosed && !motion.human) this.rig!.rest();
    const animated = this.blend(motion.clips ?? []);
    this.humanPosed = !!(motion.human && this.rig);
    if (motion.human && this.rig)
      for (const [node, turn] of this.rig.apply(motion.human)) animated.set(node, turn);
    for (const { joint, node, rest } of this.bones) {
      const base = animated.get(node) ?? rest;
      const turn = state.joints.get(joint);
      setRotation(node, turn ? mul(base, turn) : base);
    }
    for (const r of motion.reach ?? []) this.reach(r);
    for (const l of motion.look ?? []) this.look(l);
    this.posed = state.joints.size > 0 || moving;
  }

  /**
   * Sets every node a clip moves to the clips' blend, and gives the turns it set. Each clip counts
   * for its weight. If the weights come to less than 1 the model's rest pose makes up the rest,
   * and if to more, they're scaled down to 1.
   */
  private blend(poses: readonly ClipPose[]): Map<TransformNode, Quat> {
    const turns = new Map<TransformNode, Quat>();
    if (this.rests.size === 0) return turns;
    const playing = poses.flatMap((pose) => {
      const clip = this.clipsByName.get(pose.name);
      return clip && pose.weight > 0 ? [{ clip, pose }] : [];
    });
    const total = Math.max(
      1,
      playing.reduce((sum, p) => sum + p.pose.weight, 0),
    );
    const sums = new Map(
      [...this.rests.keys()].map((node) => [
        node,
        {
          position: Vector3.Zero(),
          rotation: new Quaternion(0, 0, 0, 0),
          scaling: Vector3.Zero(),
          weights: { position: 0, rotationQuaternion: 0, scaling: 0 } as Record<Property, number>,
        },
      ]),
    );
    for (const { clip, pose } of playing) {
      const w = pose.weight / total;
      for (const track of clip.tracks) {
        const value = track.evaluate(frameOf(clip, track, pose));
        const sum = sums.get(track.node)!;
        sum.weights[track.property] += w;
        if (track.property === 'rotationQuaternion') {
          const q = value as Quaternion;
          // A turn and its negative are the same turn; add them all the same way round.
          const rest = this.rests.get(track.node)!.rotation;
          sum.rotation.addInPlace(q.scale(Quaternion.Dot(q, rest) < 0 ? -w : w));
        } else sum[track.property].addInPlace((value as Vector3).scale(w));
      }
    }
    for (const [node, rest] of this.rests) {
      const { position, rotation, scaling, weights } = sums.get(node)!;
      node.position.copyFrom(position.addInPlace(rest.position.scale(1 - weights.position)));
      node.scaling.copyFrom(scaling.addInPlace(rest.scaling.scale(1 - weights.scaling)));
      rotation.addInPlace(rest.rotation.scale(1 - weights.rotationQuaternion)).normalize();
      setRotation(node, quat(rotation));
      turns.set(node, quat(rotation));
    }
    return turns;
  }

  /** Bends a limb to reach a point, if the model has all three joints. */
  private reach({ root, middle, end, target, pole }: ReachPose): void {
    const a = this.jointNodes.get(root);
    const b = this.jointNodes.get(middle);
    const c = this.jointNodes.get(end);
    if (!a || !b || !c) return;
    refresh(c);
    const limb = {
      root: vec(a.getAbsolutePosition()),
      middle: vec(b.getAbsolutePosition()),
      end: vec(c.getAbsolutePosition()),
    };
    const turns = reachTurns(limb, target, pole);
    setRotation(a, localAfter(turns.root, worldTurn(a), parentTurn(a)));
    refresh(b);
    setRotation(b, localAfter(turns.middle, worldTurn(b), parentTurn(b)));
  }

  /** Turns a joint to face a point, as far as its limit. */
  private look({ joint, target, limit = LOOK_LIMIT }: LookPose): void {
    const node = this.jointNodes.get(joint);
    const facing = this.facings.get(joint);
    if (!node || !facing) return;
    refresh(node);
    const world = worldTurn(node);
    const turn = lookTurn(vec(node.getAbsolutePosition()), rotate(world, facing), target, limit);
    setRotation(node, localAfter(turn, world, parentTurn(node)));
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
