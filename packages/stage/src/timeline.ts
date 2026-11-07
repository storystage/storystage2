/**
 * The scene as a pure function of its set-up and the commands so far (spike 1.4). Every stage
 * works the scene out here, so live play, export and tests agree, and equal scenes give equal
 * hashes on every renderer. There are no graphics in this file.
 *
 * What a command means is worked out once, in scene terms, from the scene just before it starts.
 * A rider keeps its pose relative to its vehicle, so it goes where the vehicle goes, even if it
 * boards in the middle of a move. Scale isn't carried, as in Alice.
 *
 * A target (`moveTo`, `turnToFace`, `asSeenBy`) may name a marker as well as an object.
 */
import {
  CAMERA,
  StageError,
  ease,
  type JointName,
  type Micros,
  type ObjectId,
  type Quat,
  type SceneObjectSetup,
  type SceneSetup,
  type Space,
  type StageCommand,
  type StageQuery,
  type StageQueryResult,
  type Target,
  type Transform,
  type Vec3,
} from '@storystage/story-api';
import type { Speech } from './contract.ts';
import {
  IDENTITY_Q,
  add,
  axisTurns,
  conjugate,
  heading,
  length,
  mul,
  rotate,
  scale,
  sub,
  v,
} from './math.ts';
import { paintColour } from './paint.ts';

export interface ObjectState {
  /** Relative to `vehicle`, or to the scene if it has none. */
  position: Vec3;
  rotation: Quat;
  scale: Vec3;
  opacity: number;
  paint: string | null;
  speech: Speech | null;
  vehicle: ObjectId | null;
  shot: string | null;
  joints: Map<JointName, Quat>;
}

export type SceneState = ReadonlyMap<ObjectId, ObjectState>;

/** Whether two objects touch. Each stage decides how: the fake by distance, the real one by size. */
export type Touching = (a: Placed, b: Placed) => boolean;
export interface Placed {
  readonly id: ObjectId;
  readonly transform: Transform;
}

/** A command reduced to scene terms, worked out once at its start time. */
type Resolved =
  | { kind: 'translate'; delta: Vec3 }
  | { kind: 'rotate'; axis: Vec3; turns: number }
  | { kind: 'resize'; factor: Vec3 }
  | { kind: 'joint'; joint: JointName; axis: Vec3; turns: number }
  | { kind: 'opacity'; from: number; to: number }
  | { kind: 'paint'; paint: string }
  | { kind: 'say'; speech: Speech }
  | { kind: 'vehicle'; vehicle: ObjectId | null; shift: Vec3; turn: Quat }
  | { kind: 'shot'; shot: string };

const SCENE: Pose = { position: v(0, 0, 0), rotation: IDENTITY_Q };
interface Pose {
  readonly position: Vec3;
  readonly rotation: Quat;
}

const unknown = (id: ObjectId) =>
  new StageError('unknown_object', `There is nothing called ${id} in this scene.`);
const badPaint = (paint: string) =>
  new StageError('bad_argument', `There is no paint called ${paint}.`);
/** For what the contract has and this stage doesn't do yet (WP4b, spec 02 section 9). */
const notYet = (what: string) => new StageError('bad_argument', `The stage can't do ${what} yet.`);

/** An object or marker target. Joints as targets come in WP4b. */
function objectOnly(target: Target): ObjectId {
  if (typeof target !== 'string') throw notYet('a joint as a target');
  return target;
}

/** A point, as opposed to a joint target. */
function point(target: Exclude<Target, ObjectId> | Vec3): Vec3 {
  if ('joint' in target) throw notYet('a joint as a target');
  return target;
}

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

export class Timeline {
  private start = new Map<ObjectId, ObjectState>();
  private markers = new Map<string, Pose>();
  private jointLists = new Map<ObjectId, readonly JointName[]>();
  private commands: StageCommand[] = [];
  private resolved = new Map<number, Resolved>();
  private now: Micros = 0;
  private state: SceneState = new Map();

  /** Replaces the scene and forgets every command. Throws if a vehicle can't be right. */
  load(setup: SceneSetup, jointsFor: (object: SceneObjectSetup) => readonly JointName[]): void {
    this.start = startingState(setup);
    this.markers = new Map(setup.markers.map((m) => [m.id, m.transform]));
    this.jointLists = new Map(setup.objects.map((o) => [o.id, jointsFor(o)]));
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

  objects(): readonly ObjectId[] {
    return [...this.start.keys()];
  }

  joints(object: ObjectId): readonly JointName[] {
    this.need(object);
    return this.jointLists.get(object) ?? [];
  }

  /** The scene after the last `seek`. */
  current(): SceneState {
    return this.state;
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
    switch (query.kind) {
      case 'transform':
        return { kind: 'transform', value: place(objectOnly(query.object)).transform };
      case 'distance': {
        const from = place(objectOnly(query.from)).transform.position;
        const to = place(objectOnly(query.to)).transform.position;
        return { kind: 'distance', value: length(sub(from, to)) };
      }
      case 'isColliding':
        return { kind: 'isColliding', value: touching(place(query.a), place(query.b)) };
      case 'isVisible':
        return {
          kind: 'isVisible',
          value: state.get(this.require(state, query.object))!.opacity > 0,
        };
      default:
        throw notYet(`the question ${query.kind}`);
    }
  }

  stateHash(): number {
    return hashState(this.state);
  }

  private need(object: ObjectId): ObjectState {
    return this.state.get(this.require(this.state, object))!;
  }

  private require(state: SceneState, object: ObjectId): ObjectId {
    if (!state.has(object)) throw unknown(object);
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
      apply(state.get(c.object)!, r, p, t, c);
    }
    return state;
  }

  /** The pose of an object or a marker, for a command that targets it. */
  private target(state: SceneState, id: ObjectId): Pose {
    return state.has(id) ? scenePose(state, id) : this.markers.get(id)!;
  }

  /** Works out what command `i` means in scene terms, from the scene just before it starts. */
  private resolve(i: number): Resolved {
    const c = this.commands[i]!;
    const cached = this.resolved.get(c.seq);
    if (cached) return cached;
    const before = this.evaluate(c.start, i);
    const self = before.get(c.object)!;
    const here = scenePose(before, c.object);
    const carrier = self.vehicle === null ? SCENE : scenePose(before, self.vehicle);
    // Commands reason in scene terms; the object's own pose is relative to what carries it.
    const carried = (direction: Vec3) => rotate(conjugate(carrier.rotation), direction);
    const axes = (space: Space): Quat =>
      space === 'scene'
        ? IDENTITY_Q
        : space === 'self'
          ? here.rotation
          : this.target(before, space.asSeenBy).rotation;
    const resolved = (): Resolved => {
      switch (c.kind) {
        case 'translate':
          return { kind: 'translate', delta: carried(rotate(axes(c.space), c.by)) };
        case 'moveTo': {
          const target =
            typeof c.target === 'string' ? this.target(before, c.target).position : point(c.target);
          return { kind: 'translate', delta: carried(sub(target, here.position)) };
        }
        case 'rotate':
          return {
            kind: 'rotate',
            axis: carried(rotate(axes(c.space), c.axis)),
            turns: c.turns,
          };
        case 'turnToFace': {
          const d = sub(this.target(before, objectOnly(c.target)).position, here.position);
          const want = Math.atan2(d.x, d.z) / (2 * Math.PI);
          let turns = want - heading(here.rotation);
          turns -= Math.round(turns); // the short way round
          return { kind: 'rotate', axis: carried(v(0, 1, 0)), turns };
        }
        case 'resize':
          return { kind: 'resize', factor: c.factor };
        case 'joint':
          return { kind: 'joint', joint: c.joint, axis: c.axis, turns: c.turns };
        case 'opacity':
          return { kind: 'opacity', from: self.opacity, to: c.to };
        case 'paint':
          return { kind: 'paint', paint: c.paint };
        case 'say':
          return { kind: 'say', speech: { text: c.text, bubble: c.bubble } };
        case 'vehicle':
          return boarding(before, c.object, c.vehicle, carrier);
        case 'shot':
          return { kind: 'shot', shot: `${c.shot}:${c.targets.map(objectOnly).join(',')}` };
        default:
          // `validate` refuses these until the stage can do them.
          throw notYet(c.kind);
      }
    };
    const r = resolved();
    this.resolved.set(c.seq, r);
    return r;
  }

  private validate(c: StageCommand): void {
    const exists = (id: ObjectId) => {
      if (!this.start.has(id)) throw unknown(id);
    };
    const targetable = (id: ObjectId) => {
      if (!this.markers.has(id)) exists(id);
    };
    const inSpace = (space: Space) => {
      if (typeof space === 'object') targetable(space.asSeenBy);
    };
    exists(c.object);
    if (
      !Number.isInteger(c.start) ||
      c.start < 0 ||
      !Number.isInteger(c.duration) ||
      c.duration < 0
    )
      throw new StageError(
        'bad_argument',
        'Start and duration must be whole, non-negative microseconds.',
      );
    const finite = (...n: number[]) => {
      if (!n.every(Number.isFinite))
        throw new StageError('bad_argument', 'Every number must be finite.');
    };
    switch (c.kind) {
      case 'translate':
        finite(c.by.x, c.by.y, c.by.z);
        inSpace(c.space);
        break;
      case 'rotate':
        finite(c.axis.x, c.axis.y, c.axis.z, c.turns);
        if (length(c.axis) === 0) throw new StageError('bad_argument', 'A turn needs an axis.');
        inSpace(c.space);
        break;
      case 'moveTo': {
        if (c.pathStyle === 'smooth') throw notYet('a smooth path');
        const target = c.target;
        if (typeof target === 'string') targetable(target);
        else if ('joint' in target) throw notYet('a joint as a target');
        else finite(target.x, target.y, target.z);
        break;
      }
      case 'turnToFace':
        targetable(objectOnly(c.target));
        break;
      case 'resize':
        finite(c.factor.x, c.factor.y, c.factor.z);
        break;
      case 'joint':
        finite(c.axis.x, c.axis.y, c.axis.z, c.turns);
        if (!(this.jointLists.get(c.object) ?? []).includes(c.joint))
          throw new StageError('unknown_joint', `${c.object} has no joint called ${c.joint}.`);
        break;
      case 'opacity':
        if (!(c.to >= 0 && c.to <= 1))
          throw new StageError('bad_argument', 'Opacity goes from 0 to 1.');
        break;
      case 'vehicle':
        if (c.vehicle !== null) {
          exists(c.vehicle);
          if (c.vehicle === c.object)
            throw new StageError('bad_argument', `${c.object} can't ride on itself.`);
        }
        break;
      case 'shot':
        for (const target of c.targets) exists(objectOnly(target));
        break;
      case 'paint':
        if (!paintColour(c.paint)) throw badPaint(c.paint);
        break;
      case 'say':
        break;
      default:
        throw notYet(c.kind);
    }
  }
}

/** The scene's first state: set-up transforms are in the scene, so riders are worked back. */
function startingState(setup: SceneSetup): Map<ObjectId, ObjectState> {
  const places = new Map<ObjectId, Transform>(setup.objects.map((o) => [o.id, o.transform]));
  if (!places.has(CAMERA)) places.set(CAMERA, setup.camera.transform);
  const vehicles = new Map(setup.objects.map((o) => [o.id, o.vehicle ?? null]));
  const out = new Map<ObjectId, ObjectState>();
  const place = (id: ObjectId, o?: SceneObjectSetup) => {
    const t = places.get(id)!;
    if (o?.paint && !paintColour(o.paint)) throw badPaint(o.paint);
    const vehicle = o?.vehicle ?? null;
    if (vehicle !== null) {
      if (!places.has(vehicle))
        throw new StageError(
          'bad_argument',
          `${id} rides on ${vehicle}, which isn't in the scene.`,
        );
      for (let ride: ObjectId | null = vehicle; ride !== null; ride = vehicles.get(ride) ?? null)
        if (ride === id) throw new StageError('bad_argument', `${id} ends up riding on itself.`);
    }
    out.set(id, {
      ...(vehicle === null ? t : relativeTo(places.get(vehicle)!, t)),
      scale: t.scale,
      opacity: o?.opacity ?? 1,
      paint: o?.paint ?? null,
      speech: null,
      vehicle,
      shot: null,
      joints: new Map(),
    });
  };
  for (const o of setup.objects) place(o.id, o);
  if (!out.has(CAMERA)) place(CAMERA);
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
  const onto = vehicle === null ? SCENE : scenePose(before, vehicle);
  const { position, rotation } = relativeTo(onto, from);
  return { kind: 'vehicle', vehicle, shift: position, turn: rotation };
}

function apply(s: ObjectState, r: Resolved, p: number, t: Micros, c: StageCommand): void {
  switch (r.kind) {
    case 'translate':
      s.position = add(s.position, scale(r.delta, p));
      return;
    case 'rotate':
      s.rotation = mul(axisTurns(r.axis, r.turns * p), s.rotation);
      return;
    case 'resize':
      s.scale = v(
        s.scale.x * (1 + (r.factor.x - 1) * p),
        s.scale.y * (1 + (r.factor.y - 1) * p),
        s.scale.z * (1 + (r.factor.z - 1) * p),
      );
      return;
    case 'joint':
      s.joints.set(
        r.joint,
        mul(s.joints.get(r.joint) ?? IDENTITY_Q, axisTurns(r.axis, r.turns * p)),
      );
      return;
    case 'opacity':
      s.opacity = r.from + (r.to - r.from) * p;
      return;
    case 'paint':
      s.paint = r.paint;
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
      return;
  }
}

function sceneTransform(state: SceneState, id: ObjectId): Transform {
  return { ...scenePose(state, id), scale: state.get(id)!.scale };
}

/** FNV-1a over everything that makes up the scene, rounded to a micrometre (or a millionth). */
export function hashState(state: SceneState): number {
  const n = (x: number) => (Math.abs(x) < 5e-7 ? 0 : x).toFixed(6);
  const vec = (a: Vec3) => `${n(a.x)},${n(a.y)},${n(a.z)}`;
  // q and -q are the same rotation: pick the one with w >= 0 so equal scenes hash equally.
  const quat = (q: Quat) => {
    const k = q.w < 0 ? -1 : 1;
    return `${n(q.x * k)},${n(q.y * k)},${n(q.z * k)},${n(q.w * k)}`;
  };
  const text = [...state.keys()]
    .sort()
    .map((id) => {
      const s = state.get(id)!;
      const pose = scenePose(state, id);
      const joints = [...s.joints.entries()]
        .sort(([a], [b]) => a.localeCompare(b))
        .map(([j, q]) => `${j}=${quat(q)}`);
      return [
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
      ].join('|');
    })
    .join('\n');
  let hash = 0x811c9dc5;
  for (let i = 0; i < text.length; i++) {
    hash ^= text.charCodeAt(i);
    hash = Math.imul(hash, 0x01000193) >>> 0;
  }
  return hash;
}
