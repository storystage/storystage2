/**
 * The scene as a pure function of its set-up and the commands so far (spike 1.4). Every stage
 * works the scene out here, so live play, export and tests agree, and equal scenes give equal
 * hashes on every renderer. There are no graphics in this file.
 *
 * What a command means is worked out once, in scene terms, from the scene just before it starts.
 * A rider keeps its pose relative to its vehicle, so it goes where the vehicle goes, even if it
 * boards in the middle of a move. Scale isn't carried, as in Alice.
 *
 * A target may name a marker or one of an object's joints as well as an object. A joint is
 * where it rests in the model, carried by its object; turning the joints above it doesn't move
 * it. The sky, light and fog belong to `SCENE`, and the lens to the camera.
 */
import {
  CAMERA,
  SCENE,
  StageError,
  ease,
  type JointName,
  type Micros,
  type ObjectId,
  type Orientation,
  type Quat,
  type SceneObjectSetup,
  type SceneSetup,
  type ShotType,
  type Space,
  type StageCommand,
  type StageQuery,
  type StageQueryResult,
  type StoryClass,
  type Target,
  type Transform,
  type Vec3,
} from '@storystage/story-api';
import { ROOM, resolveBackdrop, type Colour } from './backdrops.ts';
import type { Speech } from './contract.ts';
import type { Box } from './hull.ts';
import type { Navigation, NavigationArea, NavigationMaker } from './navigation.ts';
import {
  applyAction,
  bodyPose,
  isAction,
  naturalLength,
  resolveAction,
  type Action,
  type BodyState,
  type Shown,
  type World,
} from './actions.ts';
import { Body } from './humanoid/body.ts';
import type { HumanLibrary } from './humanoid/library.ts';
import {
  IDENTITY_Q,
  add,
  axisTurns,
  conjugate,
  cross,
  dot,
  heading,
  length,
  lookRotation,
  mul,
  rotate,
  scale,
  sub,
  times,
  toAxisTurns,
  unit,
  v,
} from './math.ts';
import { paintColour } from './paint.ts';

/** What the stage knows of an object's model, for sizes and joints as targets. */
export interface Shape {
  /** Its joints, from its Backstage entry. */
  readonly joints: readonly JointName[];
  /** Its box at scale 1, around its own origin. */
  readonly box: Box;
  /** Where each joint rests, in the object's own space at scale 1. */
  readonly jointPlaces: ReadonlyMap<JointName, Vec3>;
  /** The model's own clips, by name, and how long each is in seconds. */
  readonly clips?: ReadonlyMap<string, number>;
}

/** A stand-in's block: half a metre square and a metre tall, standing on its origin. */
export const STAND_IN_BOX: Box = { min: v(-0.25, 0, -0.25), max: v(0.25, 1, 0.25) };

/** A stand-in's shape. It has no bones, so every joint rests near the top of the block. */
export function standInShape(joints: readonly JointName[]): Shape {
  return { joints, box: STAND_IN_BOX, jointPlaces: new Map(joints.map((j) => [j, v(0, 0.85, 0)])) };
}

/** A paint part of the way from the last one to the new one. */
export interface Blend {
  /** `null` is the model's own paint. */
  readonly from: string | null;
  /** 0 is all `from`, 1 is all the new paint. */
  readonly amount: number;
}

/** The sky, light and fog. `fog` is 0 to 1, as in `SceneSetup`. */
export interface Sky {
  readonly atmosphere: Colour;
  readonly fromAbove: Colour;
  readonly fromBelow: Colour;
  readonly fog: number;
}

export interface ObjectState {
  /** Relative to `vehicle`, or to the scene if it has none. */
  position: Vec3;
  rotation: Quat;
  scale: Vec3;
  opacity: number;
  paint: string | null;
  paintBlend: Blend | null;
  backPaint: string | null;
  backPaintBlend: Blend | null;
  text: string | null;
  speech: Speech | null;
  vehicle: ObjectId | null;
  shot: string | null;
  joints: Map<JointName, Quat>;
  /** The camera's vertical viewing angle in turns, once a program sets it. */
  lens: number | null;
  /** `SCENE`'s sky, once a program changes it. */
  sky: Sky | null;
  /** `SCENE`'s fade to black, 0 (clear) to 1 (black), once a program fades. */
  fade: number | null;
  /** What a character's body is doing (WP4c), once an action sets it. */
  body: BodyState | null;
}

export type SceneState = ReadonlyMap<ObjectId, ObjectState>;

/** Whether two objects touch. Each stage decides how: the fake by distance, the real one by size. */
export type Touching = (a: Placed, b: Placed) => boolean;
export interface Placed {
  readonly id: ObjectId;
  readonly transform: Transform;
}

type SkyPart = 'atmosphere' | 'fromAbove' | 'fromBelow';

/** A command reduced to scene terms, worked out once at its start time. */
type Resolved =
  | { kind: 'translate'; delta: Vec3 }
  | { kind: 'rotate'; axis: Vec3; turns: number }
  | { kind: 'shift'; delta: Vec3; axis: Vec3; turns: number }
  | { kind: 'resize'; factor: Vec3 }
  | { kind: 'joints'; turns: readonly { joint: JointName; axis: Vec3; turns: number }[] }
  | { kind: 'opacity'; from: number; to: number }
  | { kind: 'paint'; from: string | null; to: string }
  | { kind: 'backPaint'; from: string | null; to: string }
  | { kind: 'text'; text: string }
  | { kind: 'say'; speech: Speech }
  | { kind: 'vehicle'; vehicle: ObjectId | null; shift: Vec3; turn: Quat }
  | {
      kind: 'shot';
      shot: string;
      delta: Vec3;
      axis: Vec3;
      turns: number;
      /** A follow shot ends riding on its target, keeping this pose relative to it. */
      follow: { vehicle: ObjectId; position: Vec3; rotation: Quat } | null;
    }
  | { kind: 'lens'; from: number; to: number }
  | { kind: 'skyColour'; part: SkyPart; base: Sky; from: Colour; to: Colour }
  | { kind: 'fog'; base: Sky; from: number; to: number }
  | { kind: 'fade'; from: number; to: number }
  | { kind: 'action'; action: Action };

const ORIGIN: Pose = { position: v(0, 0, 0), rotation: IDENTITY_Q };
interface Pose {
  readonly position: Vec3;
  readonly rotation: Quat;
}

const UP = v(0, 1, 0);
const FORWARD = v(0, 0, 1);
/** Alice's vertical viewing angle, 0.5 radians, in turns. */
const ALICE_LENS = 0.5 / (2 * Math.PI);

/** Which commands are the scene's, and which the camera's. */
const SKY_KINDS: readonly StageCommand['kind'][] = ['atmosphere', 'light', 'fog', 'fade'];

const unknown = (id: ObjectId) =>
  new StageError('unknown_object', `There is nothing called ${id} in this scene.`);
const bad = (message: string) => new StageError('bad_argument', message);
const badPaint = (paint: string) => bad(`There is no paint called ${paint}.`);
/** For what the contract has and this stage doesn't do yet. */
const notYet = (what: string) => bad(`The stage can't do ${what} yet.`);

/** Where an object is in the scene: its own pose, carried by its vehicles. */
function scenePose(state: SceneState, id: ObjectId): Pose {
  const self = state.get(id)!;
  let { position, rotation } = self;
  for (let ride = self.vehicle; ride !== null; ride = state.get(ride)!.vehicle) {
    const carrier = state.get(ride)!;
    position = add(carrier.position, rotate(carrier.rotation, position));
    rotation = mul(carrier.rotation, rotation);
  }
  return { position, rotation };
}

/** The pose that puts something at `pose` when it's carried by `carrier`. */
function relativeTo(carrier: Pose, pose: Pose): Pose {
  const back = conjugate(carrier.rotation);
  return {
    position: rotate(back, sub(pose.position, carrier.position)),
    rotation: mul(back, pose.rotation),
  };
}

const extents = (box: Box) => sub(box.max, box.min);
const centre = (box: Box) => scale(add(box.min, box.max), 0.5);
const lerp = (a: number, b: number, p: number) => a + (b - a) * p;
const lerpColour = (a: Colour, b: Colour, p: number): Colour => ({
  r: lerp(a.r, b.r, p),
  g: lerp(a.g, b.g, p),
  b: lerp(a.b, b.b, p),
});
const hex = ({ r, g, b }: Colour) =>
  `#${[r, g, b]
    .map((x) =>
      Math.round(Math.min(1, Math.max(0, x)) * 255)
        .toString(16)
        .padStart(2, '0'),
    )
    .join('')}`;

export class Timeline {
  private start = new Map<ObjectId, ObjectState>();
  private markers = new Map<string, Pose>();
  private shapes = new Map<ObjectId, Shape>();
  private classes = new Map<ObjectId, StoryClass>();
  private baseSky: Sky = skyOf({});
  private baseLens = ALICE_LENS;
  /** A room's floor, which its walls stop; null for open ground. */
  private floor: Box | null = null;
  private commands: StageCommand[] = [];
  private resolved = new Map<number, Resolved>();
  private now: Micros = 0;
  private state: SceneState = new Map();
  /** The shared humanoid clips and walkable areas, once the stage has loaded them (WP4c). */
  private library: HumanLibrary | null = null;
  private makeNavigation: NavigationMaker | null = null;
  private walkable = new Map<string, Navigation | null>();
  private bodies = new Map<ObjectId, Body | null>();
  private readonly world: World = this.makeWorld();

  /**
   * Gives the timeline the shared humanoid clips and a maker of walkable areas, which the stage
   * loads for a scene with characters in it. Without them a walk goes straight, and nothing is
   * posed.
   */
  useHumanoids(library: HumanLibrary | null, navigation: NavigationMaker | null): void {
    this.library = library;
    this.makeNavigation = navigation;
    this.walkable.clear();
  }

  /** What a character shows after the last `seek`: its pose, its own clips and its face. */
  shown(object: ObjectId): Shown {
    const s = this.need(object);
    return bodyPose(this.world, this.state, object, s, this.now);
  }

  private makeWorld(): World {
    // eslint-disable-next-line @typescript-eslint/no-this-alias
    const timeline = this;
    return {
      get library() {
        return timeline.library;
      },
      body: (object) => this.bodies.get(object) ?? null,
      scale: (state, object) => (state as SceneState).get(object)?.scale ?? v(1, 1, 1),
      ownClip: (object, clip) => this.shapes.get(object)?.clips?.get(clip) ?? null,
      pose: (state, object) => scenePose(state as SceneState, object),
      targetPose: (state, target) => this.targetPose(state as SceneState, target),
      box: (state, target) => this.subject(state as SceneState, [target]),
      ownBox: (object) => this.shapes.get(object)?.box ?? null,
      lens: (state) => (state as SceneState).get(CAMERA)?.lens ?? this.baseLens,
      navigation: (state) => this.navigationAt(state as SceneState),
      ground: () => (this.floor ? this.floor.max.y : 0),
      isObject: (target) => typeof target === 'string' && this.start.has(target),
    };
  }

  /** The walkable area round what stays put where it is in `state`, built once for each layout. */
  private navigationAt(state: SceneState): Navigation | null {
    if (!this.makeNavigation) return null;
    const area = this.areaOf(state);
    const key = area.obstacles
      .map((b) =>
        [b.min.x, b.min.y, b.min.z, b.max.x, b.max.y, b.max.z].map((n) => n.toFixed(2)).join(','),
      )
      .join(';');
    if (!this.walkable.has(key)) this.walkable.set(key, this.makeNavigation(area));
    return this.walkable.get(key)!;
  }

  /** Replaces the scene and forgets every command. Throws if a vehicle can't be right. */
  load(setup: SceneSetup, shapeFor: (object: SceneObjectSetup) => Shape): void {
    this.start = startingState(setup);
    this.markers = new Map(setup.markers.map((m) => [m.id, m.transform]));
    this.shapes = new Map(setup.objects.map((o) => [o.id, shapeFor(o)]));
    this.classes = new Map(setup.objects.map((o) => [o.id, o.class]));
    this.bodies = new Map(
      [...this.shapes].map(([id, shape]) => [id, Body.of(shape.jointPlaces)] as const),
    );
    this.walkable.clear();
    this.baseSky = skyOf(setup.backdrop);
    this.floor = isRoom(setup.backdrop) ? ROOM_FLOOR : null;
    const degrees = setup.camera.fieldOfViewDegrees;
    this.baseLens = degrees === undefined ? ALICE_LENS : degrees / 360;
    this.reset();
  }

  /** Throws a `StageError` and adds none of them if any one is invalid. */
  schedule(commands: readonly StageCommand[]): void {
    for (const c of commands) this.validate(c);
    const added = structuredClone(commands);
    this.commands.push(...added);
    this.commands.sort((a, b) => a.start - b.start || a.seq - b.seq);
    // A command can change how later ones resolve, but never earlier ones.
    const fresh = new Set(added);
    const first = this.commands.findIndex((c) => fresh.has(c));
    for (let i = first; i >= 0 && i < this.commands.length; i++)
      this.resolved.delete(this.commands[i]!.seq);
    this.state = this.evaluate(this.now);
  }

  reset(): void {
    this.commands = [];
    this.resolved.clear();
    this.now = 0;
    this.state = this.evaluate(0);
  }

  seek(t: Micros): void {
    this.now = t;
    this.state = this.evaluate(t);
  }

  time(): Micros {
    return this.now;
  }

  /**
   * What the scene's walkable area is built from (5.8): the boxes of everything that stays put,
   * where it starts, and where everyone stands. Characters move, so they aren't in the way.
   */
  navigationArea(): NavigationArea {
    return this.areaOf(this.start);
  }

  /** The same, from where things are in `state`. A thing being carried isn't in the way. */
  private areaOf(state: SceneState): NavigationArea {
    const obstacles: Box[] = [];
    const include: Vec3[] = [];
    for (const [id, cls] of this.classes) {
      include.push(scenePose(state, id).position);
      if (!ACTORS.includes(cls) && state.get(id)!.vehicle === null)
        obstacles.push(this.subject(state, [id]));
    }
    return this.floor ? { obstacles, include, bounds: this.floor } : { obstacles, include };
  }

  /** The objects, the camera included; not `SCENE`. */
  objects(): readonly ObjectId[] {
    return [...this.start.keys()].filter((id) => id !== SCENE);
  }

  joints(object: ObjectId): readonly JointName[] {
    this.need(object);
    return this.shapes.get(object)?.joints ?? [];
  }

  /** The scene after the last `seek`. */
  current(): SceneState {
    return this.state;
  }

  /** How far the picture has faded to black after the last `seek`: 0 clear, 1 black. */
  fade(): number {
    return this.state.get(SCENE)!.fade ?? 0;
  }

  /** The sky, light and fog after the last `seek`. */
  sky(): Sky {
    return this.state.get(SCENE)!.sky ?? this.baseSky;
  }

  /** The camera's vertical viewing angle in turns after the last `seek`. */
  lens(): number {
    return this.state.get(CAMERA)!.lens ?? this.baseLens;
  }

  /** An object's transform in the scene after the last `seek`. */
  transform(object: ObjectId): Transform {
    return sceneTransform(this.state, this.require(this.state, object));
  }

  speech(object: ObjectId): Speech | null {
    return this.need(object).speech;
  }

  answer(query: StageQuery, touching: Touching): StageQueryResult {
    const state = this.evaluate(query.at);
    const place = (id: ObjectId): Placed => ({
      id,
      transform: sceneTransform(state, this.require(state, id)),
    });
    const target = (t: Target) => {
      this.checkTarget(t);
      return this.targetPose(state, t);
    };
    switch (query.kind) {
      case 'transform': {
        const { position, rotation } = target(query.object);
        const object = typeof query.object === 'string' ? query.object : query.object.object;
        const scaled = this.start.has(object) ? state.get(object)!.scale : v(1, 1, 1);
        return { kind: 'transform', value: { position, rotation, scale: scaled } };
      }
      case 'distance': {
        const from = target(query.from).position;
        return { kind: 'distance', value: length(sub(from, target(query.to).position)) };
      }
      case 'isColliding':
        return { kind: 'isColliding', value: touching(place(query.a), place(query.b)) };
      case 'isVisible':
        return {
          kind: 'isVisible',
          value: state.get(this.require(state, query.object))!.opacity > 0,
        };
      case 'size': {
        if (typeof query.object !== 'string') throw notYet('the size of a joint');
        const id = this.require(state, query.object);
        const box = this.shapes.get(id)?.box;
        const size = box ? times(extents(box), state.get(id)!.scale) : v(0, 0, 0);
        return { kind: 'size', value: size };
      }
      case 'look': {
        const s = state.get(this.require(state, query.object))!;
        const value = { paint: s.paint, opacity: s.opacity, backPaint: s.backPaint, text: s.text };
        return { kind: 'look', value };
      }
      case 'vehicle':
        return { kind: 'vehicle', value: state.get(this.require(state, query.object))!.vehicle };
      case 'sceneLook': {
        const sky = state.get(SCENE)!.sky ?? this.baseSky;
        const value = {
          atmosphere: hex(sky.atmosphere),
          fromAbove: hex(sky.fromAbove),
          fromBelow: hex(sky.fromBelow),
          fog: sky.fog,
        };
        return { kind: 'sceneLook', value };
      }
      case 'lens':
        return { kind: 'lens', value: state.get(CAMERA)!.lens ?? this.baseLens };
      case 'jointChain': {
        // The joint map numbers a chain from its root (`tail`, `tail2`…) and ends a tail at its tip.
        const joints = this.shapes.get(this.require(state, query.object))?.joints ?? [];
        const chain = query.chain === 'neck' ? /^neck\d*$/ : /^tail(\d*|Tip)$/;
        const place = (j: string) =>
          j.endsWith('Tip') ? Infinity : Number(j.replace(/\D/g, '') || 1);
        const value = joints.filter((j) => chain.test(j)).sort((a, b) => place(a) - place(b));
        return { kind: 'jointChain', value };
      }
      case 'naturalDuration': {
        const c = {
          ...query.action,
          seq: -1,
          start: query.at,
          duration: 0,
          style: 'beginAndEndGently',
        } as StageCommand;
        this.validate(c);
        if (!isAction(c)) return { kind: 'naturalDuration', value: 0 };
        const here = scenePose(state, c.object);
        const seconds = naturalLength(resolveAction(this.world, c, state, here));
        return { kind: 'naturalDuration', value: Math.round(seconds * 1_000_000) };
      }
    }
  }

  stateHash(): number {
    return hashState(this.state);
  }

  private need(object: ObjectId): ObjectState {
    return this.state.get(this.require(this.state, object))!;
  }

  /** An object, not `SCENE`. */
  private require(state: SceneState, object: ObjectId): ObjectId {
    if (!state.has(object) || object === SCENE) throw unknown(object);
    return object;
  }

  /** A fresh copy of the starting state, for one evaluation to change. */
  private fresh(): Map<ObjectId, ObjectState> {
    const out = new Map<ObjectId, ObjectState>();
    for (const [id, s] of this.start) out.set(id, { ...s, joints: new Map() });
    return out;
  }

  /** The scene at `t`, counting commands before index `limit` (in start, seq order) only. */
  private evaluate(t: Micros, limit = this.commands.length): SceneState {
    const state = this.fresh();
    for (let i = 0; i < limit; i++) {
      const c = this.commands[i]!;
      if (c.start > t) break;
      const r = this.resolve(i);
      const p = c.duration === 0 ? 1 : ease(c.style, (t - c.start) / c.duration);
      apply(state.get(c.object)!, r, p, t, c, state);
    }
    return state;
  }

  /** Where a target is in the scene. A joint rests where the model has it, carried by its object. */
  private targetPose(state: SceneState, target: Target): Pose {
    if (typeof target === 'string')
      return state.has(target) ? scenePose(state, target) : this.markers.get(target)!;
    const self = state.get(target.object)!;
    const pose = scenePose(state, target.object);
    const rest = this.shapes.get(target.object)?.jointPlaces.get(target.joint) ?? v(0, 0, 0);
    return {
      position: add(pose.position, rotate(pose.rotation, times(rest, self.scale))),
      rotation: mul(pose.rotation, self.joints.get(target.joint) ?? IDENTITY_Q),
    };
  }

  /** The middle of a target and its height, for framing it. */
  private framing(state: SceneState, target: Target): { middle: Vec3; size: number } {
    const pose = this.targetPose(state, target);
    const box = typeof target === 'string' ? this.shapes.get(target)?.box : undefined;
    if (!box) return { middle: pose.position, size: 0.5 };
    const scaled = state.get(target as ObjectId)!.scale;
    const middle = add(pose.position, rotate(pose.rotation, times(centre(box), scaled)));
    const size = extents(box);
    return { middle, size: Math.max(size.x * scaled.x, size.y * scaled.y, size.z * scaled.z) };
  }

  /** Works out what command `i` means in scene terms, from the scene just before it starts. */
  private resolve(i: number): Resolved {
    const c = this.commands[i]!;
    const cached = this.resolved.get(c.seq);
    if (cached) return cached;
    const before = this.evaluate(c.start, i);
    const self = before.get(c.object)!;
    const here = c.object === SCENE ? ORIGIN : scenePose(before, c.object);
    const carrier = self.vehicle === null ? ORIGIN : scenePose(before, self.vehicle);
    // Commands reason in scene terms; the object's own pose is relative to what carries it.
    const carried = (direction: Vec3) => rotate(conjugate(carrier.rotation), direction);
    const at = (target: Target) => this.targetPose(before, target);
    const axes = (space: Space): Quat =>
      space === 'scene'
        ? IDENTITY_Q
        : space === 'self'
          ? here.rotation
          : at(space.asSeenBy).rotation;
    const moveBy = (delta: Vec3): Resolved => ({ kind: 'translate', delta: carried(delta) });
    /** A turn from where it faces now to `to`, as an additive rotation. */
    const turnTo = (to: Quat | null) => {
      const { axis, turns } = toAxisTurns(mul(to ?? here.rotation, conjugate(here.rotation)));
      return { axis: carried(axis), turns };
    };
    const sky = before.get(SCENE)!.sky ?? this.baseSky;
    const resolved = (): Resolved => {
      switch (c.kind) {
        case 'translate':
          return moveBy(rotate(axes(c.space), c.by));
        case 'moveTo': {
          const target = isPoint(c.target) ? c.target : at(c.target).position;
          return moveBy(sub(target, here.position));
        }
        case 'moveToward': {
          const way = unit(sub(at(c.target).position, here.position));
          return moveBy(way ? scale(way, c.amount) : v(0, 0, 0));
        }
        case 'moveAndOrientTo': {
          const goal = c.goodView ? this.goodView(before, c.target) : at(c.target);
          return {
            kind: 'shift',
            delta: carried(sub(goal.position, here.position)),
            ...turnTo(goal.rotation),
          };
        }
        case 'place':
          return moveBy(
            sub(this.placement(before, c.object, c.relation, c.target, c.gap), here.position),
          );
        case 'rotate':
          return { kind: 'rotate', axis: carried(rotate(axes(c.space), c.axis)), turns: c.turns };
        case 'turnToFace': {
          const d = sub(at(c.target).position, here.position);
          const want = Math.atan2(d.x, d.z) / (2 * Math.PI);
          let turns = want - heading(here.rotation);
          turns -= Math.round(turns); // the short way round
          return { kind: 'rotate', axis: carried(UP), turns };
        }
        case 'orient':
          return { kind: 'rotate', ...turnTo(this.orientation(before, here, c.to, c.up)) };
        case 'resize':
          return { kind: 'resize', factor: c.factor };
        case 'setSize':
          return {
            kind: 'resize',
            factor: this.sizeFactor(self, c.object, c.dimension, c.to, c.policy),
          };
        case 'joint':
          return { kind: 'joints', turns: [{ joint: c.joint, axis: c.axis, turns: c.turns }] };
        case 'pose':
          // Straightening undoes each joint's turn so far; `validate` refuses wings for now.
          return {
            kind: 'joints',
            turns: [...self.joints].map(([joint, q]) => ({ joint, ...toAxisTurns(conjugate(q)) })),
          };
        case 'opacity':
          return { kind: 'opacity', from: self.opacity, to: c.to };
        case 'paint':
          return { kind: 'paint', from: self.paint, to: c.paint };
        case 'backPaint':
          return { kind: 'backPaint', from: self.backPaint, to: c.paint };
        case 'text':
          return { kind: 'text', text: c.text };
        case 'say':
          return { kind: 'say', speech: { text: c.text, bubble: c.bubble } };
        case 'vehicle':
          return boarding(before, c.object, c.vehicle, carrier);
        case 'shot': {
          const lens = self.lens ?? this.baseLens;
          const { pose, follow } = this.shotPose(before, here, c.shot, c.targets, lens);
          const riding = follow ? relativeTo(scenePose(before, follow), pose) : null;
          return {
            kind: 'shot',
            shot: `${c.shot}:${c.targets.map(targetName).join(',')}`,
            delta: carried(sub(pose.position, here.position)),
            ...turnTo(pose.rotation),
            follow: follow && riding ? { vehicle: follow, ...riding } : null,
          };
        }
        case 'lens':
          return { kind: 'lens', from: self.lens ?? this.baseLens, to: c.verticalAngle };
        case 'atmosphere':
          return skyColour(sky, 'atmosphere', c.colour);
        case 'light':
          return skyColour(sky, c.from === 'above' ? 'fromAbove' : 'fromBelow', c.colour);
        case 'fog':
          return { kind: 'fog', base: sky, from: sky.fog, to: c.density };
        case 'fade':
          return { kind: 'fade', from: self.fade ?? 0, to: c.to };
      }
      // Only the character actions are left (WP4c).
      return { kind: 'action', action: resolveAction(this.world, c, before, here) };
    };
    const r = resolved();
    this.resolved.set(c.seq, r);
    return r;
  }

  /** The box round some targets, in the scene's axes. A marker or a joint is a 30 cm cube. */
  private subject(state: SceneState, targets: readonly Target[]): Box {
    const corners: Vec3[] = [];
    for (const target of targets) {
      const pose = this.targetPose(state, target);
      const box = typeof target === 'string' ? this.shapes.get(target)?.box : undefined;
      const s = box ? state.get(target as ObjectId)!.scale : v(1, 1, 1);
      const { min, max } = box ?? { min: v(-0.15, -0.15, -0.15), max: v(0.15, 0.15, 0.15) };
      for (const x of [min.x, max.x])
        for (const y of [min.y, max.y])
          for (const z of [min.z, max.z])
            corners.push(add(pose.position, rotate(pose.rotation, times(v(x, y, z), s))));
    }
    const low = (k: keyof Vec3) => Math.min(...corners.map((p) => p[k]));
    const high = (k: keyof Vec3) => Math.max(...corners.map((p) => p[k]));
    return { min: v(low('x'), low('y'), low('z')), max: v(high('x'), high('y'), high('z')) };
  }

  /**
   * Where the camera goes for a shot (4.10), worked out when it starts. Every shot but
   * over-the-shoulder looks level at the front of its subject: the box round its targets. With
   * one target, the front is the way it faces; with more, it is across the line between the
   * first two, on the side they face, or the camera's side if they face each other.
   * How much of the subject fills the picture's height is the shot's (`SHOTS`); a wide shot and
   * a two-shot also make room for the subject's width, in a 16:9 picture.
   */
  private shotPose(
    state: SceneState,
    here: Pose,
    shot: ShotType,
    targets: readonly Target[],
    lens: number,
  ): { pose: Pose; follow: ObjectId | null } {
    const tan = Math.tan(lens * Math.PI);
    const level = (a: Vec3) => unit(v(a.x, 0, a.z));
    const at = (t: Target) => this.targetPose(state, t);
    const facing = (t: Target) => level(rotate(at(t).rotation, FORWARD));
    const box = this.subject(state, targets);
    const height = Math.max(box.max.y - box.min.y, 0.1);
    const middle = centre(box);
    if (shot === 'overTheShoulder') {
      // Behind the first target's shoulder, looking at the second's face.
      const [a, b] = [this.subject(state, [targets[0]!]), this.subject(state, [targets[1]!])];
      const ahead = level(sub(centre(b), centre(a))) ?? FORWARD;
      const tall = a.max.y - a.min.y;
      const shoulder = v(centre(a).x, a.max.y - 0.1 * tall, centre(a).z);
      const side = unit(cross(UP, ahead)) ?? v(1, 0, 0);
      // Far enough back and to the side to see past them, as a person would be.
      const position = add(shoulder, add(scale(ahead, -0.6 * tall), scale(side, 0.5 * tall)));
      const face = v(centre(b).x, b.max.y - 0.15 * (b.max.y - b.min.y), centre(b).z);
      return {
        pose: { position, rotation: lookRotation(sub(face, position), UP) ?? here.rotation },
        follow: null,
      };
    }
    // Which way from the subject the camera is.
    let toward = facing(targets[0]!) ?? level(rotate(here.rotation, v(0, 0, -1))) ?? FORWARD;
    // A shot of more than one sees them side by side, as a two-shot does.
    if (targets.length > 1) {
      const across = level(sub(at(targets[1]!).position, at(targets[0]!).position));
      const side = across ? unit(cross(UP, across)) : null;
      if (side) {
        const both = add(facing(targets[0]!) ?? v(0, 0, 0), facing(targets[1]!) ?? v(0, 0, 0));
        const front = length(both) > 1e-6 ? dot(side, both) : dot(side, sub(here.position, middle));
        toward = front >= 0 ? side : scale(side, -1);
      }
    }
    if (shot === 'follow') toward = scale(toward, -1);
    const { fill, aim, wide } = SHOTS[shot];
    const across = unit(cross(UP, toward)) ?? v(1, 0, 0);
    /** How far the subject's footprint reaches along a level direction. */
    const spread = (k: Vec3) => {
      const values = [box.min.x, box.max.x].flatMap((x) =>
        [box.min.z, box.max.z].map((z) => dot(v(x, 0, z), k)),
      );
      return Math.max(...values) - Math.min(...values);
    };
    let distance = (height * fill) / 2 / tan;
    if (wide) distance = Math.max(distance, (spread(across) * wide) / 2 / (tan * ASPECT));
    distance = Math.max(distance, 0.5) + spread(toward) / 2;
    const target = v(middle.x, box.max.y - aim * height, middle.z);
    const lift = shot === 'follow' ? height * 0.4 : 0;
    const position = add(add(target, scale(toward, distance)), v(0, lift, 0));
    const rotation = lookRotation(sub(target, position), UP) ?? here.rotation;
    const first = targets[0]!;
    const follow =
      shot !== 'follow'
        ? null
        : typeof first === 'string'
          ? this.start.has(first)
            ? first
            : null
          : first.object;
    return { pose: { position, rotation }, follow };
  }

  /** Where the camera sees a target well: in front of it, a little above, looking at its middle. */
  private goodView(state: SceneState, target: Target): Pose {
    const pose = this.targetPose(state, target);
    const { middle, size } = this.framing(state, target);
    const distance = Math.max(size, 0.3) * 2.5;
    const position = add(middle, rotate(pose.rotation, v(0, size * 0.25, distance)));
    return { position, rotation: lookRotation(sub(middle, position), UP) ?? pose.rotation };
  }

  /** Where `object` goes to be `relation` its target, the boxes `gap` apart, in the target's axes. */
  private placement(
    state: SceneState,
    object: ObjectId,
    relation: Extract<StageCommand, { kind: 'place' }>['relation'],
    target: Target,
    gap: number,
  ): Vec3 {
    const [axis, sign] = RELATIONS[relation];
    const pose = this.targetPose(state, target);
    const theirs = typeof target === 'string' ? this.shapes.get(target)?.box : undefined;
    const theirScale =
      typeof target === 'string' && state.has(target) ? state.get(target)!.scale : v(1, 1, 1);
    const mine = this.shapes.get(object)?.box;
    const myScale = state.get(object)!.scale;
    const edge = (box: Box | undefined, s: Vec3, side: 'min' | 'max') =>
      box ? box[side][axis] * s[axis] : 0;
    const along =
      sign > 0
        ? edge(theirs, theirScale, 'max') + gap - edge(mine, myScale, 'min')
        : edge(theirs, theirScale, 'min') - gap - edge(mine, myScale, 'max');
    const offset = { x: 0, y: 0, z: 0, [axis]: along } as Vec3;
    return add(pose.position, rotate(pose.rotation, offset));
  }

  private orientation(
    state: SceneState,
    here: Pose,
    to: Orientation,
    upTarget?: Target,
  ): Quat | null {
    const up = upTarget ? rotate(this.targetPose(state, upTarget).rotation, UP) : UP;
    if (to === 'upright') {
      // Keep the way it faces, as far as it can with its top up.
      const facing = rotate(here.rotation, FORWARD);
      const level = sub(facing, scale(up, dot(facing, up)));
      return lookRotation(unit(level) ? level : rotate(here.rotation, v(0, -1, 0)), up);
    }
    if ('pointAt' in to)
      return lookRotation(sub(this.targetPose(state, to.pointAt).position, here.position), up);
    return this.targetPose(state, to.lineUpWith).rotation;
  }

  /** The `resize` factors that make one dimension `to` metres, keeping what `policy` says. */
  private sizeFactor(
    self: ObjectState,
    object: ObjectId,
    dimension: 'width' | 'height' | 'depth',
    to: number,
    policy: Extract<StageCommand, { kind: 'setSize' }>['policy'],
  ): Vec3 {
    const axis = ({ width: 'x', height: 'y', depth: 'z' } as const)[dimension];
    const box = this.shapes.get(object)?.box;
    const now = box ? extents(box)[axis] * self.scale[axis] : 0;
    if (now <= 0) throw bad(`${object} has no ${dimension} to change.`);
    const f = to / now;
    if (policy === 'preserveAspectRatio') return v(f, f, f);
    const others = policy === 'preserveVolume' ? 1 / Math.sqrt(f) : 1;
    return { x: others, y: others, z: others, [axis]: f } as Vec3;
  }

  /** A target names an object, a marker, or a joint the object has. */
  private checkTarget(target: Target): void {
    if (typeof target === 'string') {
      if (!this.markers.has(target)) this.require(this.start, target);
      return;
    }
    this.require(this.start, target.object);
    if (!(this.shapes.get(target.object)?.joints ?? []).includes(target.joint))
      throw new StageError(
        'unknown_joint',
        `${target.object} has no joint called ${target.joint}.`,
      );
  }

  private validate(c: StageCommand): void {
    const exists = (id: ObjectId) => {
      this.require(this.start, id);
    };
    const inSpace = (space: Space) => {
      if (typeof space === 'object') this.checkTarget(space.asSeenBy);
    };
    const isSky = SKY_KINDS.includes(c.kind);
    if (isSky ? c.object !== SCENE : c.object === SCENE)
      throw bad(isSky ? 'Only the scene has a sky, light and fog.' : `The scene can't do that.`);
    if (!isSky) exists(c.object);
    if (c.kind === 'lens' && c.object !== CAMERA) throw bad('Only the camera has a lens.');
    if (
      !Number.isInteger(c.start) ||
      c.start < 0 ||
      !Number.isInteger(c.duration) ||
      c.duration < 0
    )
      throw bad('Start and duration must be whole, non-negative microseconds.');
    const finite = (...n: number[]) => {
      if (!n.every(Number.isFinite)) throw bad('Every number must be finite.');
    };
    const smooth = (pathStyle: string | undefined) => {
      if (pathStyle === 'smooth') throw notYet('a smooth path');
    };
    const colour = (paint: string) => {
      if (!paintColour(paint)) throw badPaint(paint);
    };
    const classIs = (cls: StoryClass, what: string) => {
      if (this.classes.get(c.object) !== cls) throw bad(`Only ${what} has that.`);
    };
    if (isAction(c)) {
      if (c.object === CAMERA) throw bad("The camera can't do that.");
      switch (c.kind) {
        case 'walk':
          if (typeof c.to !== 'object' || !('edge' in c.to)) this.checkTarget(c.to);
          break;
        case 'posture':
          if (c.on !== undefined) this.checkTarget(c.on);
          break;
        case 'reach':
          this.checkTarget(c.target);
          break;
        case 'pickUp':
        case 'putDown':
          exists(c.target);
          if (c.target === c.object || c.target === CAMERA) throw bad("It can't hold that.");
          break;
        case 'clip':
          // The shared clips are humanoid ones; anything else plays only its own.
          if (
            !this.shapes.get(c.object)?.clips?.has(c.clip) &&
            !(this.classes.get(c.object) === 'Biped' && this.library?.has(c.clip))
          )
            throw bad(`${c.object} has no clip called ${c.clip}.`);
          break;
        case 'lookAt':
          if (c.target !== null) this.checkTarget(c.target);
          break;
      }
      return;
    }
    switch (c.kind) {
      case 'translate':
        finite(c.by.x, c.by.y, c.by.z);
        inSpace(c.space);
        break;
      case 'rotate':
        finite(c.axis.x, c.axis.y, c.axis.z, c.turns);
        if (length(c.axis) === 0) throw bad('A turn needs an axis.');
        inSpace(c.space);
        break;
      case 'moveTo':
        smooth(c.pathStyle);
        if (isPoint(c.target)) finite(c.target.x, c.target.y, c.target.z);
        else this.checkTarget(c.target);
        break;
      case 'moveToward':
        finite(c.amount);
        this.checkTarget(c.target);
        break;
      case 'moveAndOrientTo':
        smooth(c.pathStyle);
        this.checkTarget(c.target);
        break;
      case 'place':
        smooth(c.pathStyle);
        finite(c.gap);
        this.checkTarget(c.target);
        break;
      case 'turnToFace':
        this.checkTarget(c.target);
        break;
      case 'orient':
        if (typeof c.to === 'object')
          this.checkTarget('pointAt' in c.to ? c.to.pointAt : c.to.lineUpWith);
        if (c.up) this.checkTarget(c.up);
        break;
      case 'resize':
        finite(c.factor.x, c.factor.y, c.factor.z);
        break;
      case 'setSize':
        finite(c.to);
        if (!(c.to > 0)) throw bad('A size must be more than nothing.');
        break;
      case 'joint':
        finite(c.axis.x, c.axis.y, c.axis.z, c.turns);
        if (!this.joints(c.object).includes(c.joint))
          throw new StageError('unknown_joint', `${c.object} has no joint called ${c.joint}.`);
        break;
      case 'pose':
        if (c.pose !== 'straight') throw notYet('folding and spreading wings');
        break;
      case 'opacity':
        if (!(c.to >= 0 && c.to <= 1)) throw bad('Opacity goes from 0 to 1.');
        break;
      case 'vehicle':
        if (c.vehicle !== null) {
          exists(c.vehicle);
          if (c.vehicle === c.object) throw bad(`${c.object} can't ride on itself.`);
        }
        break;
      case 'shot': {
        if (c.object !== CAMERA) throw bad('Only the camera frames a shot.');
        const needs = c.shot === 'twoShot' || c.shot === 'overTheShoulder' ? 2 : 1;
        if (c.targets.length < needs)
          throw bad(`That shot needs ${needs === 2 ? 'two things' : 'something'} to frame.`);
        c.targets.forEach((t) => this.checkTarget(t));
        break;
      }
      case 'paint':
        colour(c.paint);
        break;
      case 'backPaint':
        classIs('Billboard', 'a billboard');
        colour(c.paint);
        break;
      case 'text':
        classIs('Text', '3D text');
        break;
      case 'say':
        break;
      case 'lens':
        finite(c.verticalAngle);
        if (!(c.verticalAngle > 0 && c.verticalAngle < 0.5))
          throw bad('A viewing angle is more than nothing and less than half a turn.');
        break;
      case 'atmosphere':
      case 'light':
        colour(c.colour);
        break;
      case 'fog':
        if (!(c.density >= 0 && c.density <= 1)) throw bad('Fog goes from 0 to 1.');
        break;
      case 'fade':
        if (!(c.to >= 0 && c.to <= 1)) throw bad('A fade goes from 0 to 1.');
        break;
    }
  }
}

/** Classes that act, and so move about: a walking character isn't in another's way. */
const ACTORS: readonly StoryClass[] = ['Biped', 'Quadruped', 'Flyer', 'Swimmer', 'Slitherer'];

const ROOM_FLOOR: Box = {
  min: v(-ROOM.width / 2, -0.05, -ROOM.depth / 2),
  max: v(ROOM.width / 2, 0, ROOM.depth / 2),
};

/** Whether a backdrop's ground is a room. A ground Babylon.js doesn't know is open ground. */
function isRoom(backdrop: SceneSetup['backdrop']): boolean {
  try {
    return resolveBackdrop(backdrop).ground?.room !== undefined;
  } catch {
    return false;
  }
}

/** The picture's width over its height, for fitting a subject's width: the export's 16:9. */
const ASPECT = 16 / 9;

/**
 * How each shot frames its subject (4.10). `fill` is how much of the subject's height the
 * picture's height takes in; `aim` is how far down from the top of the subject the camera
 * looks, as a part of its height; `wide`, where set, makes the picture that much wider than
 * the subject. Over-the-shoulder is placed by its own rule.
 */
export const SHOTS: Readonly<Record<ShotType, { fill: number; aim: number; wide?: number }>> = {
  /** All of it, with room round it. */
  wide: { fill: 2.2, aim: 0.5, wide: 1.6 },
  /** From the top down to the waist, with a little room above. */
  medium: { fill: 0.7, aim: 0.3 },
  /** Head and shoulders, with a little room above. */
  closeUp: { fill: 0.38, aim: 0.15 },
  /** Two targets side by side, from the waist up, from the side they face. */
  twoShot: { fill: 0.7, aim: 0.3, wide: 1.3 },
  /** Behind and a little above the target, riding with it. */
  follow: { fill: 1.4, aim: 0.4 },
  overTheShoulder: { fill: 0, aim: 0 },
};

/** Which of the target's axes each relation goes along, and which way (spec 02, Directions). */
const RELATIONS = {
  leftOf: ['x', 1],
  rightOf: ['x', -1],
  above: ['y', 1],
  below: ['y', -1],
  inFrontOf: ['z', 1],
  behind: ['z', -1],
} as const satisfies Record<string, readonly ['x' | 'y' | 'z', 1 | -1]>;

const isPoint = (target: Target | Vec3): target is Vec3 =>
  typeof target === 'object' && !('joint' in target);

const targetName = (target: Target) =>
  typeof target === 'string' ? target : `${target.object}.${target.joint}`;

/** A scene with a backdrop Babylon.js doesn't know still has a sky: the default one. */
function skyOf(backdrop: SceneSetup['backdrop']): Sky {
  let resolved;
  try {
    resolved = resolveBackdrop(backdrop);
  } catch {
    resolved = resolveBackdrop({});
  }
  return {
    atmosphere: resolved.sky.atmosphere,
    fromAbove: resolved.lighting.above,
    fromBelow: resolved.lighting.below,
    fog: backdrop.fog ?? 0,
  };
}

function skyColour(sky: Sky, part: SkyPart, paint: string): Resolved {
  return { kind: 'skyColour', part, base: sky, from: sky[part], to: paintColour(paint)! };
}

/** The scene's first state: set-up transforms are in the scene, so riders are worked back. */
function startingState(setup: SceneSetup): Map<ObjectId, ObjectState> {
  const places = new Map<ObjectId, Transform>(setup.objects.map((o) => [o.id, o.transform]));
  if (!places.has(CAMERA)) places.set(CAMERA, setup.camera.transform);
  const vehicles = new Map(setup.objects.map((o) => [o.id, o.vehicle ?? null]));
  const out = new Map<ObjectId, ObjectState>();
  const blank = (t: Pose & { scale: Vec3 }): ObjectState => ({
    position: t.position,
    rotation: t.rotation,
    scale: t.scale,
    opacity: 1,
    paint: null,
    paintBlend: null,
    backPaint: null,
    backPaintBlend: null,
    text: null,
    speech: null,
    vehicle: null,
    shot: null,
    joints: new Map(),
    lens: null,
    sky: null,
    fade: null,
    body: null,
  });
  const place = (id: ObjectId, o?: SceneObjectSetup) => {
    if (id === SCENE) throw bad('Nothing in a scene can be called scene.');
    const t = places.get(id)!;
    if (o?.paint && !paintColour(o.paint)) throw badPaint(o.paint);
    const vehicle = o?.vehicle ?? null;
    if (vehicle !== null) {
      if (!places.has(vehicle)) throw bad(`${id} rides on ${vehicle}, which isn't in the scene.`);
      for (let ride: ObjectId | null = vehicle; ride !== null; ride = vehicles.get(ride) ?? null)
        if (ride === id) throw bad(`${id} ends up riding on itself.`);
    }
    out.set(id, {
      ...blank({ ...(vehicle === null ? t : relativeTo(places.get(vehicle)!, t)), scale: t.scale }),
      opacity: o?.opacity ?? 1,
      paint: o?.paint ?? null,
      vehicle,
    });
  };
  for (const o of setup.objects) place(o.id, o);
  if (!out.has(CAMERA)) place(CAMERA);
  out.set(SCENE, blank({ ...ORIGIN, scale: v(1, 1, 1) }));
  return out;
}

/**
 * Changes what carries an object without moving it. The change is a shift and a turn, not a new
 * pose, so a move the object is already making keeps going. A ride that would loop back to the
 * object itself changes nothing.
 */
function boarding(
  before: SceneState,
  object: ObjectId,
  vehicle: ObjectId | null,
  from: Pose,
): Resolved {
  for (let ride = vehicle; ride !== null; ride = before.get(ride)!.vehicle)
    if (ride === object) {
      const stay = before.get(object)!.vehicle;
      return { kind: 'vehicle', vehicle: stay, shift: v(0, 0, 0), turn: IDENTITY_Q };
    }
  const onto = vehicle === null ? ORIGIN : scenePose(before, vehicle);
  const { position, rotation } = relativeTo(onto, from);
  return { kind: 'vehicle', vehicle, shift: position, turn: rotation };
}

/** A blend that has finished is just the new paint. */
const blendOf = (from: string | null, p: number): Blend | null =>
  p >= 1 ? null : { from, amount: p };

function apply(
  s: ObjectState,
  r: Resolved,
  p: number,
  t: Micros,
  c: StageCommand,
  state: ReadonlyMap<ObjectId, ObjectState>,
): void {
  // Straightening up also lets go of a reach and a look (WP4c).
  if (c.kind === 'pose' && s.body && p >= 1) {
    s.body.reach = null;
    s.body.look = null;
  }
  switch (r.kind) {
    case 'action':
      applyAction(s, r.action, p, t, c, state);
      return;
    case 'translate':
      s.position = add(s.position, scale(r.delta, p));
      return;
    case 'rotate':
      s.rotation = mul(axisTurns(r.axis, r.turns * p), s.rotation);
      return;
    case 'shift':
      s.position = add(s.position, scale(r.delta, p));
      s.rotation = mul(axisTurns(r.axis, r.turns * p), s.rotation);
      return;
    case 'resize':
      s.scale = v(
        s.scale.x * (1 + (r.factor.x - 1) * p),
        s.scale.y * (1 + (r.factor.y - 1) * p),
        s.scale.z * (1 + (r.factor.z - 1) * p),
      );
      return;
    case 'joints':
      for (const j of r.turns)
        s.joints.set(
          j.joint,
          mul(s.joints.get(j.joint) ?? IDENTITY_Q, axisTurns(j.axis, j.turns * p)),
        );
      return;
    case 'opacity':
      s.opacity = r.from + (r.to - r.from) * p;
      return;
    case 'paint':
      s.paint = r.to;
      s.paintBlend = blendOf(r.from, p);
      return;
    case 'backPaint':
      s.backPaint = r.to;
      s.backPaintBlend = blendOf(r.from, p);
      return;
    case 'text':
      s.text = r.text;
      return;
    case 'say':
      if (t < c.start + c.duration) s.speech = r.speech;
      return;
    case 'vehicle':
      s.position = add(r.shift, rotate(r.turn, s.position));
      s.rotation = mul(r.turn, s.rotation);
      s.vehicle = r.vehicle;
      return;
    case 'shot':
      s.shot = r.shot;
      if (r.follow && p >= 1) {
        s.vehicle = r.follow.vehicle;
        s.position = r.follow.position;
        s.rotation = r.follow.rotation;
        return;
      }
      s.position = add(s.position, scale(r.delta, p));
      s.rotation = mul(axisTurns(r.axis, r.turns * p), s.rotation);
      return;
    case 'lens':
      s.lens = lerp(r.from, r.to, p);
      return;
    case 'skyColour':
      s.sky = { ...(s.sky ?? r.base), [r.part]: lerpColour(r.from, r.to, p) };
      return;
    case 'fog':
      s.sky = { ...(s.sky ?? r.base), fog: lerp(r.from, r.to, p) };
      return;
    case 'fade':
      s.fade = lerp(r.from, r.to, p);
      return;
  }
}

function sceneTransform(state: SceneState, id: ObjectId): Transform {
  return { ...scenePose(state, id), scale: state.get(id)!.scale };
}

/**
 * FNV-1a over everything that makes up the scene, rounded to a micrometre (or a millionth).
 * What only later commands can set is added only once set, so a scene that doesn't use it
 * hashes as it always has.
 */
/** What a body is doing, for `hashState`. */
function bodyHash(b: BodyState, n: (x: number) => string): string {
  const target = (t: Target | Vec3) =>
    typeof t === 'object' && 'x' in t ? `${n(t.x)},${n(t.y)},${n(t.z)}` : targetName(t);
  return [
    b.rest,
    b.restSince,
    b.seated ? 'seated' : '',
    b.layers.map((l) => `${l.clip}@${n(l.time)}x${n(l.weight)}`).join(','),
    b.reach ? `reach:${target(b.reach.target)}:${b.reach.hand ?? ''}:${n(b.reach.weight)}` : '',
    b.holding.map((h) => h.object).join(','),
    b.look ? `look:${targetName(b.look.target)}:${n(b.look.weight)}` : '',
    b.face ? `face:${b.face.expression}:${n(b.face.amount)}` : '',
    n(b.blink),
  ].join('/');
}

export function hashState(state: SceneState): number {
  const n = (x: number) => (Math.abs(x) < 5e-7 ? 0 : x).toFixed(6);
  const vec = (a: Vec3) => `${n(a.x)},${n(a.y)},${n(a.z)}`;
  // q and -q are the same rotation: pick the one with w >= 0 so equal scenes hash equally.
  const quat = (q: Quat) => {
    const k = q.w < 0 ? -1 : 1;
    return `${n(q.x * k)},${n(q.y * k)},${n(q.z * k)},${n(q.w * k)}`;
  };
  const colour = (c: Colour) => `${n(c.r)},${n(c.g)},${n(c.b)}`;
  const blend = (b: Blend | null) => (b ? `${b.from ?? ''}>${n(b.amount)}` : null);
  const text = [...state.keys()]
    .sort()
    .flatMap((id) => {
      const s = state.get(id)!;
      if (id === SCENE) {
        const sky = s.sky;
        if (!sky && s.fade === null) return [];
        const parts = sky ? [sky.atmosphere, sky.fromAbove, sky.fromBelow].map(colour) : [];
        const fade = s.fade === null ? [] : [`fade:${n(s.fade)}`];
        return [[id, ...parts, ...(sky ? [n(sky.fog)] : []), ...fade].join('|')];
      }
      const pose = scenePose(state, id);
      const joints = [...s.joints.entries()]
        .sort(([a], [b]) => a.localeCompare(b))
        .map(([j, q]) => `${j}=${quat(q)}`);
      const later = [
        blend(s.paintBlend),
        s.backPaint === null ? null : `back:${s.backPaint}`,
        blend(s.backPaintBlend),
        s.text === null ? null : `text:${s.text}`,
        s.lens === null ? null : `lens:${n(s.lens)}`,
        s.body ? `body:${bodyHash(s.body, n)}` : null,
      ].filter((x) => x !== null);
      return [
        [
          id,
          vec(pose.position),
          quat(pose.rotation),
          vec(s.scale),
          n(s.opacity),
          s.paint ?? '',
          s.speech ? `${s.speech.bubble}:${s.speech.text}` : '',
          s.vehicle ?? '',
          s.shot ?? '',
          joints.join(';'),
          ...later,
        ].join('|'),
      ];
    })
    .join('\n');
  let hash = 0x811c9dc5;
  for (let i = 0; i < text.length; i++) {
    hash ^= text.charCodeAt(i);
    hash = Math.imul(hash, 0x01000193) >>> 0;
  }
  return hash;
}
