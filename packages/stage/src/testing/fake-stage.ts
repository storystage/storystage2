/**
 * A stage with no graphics, for tests and for lanes that run before the real stage exists
 * (WP0.8). It works the scene out exactly from the setup and the commands, using the shared
 * `ease`, records every call made to it, and lets a test fire stage events.
 *
 * Approximations, listed so tests don't rely on them: collisions are "closer than 0.5 m";
 * vehicles are recorded but don't carry their riders; the camera's shot is recorded, not framed;
 * the rendered frame is a few bytes derived from the state hash.
 */
import {
  StageError,
  ease,
  type BackstageId,
  type JointName,
  type Micros,
  type ObjectId,
  type Quat,
  type SceneSetup,
  type Space,
  type StageCommand,
  type StageEvent,
  type StageQuery,
  type StageQueryResult,
  type StoryClass,
  type Transform,
  type Vec3,
  jointName,
} from '@storystage/story-api';
import type { FrameImage, Speech, Stage } from '../contract.ts';
import { IDENTITY_Q, add, axisTurns, heading, length, mul, rotate, scale, sub, v } from './math.ts';

export interface FakeStageCall {
  readonly method: string;
  readonly args: readonly unknown[];
}

export interface FakeStageOptions {
  /** If given, `load` refuses models not in this list (stand-ins are always fine). */
  readonly knownModels?: readonly BackstageId[];
  /** The joints each object has. Default: `head` and `neck` for anything that can act, none for the rest. */
  readonly jointsFor?: (
    cls: StoryClass,
    model: SceneSetup['objects'][number]['model'],
  ) => readonly JointName[];
}

interface ObjectState {
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

/** A command reduced to scene terms, worked out once at its start time. */
type Resolved =
  | { kind: 'translate'; delta: Vec3 }
  | { kind: 'rotate'; axis: Vec3; turns: number }
  | { kind: 'resize'; factor: Vec3 }
  | { kind: 'joint'; joint: JointName; axis: Vec3; turns: number }
  | { kind: 'opacity'; from: number; to: number }
  | { kind: 'paint'; paint: string }
  | { kind: 'say'; speech: Speech }
  | { kind: 'vehicle'; vehicle: ObjectId | null }
  | { kind: 'shot'; shot: string };

const ACTORS: readonly StoryClass[] = ['Biped', 'Quadruped', 'Flyer', 'Swimmer', 'Slitherer'];
const defaultJoints: NonNullable<FakeStageOptions['jointsFor']> = (cls) =>
  ACTORS.includes(cls) ? [jointName('head'), jointName('neck')] : [];

export class FakeStage implements Stage {
  readonly calls: FakeStageCall[] = [];
  private setup: SceneSetup | null = null;
  private commands: StageCommand[] = [];
  private resolved = new Map<number, Resolved>();
  private listeners = new Set<(e: StageEvent) => void>();
  private now: Micros = 0;
  private state = new Map<ObjectId, ObjectState>();
  private jointLists = new Map<ObjectId, readonly JointName[]>();
  private readonly options: FakeStageOptions;

  constructor(options: FakeStageOptions = {}) {
    this.options = options;
  }

  private record(method: string, args: unknown[]) {
    this.calls.push({ method, args: structuredClone(args) });
  }

  async load(setup: SceneSetup): Promise<void> {
    this.record('load', [setup]);
    const known = this.options.knownModels;
    for (const o of setup.objects) {
      if (known && typeof o.model === 'string' && !known.includes(o.model))
        throw new StageError('unknown_model', `There is no model called ${o.model}.`);
    }
    this.setup = structuredClone(setup);
    this.jointLists.clear();
    const jointsFor = this.options.jointsFor ?? defaultJoints;
    for (const o of setup.objects) this.jointLists.set(o.id, jointsFor(o.class, o.model));
    this.commands = [];
    this.resolved.clear();
    this.now = 0;
    this.state = this.evaluate(0);
  }

  objects(): readonly ObjectId[] {
    return [...this.initial().keys()];
  }

  joints(object: ObjectId): readonly JointName[] {
    this.need(object);
    return this.jointLists.get(object) ?? [];
  }

  schedule(commands: readonly StageCommand[]): void {
    this.record('schedule', [commands]);
    for (const c of commands) this.validate(c);
    this.commands.push(...structuredClone(commands));
    this.commands.sort((a, b) => a.start - b.start || a.seq - b.seq);
    // A command that starts earlier can change how later ones resolve.
    this.resolved.clear();
    this.state = this.evaluate(this.now);
  }

  reset(): void {
    this.record('reset', []);
    this.commands = [];
    this.resolved.clear();
    this.now = 0;
    this.state = this.evaluate(0);
  }

  seek(t: Micros): void {
    this.record('seek', [t]);
    this.now = t;
    this.state = this.evaluate(t);
  }

  time(): Micros {
    return this.now;
  }

  transform(object: ObjectId): Transform {
    const s = this.need(object);
    return { position: s.position, rotation: s.rotation, scale: s.scale };
  }

  speech(object: ObjectId): Speech | null {
    return this.need(object).speech;
  }

  answer(query: StageQuery): StageQueryResult {
    this.record('answer', [query]);
    const state = this.evaluate(query.at);
    const get = (id: ObjectId) => {
      const s = state.get(id);
      if (!s)
        throw new StageError('unknown_object', `There is nothing called ${id} in this scene.`);
      return s;
    };
    switch (query.kind) {
      case 'transform': {
        const s = get(query.object);
        return {
          kind: 'transform',
          value: { position: s.position, rotation: s.rotation, scale: s.scale },
        };
      }
      case 'distance':
        return {
          kind: 'distance',
          value: length(sub(get(query.from).position, get(query.to).position)),
        };
      case 'isColliding':
        return {
          kind: 'isColliding',
          value: length(sub(get(query.a).position, get(query.b).position)) < 0.5,
        };
      case 'isVisible':
        return { kind: 'isVisible', value: get(query.object).opacity > 0 };
    }
  }

  onEvent(listener: (event: StageEvent) => void): () => void {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }

  /** Test helper: fire a stage event, as a click or a collision would. */
  emit(event: StageEvent): void {
    for (const l of [...this.listeners]) l(event);
  }

  stateHash(): number {
    return hashState(this.state);
  }

  async renderFrame(): Promise<FrameImage> {
    this.record('renderFrame', []);
    const h = this.stateHash();
    return {
      width: 1,
      height: 1,
      data: new Uint8ClampedArray([h >>> 24, (h >>> 16) & 255, (h >>> 8) & 255, 255]),
    };
  }

  dispose(): void {
    this.record('dispose', []);
    this.listeners.clear();
  }

  // ---- Working out the scene ---------------------------------------------------------------

  private initial(): Map<ObjectId, ObjectState> {
    const out = new Map<ObjectId, ObjectState>();
    if (!this.setup) return out;
    const make = (
      t: Transform,
      opacity = 1,
      paint: string | null = null,
      vehicle: ObjectId | null = null,
    ): ObjectState => ({
      position: t.position,
      rotation: t.rotation,
      scale: t.scale,
      opacity,
      paint,
      speech: null,
      vehicle,
      shot: null,
      joints: new Map(),
    });
    for (const o of this.setup.objects)
      out.set(o.id, make(o.transform, o.opacity ?? 1, o.paint ?? null, o.vehicle ?? null));
    if (!out.has('camera' as ObjectId))
      out.set('camera' as ObjectId, make(this.setup.camera.transform));
    return out;
  }

  /** The scene at `t`, counting commands before index `limit` (in start, seq order) only. */
  private evaluate(t: Micros, limit = this.commands.length): Map<ObjectId, ObjectState> {
    const state = this.initial();
    for (let i = 0; i < limit; i++) {
      const c = this.commands[i]!;
      if (c.start > t) break;
      const r = this.resolve(i);
      const p = c.duration === 0 ? 1 : ease(c.style, (t - c.start) / c.duration);
      apply(state.get(c.object)!, r, p, t, c);
    }
    return state;
  }

  /** Works out what command `i` means in scene terms, from the scene just before it starts. */
  private resolve(i: number): Resolved {
    const c = this.commands[i]!;
    const cached = this.resolved.get(c.seq);
    if (cached) return cached;
    const before = this.evaluate(c.start, i);
    const self = before.get(c.object)!;
    const axes = (space: Space): Quat =>
      space === 'scene'
        ? IDENTITY_Q
        : space === 'self'
          ? self.rotation
          : before.get(space.asSeenBy)!.rotation;
    let r: Resolved;
    switch (c.kind) {
      case 'translate':
        r = { kind: 'translate', delta: rotate(axes(c.space), c.by) };
        break;
      case 'moveTo': {
        const target = typeof c.target === 'string' ? before.get(c.target)!.position : c.target;
        r = { kind: 'translate', delta: sub(target, self.position) };
        break;
      }
      case 'rotate':
        r = { kind: 'rotate', axis: rotate(axes(c.space), c.axis), turns: c.turns };
        break;
      case 'turnToFace': {
        const d = sub(before.get(c.target)!.position, self.position);
        const want = Math.atan2(d.x, d.z) / (2 * Math.PI);
        let turns = want - heading(self.rotation);
        turns -= Math.round(turns); // the short way round
        r = { kind: 'rotate', axis: v(0, 1, 0), turns };
        break;
      }
      case 'resize':
        r = { kind: 'resize', factor: c.factor };
        break;
      case 'joint':
        r = { kind: 'joint', joint: c.joint, axis: c.axis, turns: c.turns };
        break;
      case 'opacity':
        r = { kind: 'opacity', from: self.opacity, to: c.to };
        break;
      case 'paint':
        r = { kind: 'paint', paint: c.paint };
        break;
      case 'say':
        r = { kind: 'say', speech: { text: c.text, bubble: c.bubble } };
        break;
      case 'vehicle':
        r = { kind: 'vehicle', vehicle: c.vehicle };
        break;
      case 'shot':
        r = { kind: 'shot', shot: `${c.shot}:${c.targets.join(',')}` };
        break;
    }
    this.resolved.set(c.seq, r);
    return r;
  }

  private need(object: ObjectId): ObjectState {
    const s = this.state.get(object);
    if (!s)
      throw new StageError('unknown_object', `There is nothing called ${object} in this scene.`);
    return s;
  }

  private validate(c: StageCommand): void {
    const objects = this.initial();
    const exists = (id: ObjectId) => {
      if (!objects.has(id))
        throw new StageError('unknown_object', `There is nothing called ${id} in this scene.`);
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
        if (typeof c.space === 'object') exists(c.space.asSeenBy);
        break;
      case 'rotate':
        finite(c.axis.x, c.axis.y, c.axis.z, c.turns);
        if (length(c.axis) === 0) throw new StageError('bad_argument', 'A turn needs an axis.');
        if (typeof c.space === 'object') exists(c.space.asSeenBy);
        break;
      case 'moveTo':
        if (typeof c.target === 'string') exists(c.target);
        else finite(c.target.x, c.target.y, c.target.z);
        break;
      case 'turnToFace':
        exists(c.target);
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
        if (c.vehicle !== null) exists(c.vehicle);
        break;
      case 'shot':
        c.targets.forEach(exists);
        break;
      case 'paint':
      case 'say':
        break;
    }
  }
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
      s.vehicle = r.vehicle;
      return;
    case 'shot':
      s.shot = r.shot;
      return;
  }
}

/** FNV-1a over everything that makes up the scene, rounded to a micrometre (or a millionth). */
export function hashState(state: ReadonlyMap<ObjectId, ObjectState>): number {
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
      const joints = [...s.joints.entries()]
        .sort(([a], [b]) => a.localeCompare(b))
        .map(([j, q]) => `${j}=${quat(q)}`);
      return [
        id,
        vec(s.position),
        quat(s.rotation),
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
