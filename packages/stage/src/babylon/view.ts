import type { AnimationGroup } from '@babylonjs/core/Animations/animationGroup.js';
import { Material } from '@babylonjs/core/Materials/material.js';
import { Color3 } from '@babylonjs/core/Maths/math.color.js';
import { Matrix, Quaternion, Vector3 } from '@babylonjs/core/Maths/math.vector.js';
import type { StandardMaterial } from '@babylonjs/core/Materials/standardMaterial.js';
import type { Texture } from '@babylonjs/core/Materials/Textures/texture.js';
import type { AbstractMesh } from '@babylonjs/core/Meshes/abstractMesh.js';
import type { MorphTargetManager } from '@babylonjs/core/Morph/morphTargetManager.js';
import type { TransformNode } from '@babylonjs/core/Meshes/transformNode.js';
import type { JointName, Quat, Transform, Vec3 } from '@storystage/story-api';
import type { Box } from '../hull.ts';
import type { HumanPose } from '../humanoid/pose.ts';
import { localAfter, lookTurn, reachTurns } from '../ik.ts';
import { conjugate, mul, rotate, v } from '../math.ts';
import { paintColour } from '../paint.ts';
import type { Blend, ObjectState } from '../timeline.ts';
import type { FaceTarget, FaceTexture } from './faces.ts';
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
  /** A VRM's expressions, and the morph targets that make each (`faces.ts`). */
  readonly faces?: ReadonlyMap<string, readonly FaceTarget[]>;
  /** A VRM's expressions that shift a picture, as Seed-san's robot screen does (`faces.ts`). */
  readonly faceTextures?: ReadonlyMap<string, readonly FaceTexture[]>;
  /** A VRM's expressions that are all or nothing. */
  readonly binaryFaces?: ReadonlySet<string>;
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
  /** An expression, `amount` of the way there (0 to 1), and how far the eyes are shut. */
  readonly face?: { readonly expression: string; readonly amount: number } | null;
  /** The face before, part way gone, while a new one comes in. */
  readonly fading?: { readonly expression: string; readonly amount: number } | null;
  readonly blink?: number;
  readonly clips?: readonly ClipPose[];
  /** An animal's walk in code: each joint's turn in the model's own axes, on top of its clips. */
  readonly turns?: ReadonlyMap<JointName, Quat>;
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

/** Sets one of a node's properties to a clip's value. */
function setTo(node: TransformNode, property: Property, value: unknown): void {
  if (property === 'rotationQuaternion')
    (node.rotationQuaternion ??= Quaternion.Identity()).copyFrom(value as Quaternion);
  else node[property].copyFrom(value as Vector3);
}

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
  private readonly surfaces: readonly {
    material: StandardMaterial;
    colour: Color3;
    mode: number | null;
  }[];
  private readonly bones: readonly { joint: JointName; node: TransformNode; rest: Quat }[];
  private readonly jointNodes: ReadonlyMap<JointName, TransformNode>;
  /** The way each joint faces, in its own axes: the way the model faces (+Z), at rest. */
  private readonly facings: ReadonlyMap<JointName, Vec3>;
  /** How each joint is turned in the model at rest, to turn it in the model's own axes. */
  private readonly restTurns: ReadonlyMap<JointName, Quat>;
  private readonly clipsByName: ReadonlyMap<string, Clip>;
  /** The rest of every node a clip moves, to blend with and to go back to. */
  private readonly rests: ReadonlyMap<TransformNode, NodeRest>;
  /** Its humanoid bones, if it has them. */
  private readonly rig: HumanoidRig | null;
  private humanPosed = false;
  private readonly faces: ReadonlyMap<string, readonly FaceTarget[]>;
  /** The shape sets its faces are in. */
  private readonly faceManagers: ReadonlySet<MorphTargetManager>;
  private readonly faceTextures: ReadonlyMap<string, readonly FaceTexture[]>;
  private readonly binaryFaces: ReadonlySet<string>;
  /** Each shifted picture's own scale and offset, which shifts add to. */
  private readonly textureRests: ReadonlyMap<
    Texture,
    { u: number; v: number; uScale: number; vScale: number }
  >;
  /** The face last shown, so an unchanged one costs nothing. */
  private faceShown = '';
  /** The model's own clips moved its nodes last time. */
  private clipsPosed = false;
  private posed = false;
  private opacity = 1;
  /** The paint and blend last shown, so an unchanged paint costs nothing. */
  private painted = '';

  constructor({
    root,
    meshes,
    box,
    paintable,
    joints,
    label,
    animations = [],
    faces = new Map(),
    faceTextures = new Map(),
    binaryFaces = new Set(),
  }: ViewParts) {
    this.root = root;
    this.meshes = meshes;
    this.box = box;
    this.label = label;
    this.surfaces = paintable.map((material) => ({
      material,
      colour: material.diffuseColor,
      mode: material.transparencyMode,
    }));
    this.bones = [...(joints ?? [])].map(([joint, node]) => {
      // A copy: `setRotation` writes to the node's own quaternion.
      const { x, y, z, w } = node.rotationQuaternion ?? Quaternion.FromEulerVector(node.rotation);
      return { joint, node, rest: { x, y, z, w } };
    });
    this.jointNodes = joints ?? new Map();
    // The model is still where it was made, so a joint's turn in the scene is its turn in it.
    this.restTurns = new Map(
      this.bones.map(({ joint, node }) => {
        refresh(node);
        return [joint, worldTurn(node)] as const;
      }),
    );
    this.facings = new Map(
      [...this.restTurns].map(([joint, turn]) => [joint, rotate(conjugate(turn), v(0, 0, 1))]),
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
    this.faces = faces;
    this.faceManagers = new Set(
      faces.size === 0
        ? []
        : meshes.flatMap((m) => (m.morphTargetManager ? [m.morphTargetManager] : [])),
    );
    this.faceTextures = faceTextures;
    this.binaryFaces = binaryFaces;
    this.textureRests = new Map(
      [...faceTextures.values()]
        .flat()
        .map(({ texture: t }) => [
          t,
          { u: t.uOffset, v: t.vOffset, uScale: t.uScale, vScale: t.vScale },
        ]),
    );
  }

  /** The names of the model's clips. */
  clips(): string[] {
    return [...this.clipsByName.keys()];
  }

  /**
   * How far each of `feet` (a node, or a point `reach` in a node's own axes) sweeps front to back
   * over one cycle of a clip, in the model's own
   * metres (its root's axes, before its place and size): for how fast the clip carries it
   * (`strideSpeed`). Call it while the model is at rest, before it's shown; it's left at rest.
   */
  sweeps(
    name: string,
    feet: readonly { readonly node: TransformNode; readonly reach?: Vector3 }[],
    samples = 24,
  ): number[] {
    const clip = this.clipsByName.get(name);
    if (!clip || feet.length === 0) return [];
    const ranges = feet.map(() => ({ least: Infinity, most: -Infinity }));
    const back = new Matrix();
    // The ends included: a clip that doesn't loop reaches its furthest at its last frame.
    for (let i = 0; i <= samples; i++) {
      const frame = clip.from + ((clip.to - clip.from) * i) / samples;
      for (const track of clip.tracks) setTo(track.node, track.property, track.evaluate(frame));
      refresh(this.root);
      this.root.getWorldMatrix().invertToRef(back);
      feet.forEach(({ node, reach }, k) => {
        refresh(node);
        // A foot reckoned from its knee is a point the knee carries: `reach` in its own axes.
        const at = reach
          ? Vector3.TransformCoordinates(reach, node.getWorldMatrix())
          : node.getAbsolutePosition();
        const z = Vector3.TransformCoordinates(at, back).z;
        ranges[k]!.least = Math.min(ranges[k]!.least, z);
        ranges[k]!.most = Math.max(ranges[k]!.most, z);
      });
    }
    for (const [node, rest] of this.rests) {
      node.position.copyFrom(rest.position);
      (node.rotationQuaternion ??= Quaternion.Identity()).copyFrom(rest.rotation);
      node.scaling.copyFrom(rest.scaling);
    }
    return ranges.map((r) => r.most - r.least);
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
      motion.turns?.size ||
      motion.reach?.length ||
      motion.look?.length
    );
    if (state.joints.size > 0 || moving || this.posed) this.pose(state, motion, moving);
    if (state.opacity !== this.opacity) this.fade(state.opacity);
    this.showFace(motion.face ?? null, motion.fading ?? null, motion.blink ?? 0);
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
    // Each frame starts from rest: the model's own clips leave their nodes, and the humanoid pose
    // its bones, wherever they last put them.
    if (this.clipsPosed) this.restore();
    if (this.humanPosed && !motion.human) this.rig!.rest();
    const animated = new Map<TransformNode, Quat>();
    this.humanPosed = !!(motion.human && this.rig);
    if (motion.human && this.rig)
      for (const [node, turn] of this.rig.apply(motion.human)) animated.set(node, turn);
    // The model's own clips over that, by their weights.
    for (const [node, turn] of this.blend(motion.clips ?? [])) animated.set(node, turn);
    for (const { joint, node, rest } of this.bones) {
      let base = animated.get(node) ?? rest;
      // A turn in the model's axes, as one in the joint's own: R⁻¹ q R, with R its turn at rest.
      const coded = motion.turns?.get(joint);
      if (coded) {
        const r = this.restTurns.get(joint)!;
        base = mul(base, mul(conjugate(r), mul(coded, r)));
      }
      const turn = state.joints.get(joint);
      setRotation(node, turn ? mul(base, turn) : base);
    }
    for (const r of motion.reach ?? []) this.reach(r);
    for (const l of motion.look ?? []) this.look(l);
    this.posed = state.joints.size > 0 || moving;
  }

  /** Puts every node a clip moves back where it rests. */
  private restore(): void {
    for (const [node, rest] of this.rests) {
      node.position.copyFrom(rest.position);
      node.scaling.copyFrom(rest.scaling);
      setRotation(node, quat(rest.rotation));
    }
    this.clipsPosed = false;
  }

  /**
   * Sets every node a clip moves to the clips' blend, and gives the turns it set. Each clip counts
   * for its weight. If the weights come to less than 1, the node as it is (at rest, or as the
   * humanoid pose put it) makes up the rest; if to more, they're scaled down to 1.
   */
  private blend(poses: readonly ClipPose[]): Map<TransformNode, Quat> {
    const turns = new Map<TransformNode, Quat>();
    if (this.rests.size === 0) return turns;
    const playing = poses.flatMap((pose) => {
      const clip = this.clipsByName.get(pose.name);
      return clip && pose.weight > 0 ? [{ clip, pose }] : [];
    });
    if (playing.length === 0) return turns;
    this.clipsPosed = true;
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
    for (const node of this.rests.keys()) {
      const { position, rotation, scaling, weights } = sums.get(node)!;
      const now = node.rotationQuaternion ?? Quaternion.FromEulerVector(node.rotation);
      node.position.copyFrom(position.addInPlace(node.position.scale(1 - weights.position)));
      node.scaling.copyFrom(scaling.addInPlace(node.scaling.scale(1 - weights.scaling)));
      const k = Quaternion.Dot(now, rotation) < 0 ? -1 : 1;
      rotation.addInPlace(now.scale(k * (1 - weights.rotationQuaternion))).normalize();
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

  /** Where it stands, to draw it see-through before the objects in front of it. */
  get origin(): Vector3 {
    return this.root.getAbsolutePosition();
  }

  /** Whether it has faces to show. */
  get hasFaces(): boolean {
    return this.faces.size > 0 || this.faceTextures.size > 0;
  }

  /**
   * Whether part faded it's drawn with shaders it isn't drawn with solid: a cut-out surface's.
   * The live loop draws a surface the old way while its new shader compiles, so a cut-out's
   * first two or three faded draws had hard edges (S4's review of #649).
   */
  get fadesCutOut(): boolean {
    return this.surfaces.some(
      ({ mode }) => mode !== null && blending(mode) === Material.MATERIAL_ALPHATESTANDBLEND,
    );
  }

  /** Whether loading draws it unseen first (`warm`). */
  get needsWarming(): boolean {
    return this.hasFaces || this.fadesCutOut;
  }

  /**
   * Shows every face shape a very little (`true`), or none (`false`), and a cut-out part faded,
   * for the stage to draw unseen as a scene loads (`BabylonStage.warm`); then (`null`) as it was.
   * An unseen drawing leaves out a model that's switched off, as one hidden until it enters is, so
   * it's switched on meanwhile (S4's review). The next `show` puts its own face back.
   */
  warm(warm: boolean | null): void {
    if (warm === null) {
      this.fade(this.opacity);
      return;
    }
    this.root.setEnabled(true);
    if (this.fadesCutOut) {
      for (const mesh of this.meshes) mesh.visibility = 0.5;
      for (const { material, mode } of this.surfaces)
        if (mode !== null) material.transparencyMode = blending(mode);
    }
    for (const list of this.faces.values())
      for (const { target } of list) target.influence = warm ? 1e-3 : 0;
    for (const manager of this.faceManagers) void manager.numInfluencers;
    this.faceShown = '';
  }

  /** Sets the morph targets of the expression shown and the blink; the rest go back to none. */
  private showFace(face: Motion['face'], fading: Motion['fading'], blink: number): void {
    if (this.faces.size === 0 && this.faceTextures.size === 0) return;
    const key = `${face?.expression ?? ''}|${face?.amount ?? 0}|${fading?.expression ?? ''}|${fading?.amount ?? 0}|${blink}`;
    if (key === this.faceShown) return;
    this.faceShown = key;
    for (const list of this.faces.values()) for (const { target } of list) target.influence = 0;
    const shifts = new Map([...this.textureRests].map(([t, r]) => [t, { ...r }]));
    const set = (expression: string, shown: number) => {
      const amount = this.binaryFaces.has(expression) ? (shown > 0.5 ? 1 : 0) : shown;
      for (const { target, weight } of this.faces.get(expression) ?? [])
        target.influence = Math.min(1, target.influence + weight * amount);
      for (const { texture, scale, offset } of this.faceTextures.get(expression) ?? []) {
        const s = shifts.get(texture)!;
        s.u += offset[0] * amount;
        s.v += offset[1] * amount;
        s.uScale *= 1 + (scale[0] - 1) * amount;
        s.vScale *= 1 + (scale[1] - 1) * amount;
      }
    };
    if (fading) set(fading.expression, fading.amount);
    if (face) set(face.expression, face.amount);
    if (blink > 0) set('blink', blink);
    for (const [texture, s] of shifts) {
      texture.uOffset = s.u;
      texture.vOffset = s.v;
      texture.uScale = s.uScale;
      texture.vScale = s.vScale;
    }
  }

  private fade(opacity: number): void {
    this.opacity = opacity;
    this.root.setEnabled(opacity > 0);
    this.label?.mesh.setEnabled(opacity > 0);
    for (const mesh of this.meshes) mesh.visibility = opacity;
    // Babylon.js takes a surface's transparency mode over its meshes' visibility, and glTF gives
    // every surface one (nearly always opaque), so part faded it must be told to blend.
    for (const { material, mode } of this.surfaces) {
      if (mode !== null) material.transparencyMode = opacity < 1 ? blending(mode) : mode;
      // Its nearer parts hide its farther ones, so it fades as one shape (`drawObjectsWhole`).
      // Not a surface that blends anyway, as hair cards do: its clear parts would hide what's
      // behind them (S4's review of #667).
      material.needDepthPrePass = opacity < 1 && solidOrCutOut(mode, material);
    }
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

/** Whether a surface is drawn solid or cut out, rather than blended, when its object is solid. */
function solidOrCutOut(mode: number | null, material: StandardMaterial): boolean {
  if (mode === Material.MATERIAL_OPAQUE || mode === Material.MATERIAL_ALPHATEST) return true;
  // Without a mode of its own, Babylon.js blends it if its colour or picture is see-through.
  return mode === null && material.alpha >= 1 && !material.useAlphaFromDiffuseTexture;
}

/** A surface's transparency mode while it's part faded: a cut-out stays cut out. */
function blending(mode: number): number {
  return mode === Material.MATERIAL_ALPHATEST || mode === Material.MATERIAL_ALPHATESTANDBLEND
    ? Material.MATERIAL_ALPHATESTANDBLEND
    : Material.MATERIAL_ALPHABLEND;
}
