/**
 * WP4c: character actions (4.5) and faces (4.6) on the timeline. Each is worked out once, from
 * the scene as it starts, like every other command (`timeline.ts`), and then applied at any
 * moment. A walk moves the object along its way; a body's clips, reach, look and face are kept
 * in its state, and `bodyPose` turns them into a humanoid pose that both stages show.
 */
import {
  CAMERA,
  ease,
  type Micros,
  type ObjectId,
  type Quat,
  type StageCommand,
  type Target,
  type Vec3,
} from '@storystage/story-api';
import type { Box } from './hull.ts';
import type { Body, Hand } from './humanoid/body.ts';
import type { HumanLibrary } from './humanoid/library.ts';
import { overlay, sample, slerp, type HumanPose } from './humanoid/pose.ts';
import { add, axisTurns, conjugate, heading, mul, rotate, scale, sub, v } from './math.ts';
import type { Navigation } from './navigation.ts';

const UP = v(0, 1, 0);
const SECOND = 1_000_000;
const ASPECT = 16 / 9;

/** Speeds for a model with no humanoid body, in metres a second. */
const PLAIN_WALK = 1.2;
const PLAIN_RUN = 3;
/** How far into a turn a walker goes before it faces its new way, in metres. */
const TURNING = 0.4;
/** How long a clip takes to come in and go out, in seconds. */
const FADE = 0.2;
/** How far a head turns to look, in turns. */
const LOOK_LIMIT = 0.2;

export type Rest = 'stand' | 'sit' | 'sitFloor' | 'lie';

/** A clip playing at a moment. `own` is one of the model's own clips, which its view plays. */
export interface Layer {
  readonly clip: string;
  readonly time: number;
  readonly weight: number;
  /** The whole body; a gesture turns only the bones it names. */
  readonly whole: boolean;
  readonly own: boolean;
}

/** What a character's body is doing at a moment, once an action has set it. */
export interface BodyState {
  rest: Rest;
  restSince: Micros;
  /** On something: its hips are on a seat, not its feet on the ground. */
  seated: boolean;
  layers: Layer[];
  reach: { target: Target | Vec3; hand: Hand | null; weight: number } | null;
  holding: { object: ObjectId; hand: Hand | null }[];
  look: { target: Target; weight: number } | null;
  face: { expression: string; amount: number } | null;
  blink: number;
}

export const freshBody = (): BodyState => ({
  rest: 'stand',
  restSince: 0,
  seated: false,
  layers: [],
  reach: null,
  holding: [],
  look: null,
  face: null,
  blink: 0,
});

interface Pose {
  readonly position: Vec3;
  readonly rotation: Quat;
}

/** What the actions need of the timeline and the scene. */
export interface World {
  readonly library: HumanLibrary | null;
  body(object: ObjectId): Body | null;
  scale(state: ReadonlyMap<ObjectId, { scale: Vec3 }>, object: ObjectId): Vec3;
  ownClip(object: ObjectId, clip: string): number | null;
  pose(state: unknown, object: ObjectId): Pose;
  targetPose(state: unknown, target: Target): Pose;
  /** The box round a target in the scene's axes. */
  box(state: unknown, target: Target): Box;
  /** The object's box at scale 1, in its own axes. */
  ownBox(object: ObjectId): Box | null;
  lens(state: unknown): number;
  navigation(state: unknown): Navigation | null;
  ground(): number;
  isObject(target: Target): boolean;
}

export type Action =
  | {
      kind: 'walk';
      points: readonly Vec3[];
      /** How far along the way each point is, in metres. */
      along: readonly number[];
      total: number;
      startYaw: number;
      yaws: readonly number[];
      endYaw: number | null;
      enter: boolean;
      walkSpeed: number;
      runSpeed: number;
      gait: 'walk' | 'run';
      body: boolean;
    }
  | {
      kind: 'posture';
      clip: string | null;
      length: number;
      rest: Rest;
      seatedDuring: boolean;
      seatedAfter: boolean;
      delta: Vec3;
      turns: number;
    }
  | { kind: 'reach'; target: Target; hand: Hand | null; then: 'touch' | 'stay'; length: number }
  | {
      kind: 'pickUp';
      target: ObjectId;
      hand: Hand | null;
      grab: Pose;
      carry: Pose;
      length: number;
    }
  | {
      kind: 'putDown';
      target: ObjectId;
      held: boolean;
      from: Pose;
      place: Pose;
      placeHeld: Pose;
      length: number;
    }
  | { kind: 'clip'; clip: string; own: boolean; length: number }
  | { kind: 'gesture'; clip: string; length: number }
  | { kind: 'expression'; expression: string; length: number }
  | { kind: 'lookAt'; target: Target | null; previous: Target | null; length: number };

type ActionCommand = Extract<
  StageCommand,
  {
    kind:
      | 'walk'
      | 'enter'
      | 'posture'
      | 'reach'
      | 'pickUp'
      | 'putDown'
      | 'clip'
      | 'gesture'
      | 'expression'
      | 'lookAt';
  }
>;

export const ACTION_KINDS: readonly ActionCommand['kind'][] = [
  'walk',
  'enter',
  'posture',
  'reach',
  'pickUp',
  'putDown',
  'clip',
  'gesture',
  'expression',
  'lookAt',
];

export const isAction = (c: { kind: string }): c is ActionCommand =>
  (ACTION_KINDS as readonly string[]).includes(c.kind);

const yawTurn = (yaw: number) => axisTurns(UP, yaw);
const shortest = (d: number) => d - Math.round(d);
const flat = (p: Vec3, y: number) => v(p.x, y, p.z);
const centre = (b: Box) => scale(add(b.min, b.max), 0.5);

/** The pose that puts something at `pose` when it's carried by `carrier`. */
function relativeTo(carrier: Pose, pose: Pose): Pose {
  const back = conjugate(carrier.rotation);
  return {
    position: rotate(back, sub(pose.position, carrier.position)),
    rotation: mul(back, pose.rotation),
  };
}

const lerpPose = (a: Pose, b: Pose, p: number): Pose => ({
  position: add(a.position, scale(sub(b.position, a.position), p)),
  rotation: slerp(a.rotation, b.rotation, p),
});

/** A clip's length in seconds, from the shared library. */
function lengthOf(world: World, clip: string): number {
  return world.library?.get(clip)?.duration ?? 0;
}

/** Where a walk to `to` stops: in front of a thing, on a marker or a point, or out of the picture. */
function destination(
  world: World,
  state: unknown,
  c: Extract<ActionCommand, { kind: 'walk' }>,
  from: Vec3,
): { to: Vec3; face: Vec3 | null } {
  const to = c.to;
  if (typeof to === 'object' && 'edge' in to)
    return { to: edgePoint(world, state, to.edge, from), face: null };
  const pose = world.targetPose(state, to);
  if (typeof to === 'string' && !world.isObject(to))
    return { to: flat(pose.position, from.y), face: null };
  // A thing: the nearest point to the walker of its footprint, a step out from it.
  const box = world.box(state, to);
  const step = 0.35;
  const clamp = (x: number, low: number, high: number) =>
    Math.min(Math.max(x, low - step), high + step);
  const at = v(clamp(from.x, box.min.x, box.max.x), from.y, clamp(from.z, box.min.z, box.max.z));
  const middle = centre(box);
  return { to: at, face: flat(middle, from.y) };
}

/** A point on the ground out of the picture past one of its edges, as the camera sees it now. */
function edgePoint(world: World, state: unknown, edge: string, from: Vec3): Vec3 {
  const camera = world.pose(state, CAMERA);
  const forward = flat(rotate(camera.rotation, v(0, 0, 1)), 0);
  const n = Math.hypot(forward.x, forward.z) || 1;
  const ahead = v(forward.x / n, 0, forward.z / n);
  // +X is the picture's left (spec 02, Directions).
  const left = v(ahead.z, 0, -ahead.x);
  const d = Math.max(
    1,
    (from.x - camera.position.x) * ahead.x + (from.z - camera.position.z) * ahead.z,
  );
  const half = Math.tan(Math.PI * world.lens(state)) * d * ASPECT;
  const base = add(flat(camera.position, from.y), scale(ahead, d));
  switch (edge) {
    case 'left':
      return add(base, scale(left, half + 1.5));
    case 'right':
      return add(base, scale(left, -(half + 1.5)));
    case 'back':
      return add(base, scale(ahead, 15));
    default:
      // Towards the camera and past it.
      return add(flat(camera.position, from.y), scale(ahead, -1.5));
  }
}

function walkWay(world: World, state: unknown, from: Vec3, to: Vec3): Vec3[] {
  const nav = world.navigation(state);
  const way = nav ? nav.toward(from, to) : [from, to];
  return way.map((p) => flat(p, from.y));
}

function speeds(world: World, object: ObjectId, body: Body | null, height: number) {
  const walk = world.library?.get('walk')?.speed;
  const run = world.library?.get('run')?.speed;
  if (!body || !walk || !run) return { walkSpeed: PLAIN_WALK, runSpeed: PLAIN_RUN };
  const h = body.hipsHeight * height;
  void object;
  return { walkSpeed: walk * h, runSpeed: run * h };
}

function walkAction(
  world: World,
  state: unknown,
  object: ObjectId,
  here: Pose,
  points: Vec3[],
  face: Vec3 | null,
  gait: 'walk' | 'run',
  enter: boolean,
): Action {
  const along = [0];
  const yaws: number[] = [];
  for (let i = 1; i < points.length; i++) {
    const d = sub(points[i]!, points[i - 1]!);
    along.push(along[i - 1]! + Math.hypot(d.x, d.z));
    yaws.push(Math.atan2(d.x, d.z) / (2 * Math.PI));
  }
  const total = along[along.length - 1]!;
  const end = points[points.length - 1]!;
  const endYaw = face ? Math.atan2(face.x - end.x, face.z - end.z) / (2 * Math.PI) : null;
  const body = world.body(object);
  const height = world.scale(state as ReadonlyMap<ObjectId, { scale: Vec3 }>, object).y;
  return {
    kind: 'walk',
    points,
    along,
    total,
    startYaw: heading(here.rotation),
    yaws,
    endYaw,
    enter,
    gait,
    body: body !== null,
    ...speeds(world, object, body, height),
  };
}

/** Works an action out from the scene as it starts. `here` is the object's pose in the scene. */
export function resolveAction(
  world: World,
  c: ActionCommand,
  state: ReadonlyMap<ObjectId, { body: BodyState | null; vehicle: ObjectId | null; scale: Vec3 }>,
  here: Pose,
): Action {
  const self = state.get(c.object)!;
  const was = self.body ?? freshBody();
  const body = world.body(c.object);
  const size = self.scale;
  const ground = world.ground();
  switch (c.kind) {
    case 'walk': {
      const { to, face } = destination(world, state, c, here.position);
      return walkAction(
        world,
        state,
        c.object,
        here,
        walkWay(world, state, here.position, to),
        face,
        c.gait,
        false,
      );
    }
    case 'enter': {
      const start = edgePoint(world, state, c.from, here.position);
      return walkAction(
        world,
        state,
        c.object,
        here,
        walkWay(world, state, start, here.position),
        null,
        c.gait,
        true,
      );
    }
    case 'posture':
      return postureAction(world, c, state, here, was, body, size, ground);
    case 'reach': {
      const hand = body
        ? body.nearerHand(toModel(here, size, pointOf(world, state, c.target, here.position)))
        : null;
      return {
        kind: 'reach',
        target: c.target,
        hand,
        then: c.then,
        length: c.then === 'touch' ? 1.2 : 0.8,
      };
    }
    case 'pickUp': {
      const target = world.pose(state, c.target);
      const hand = body ? body.nearerHand(toModel(here, size, target.position)) : null;
      const grab = relativeTo(here, target);
      return {
        kind: 'pickUp',
        target: c.target,
        hand,
        grab,
        carry: carryPose(
          world,
          c.object,
          c.target,
          body,
          size,
          hand,
          grab.rotation,
          world.scale(state, c.target),
        ),
        length: lengthOf(world, 'pickUp') || 1.3,
      };
    }
    case 'putDown': {
      const thing = state.get(c.target)!;
      const target = world.pose(state, c.target);
      const held = thing.vehicle === c.object;
      const front = (body ? body.hipsHeight * 1.1 : 0.5) * size.z;
      const spot = add(here.position, rotate(here.rotation, v(0, 0, front)));
      const own = world.ownBox(c.target);
      const lift = own ? -own.min.y * thing.scale.y : 0;
      const place = { position: v(spot.x, ground + lift, spot.z), rotation: target.rotation };
      return {
        kind: 'putDown',
        target: c.target,
        held,
        from: relativeTo(here, target),
        place,
        placeHeld: relativeTo(here, place),
        length: lengthOf(world, 'pickUp') || 1.3,
      };
    }
    case 'clip': {
      const own = world.ownClip(c.object, c.clip);
      return own !== null
        ? { kind: 'clip', clip: c.clip, own: true, length: own }
        : { kind: 'clip', clip: c.clip, own: false, length: lengthOf(world, c.clip) };
    }
    case 'gesture':
      return { kind: 'gesture', clip: c.gesture, length: lengthOf(world, c.gesture) };
    case 'expression':
      return {
        kind: 'expression',
        expression: c.expression,
        length: c.expression === 'blink' ? 0.25 : 0.3,
      };
    case 'lookAt':
      return { kind: 'lookAt', target: c.target, previous: was.look?.target ?? null, length: 0.5 };
  }
}

/** Where a target is to reach for: the nearest point of a thing, or a marker's or joint's place. */
function pointOf(world: World, state: unknown, target: Target | Vec3, near: Vec3): Vec3 {
  if (typeof target === 'object' && 'x' in target) return target;
  if (typeof target === 'string' && world.isObject(target)) {
    const box = world.box(state, target);
    const clamp = (x: number, low: number, high: number) => Math.min(Math.max(x, low), high);
    return v(
      clamp(near.x, box.min.x, box.max.x),
      clamp(near.y, box.min.y, box.max.y),
      clamp(near.z, box.min.z, box.max.z),
    );
  }
  return world.targetPose(state, target).position;
}

const toModel = (pose: Pose, size: Vec3, p: Vec3): Vec3 => {
  const local = rotate(conjugate(pose.rotation), sub(p, pose.position));
  return v(local.x / size.x, local.y / size.y, local.z / size.z);
};

/** Where a held thing goes, relative to its holder: in front of its chest, on the hand's side. */
function carryPose(
  world: World,
  holder: ObjectId,
  thing: ObjectId,
  body: Body | null,
  size: Vec3,
  hand: Hand | null,
  turn: Quat,
  thingSize: Vec3,
): Pose {
  const own = world.ownBox(thing);
  const middle = own ? centre(own) : v(0, 0, 0);
  const holderBox = world.ownBox(holder);
  const h = body ? body.hipsHeight : holderBox ? (holderBox.max.y - holderBox.min.y) * 0.5 : 0.5;
  const side = hand === 'right' ? -1 : 1;
  const at = v(side * 0.2 * h * size.x, 1.25 * h * size.y, 0.6 * h * size.z);
  const offset = rotate(
    turn,
    v(middle.x * thingSize.x, middle.y * thingSize.y, middle.z * thingSize.z),
  );
  return { position: sub(at, offset), rotation: turn };
}

function postureAction(
  world: World,
  c: Extract<ActionCommand, { kind: 'posture' }>,
  state: unknown,
  here: Pose,
  was: BodyState,
  body: Body | null,
  size: Vec3,
  ground: number,
): Action {
  const still = { delta: v(0, 0, 0), turns: 0 };
  const clipped = (
    clip: string | null,
    rest: Rest,
    extra: Partial<Action & { kind: 'posture' }> = {},
  ) =>
    ({
      kind: 'posture',
      clip,
      length: clip ? lengthOf(world, clip) || 1 : 0,
      rest,
      seatedDuring: false,
      seatedAfter: false,
      ...still,
      ...extra,
    }) as Action;
  switch (c.posture) {
    case 'sit': {
      if (!c.on) return clipped('sitDownOnFloor', 'sitFloor');
      const box = world.box(state, c.on);
      const tall = box.max.y - box.min.y;
      const seat = v(
        (box.min.x + box.max.x) / 2,
        box.min.y + (tall > 0.7 ? 0.45 * tall : tall),
        (box.min.z + box.max.z) / 2,
      );
      const facing = world.isObject(c.on)
        ? heading(world.targetPose(state, c.on).rotation)
        : heading(here.rotation);
      const turn = yawTurn(facing);
      const end = world.library?.get('sitDown');
      const hips = body && end ? end.keys[end.keys.length - 1]!.pose.hips : v(0, 0, 0);
      const h = body ? body.hipsHeight : 0;
      // The hips land on the seat.
      const inModel = v(hips.x * h * size.x, (h + hips.y * h) * size.y, hips.z * h * size.z);
      const root = sub(seat, rotate(turn, inModel));
      return clipped('sitDown', 'sit', {
        delta: sub(root, here.position),
        turns: shortest(facing - heading(here.rotation)),
        seatedDuring: true,
        seatedAfter: true,
      });
    }
    case 'lie':
      return clipped('lieDown', 'lie');
    case 'fall':
      return clipped('fall', 'lie');
    case 'stand': {
      const clip =
        was.rest === 'sit'
          ? 'standUpFromSitting'
          : was.rest === 'sitFloor'
            ? 'standUpFromFloor'
            : was.rest === 'lie'
              ? 'standUpFromLying'
              : null;
      // Off a seat, back down to the ground in front of it.
      const down = was.seated ? v(0, ground - here.position.y, 0) : v(0, 0, 0);
      return clipped(clip, 'stand', { delta: down, seatedDuring: was.seated });
    }
  }
}

/** How long an action takes at its own pace, in seconds. */
export function naturalLength(a: Action): number {
  switch (a.kind) {
    case 'walk':
      return a.total / (a.gait === 'run' ? a.runSpeed : a.walkSpeed);
    default:
      return a.length;
  }
}

/** How much of a clip shows near the ends of its command: it comes in and goes out. */
function faded(elapsed: number, duration: number): number {
  if (duration <= 0) return 0;
  return Math.min(1, elapsed / FADE, (duration - elapsed) / FADE);
}

/** Where along a walk's way a distance is, and which way the walker faces there. */
function along(a: Extract<Action, { kind: 'walk' }>, d: number): { at: Vec3; yaw: number } {
  const { points, along: at, yaws } = a;
  if (points.length < 2 || a.total <= 0) return { at: points[0]!, yaw: a.startYaw };
  let i = 0;
  while (i < yaws.length - 1 && at[i + 1]! < d) i++;
  const span = at[i + 1]! - at[i]!;
  const into = Math.max(0, d - at[i]!);
  const p = span > 0 ? Math.min(1, into / span) : 1;
  const point = add(points[i]!, scale(sub(points[i + 1]!, points[i]!), p));
  const before = i === 0 ? (a.enter ? yaws[0]! : a.startYaw) : yaws[i - 1]!;
  let yaw =
    before +
    shortest(yaws[i]! - before) * Math.min(1, into / Math.min(TURNING, span / 2 || TURNING));
  if (a.endYaw !== null) {
    const left = a.total - d;
    if (left < TURNING) yaw += shortest(a.endYaw - yaw) * (1 - left / TURNING);
  }
  return { at: point, yaw };
}

interface Mutable {
  position: Vec3;
  rotation: Quat;
  vehicle: ObjectId | null;
  body: BodyState | null;
}

/**
 * Applies an action `t` into the scene, the command `p` of the way done (eased). Picking up and
 * putting down also move the thing held, which rides its holder as on a vehicle.
 */
export function applyAction(
  s: Mutable,
  a: Action,
  p: number,
  t: Micros,
  c: StageCommand,
  others: ReadonlyMap<ObjectId, Mutable>,
): void {
  const elapsed = (t - c.start) / SECOND;
  const duration = c.duration / SECOND;
  const x = c.duration === 0 ? 1 : Math.min(1, (t - c.start) / c.duration);
  const going = t < c.start + c.duration;
  const body = (s.body ??= freshBody());
  switch (a.kind) {
    case 'walk': {
      const d = a.total * p;
      const { at, yaw } = along(a, d);
      const from = a.enter ? a.points[a.points.length - 1]! : a.points[0]!;
      s.position = add(s.position, sub(at, from));
      s.rotation = mul(yawTurn(shortest(yaw - a.startYaw)), s.rotation);
      if (a.body && going && duration > 0) {
        // How fast it's going now, from how the command eases.
        const e = 1e-3;
        const slope =
          (ease(c.style, Math.min(1, x + e)) - ease(c.style, Math.max(0, x - e))) /
          (Math.min(1, x + e) - Math.max(0, x - e));
        const speed = (a.total * slope) / duration;
        const run =
          a.gait === 'run'
            ? Math.min(1, Math.max(0, (speed - a.walkSpeed) / (a.runSpeed - a.walkSpeed)))
            : 0;
        const moving = Math.min(1, speed / (0.3 * a.walkSpeed));
        body.layers.push({
          clip: 'walk',
          time: d / a.walkSpeed,
          weight: moving * (1 - run),
          whole: true,
          own: false,
        });
        if (run > 0)
          body.layers.push({
            clip: 'run',
            time: d / a.runSpeed,
            weight: moving * run,
            whole: true,
            own: false,
          });
      }
      return;
    }
    case 'posture': {
      s.position = add(s.position, scale(a.delta, p));
      if (a.turns) s.rotation = mul(yawTurn(a.turns * p), s.rotation);
      body.reach = null;
      if (going) {
        body.seated = a.seatedDuring;
        if (a.clip)
          body.layers.push({
            clip: a.clip,
            time: x * a.length,
            weight: Math.min(1, elapsed / 0.15),
            whole: true,
            own: false,
          });
      } else {
        body.rest = a.rest;
        body.restSince = c.start + c.duration;
        body.seated = a.seatedAfter;
      }
      return;
    }
    case 'reach': {
      const w =
        a.then === 'touch'
          ? x < 0.5
            ? ease('beginAndEndGently', 2 * x)
            : ease('beginAndEndGently', 2 - 2 * x)
          : p;
      body.reach =
        a.then === 'touch' && !going ? null : { target: a.target, hand: a.hand, weight: w };
      return;
    }
    case 'pickUp': {
      const thing = others.get(a.target);
      if (going)
        body.layers.push({
          clip: 'pickUp',
          time: x * a.length,
          weight: faded(elapsed, duration),
          whole: true,
          own: false,
        });
      if (x < 0.5) {
        body.reach = { target: a.target, hand: a.hand, weight: ease('beginAndEndGently', 2 * x) };
        return;
      }
      if (body.reach?.target === a.target) body.reach = null;
      if (!body.holding.some((h) => h.object === a.target))
        body.holding.push({ object: a.target, hand: a.hand });
      if (thing) {
        const held = lerpPose(
          a.grab,
          a.carry,
          ease('beginAndEndGently', Math.min(1, (x - 0.5) * 2)),
        );
        thing.vehicle = c.object;
        thing.position = held.position;
        thing.rotation = held.rotation;
      }
      return;
    }
    case 'putDown': {
      if (!a.held) return;
      const thing = others.get(a.target);
      if (going)
        body.layers.push({
          clip: 'pickUp',
          time: x * a.length,
          weight: faded(elapsed, duration),
          whole: true,
          own: false,
        });
      if (x < 0.5) {
        if (thing) {
          const held = lerpPose(a.from, a.placeHeld, ease('beginAndEndGently', 2 * x));
          thing.position = held.position;
          thing.rotation = held.rotation;
        }
        return;
      }
      body.holding = body.holding.filter((h) => h.object !== a.target);
      if (going)
        body.reach = {
          target: a.place.position,
          hand: null,
          weight: 1 - ease('beginAndEndGently', 2 * x - 1),
        };
      else if (body.reach && body.reach.target === a.place.position) body.reach = null;
      if (thing && thing.vehicle === c.object) {
        thing.vehicle = null;
        thing.position = a.place.position;
        thing.rotation = a.place.rotation;
      }
      return;
    }
    case 'clip':
    case 'gesture':
      if (going)
        body.layers.push({
          clip: a.clip,
          time: x * a.length,
          weight: faded(elapsed, duration),
          whole: a.kind === 'clip',
          own: a.kind === 'clip' && a.own,
        });
      return;
    case 'expression':
      if (a.expression === 'blink') body.blink = going ? (x < 0.5 ? 2 * x : 2 - 2 * x) : 0;
      else body.face = { expression: a.expression, amount: p };
      return;
    case 'lookAt':
      if (a.target) body.look = { target: a.target, weight: p };
      else if (a.previous && going) body.look = { target: a.previous, weight: 1 - p };
      else body.look = null;
      return;
  }
}

/** What a character shows at a moment: its humanoid pose, its own clips, and its face. */
export interface Shown {
  readonly human: HumanPose | null;
  readonly own: readonly { name: string; time: number; weight: number }[];
  readonly face: { expression: string; amount: number } | null;
  readonly blink: number;
}

const REST_CLIP: Record<Rest, string> = {
  stand: 'idle',
  sit: 'sitting',
  sitFloor: 'sittingOnFloor',
  lie: 'lying',
};

/** A humanoid's pose at a moment, from what its body is doing. */
export function bodyPose(
  world: World,
  state: unknown,
  object: ObjectId,
  s: { body: BodyState | null; scale: Vec3 },
  t: Micros,
): Shown {
  const b = s.body ?? freshBody();
  const own = b.layers
    .filter((l) => l.own)
    .map((l) => ({ name: l.clip, time: l.time, weight: l.weight }));
  const shape = world.body(object);
  const library = world.library;
  if (!shape || !library) return { human: null, own, face: b.face, blink: b.blink };
  const rest = library.get(REST_CLIP[b.rest])!;
  let pose = sample(rest, (t - b.restSince) / SECOND, true);
  for (const layer of b.layers) {
    if (layer.own) continue;
    const clip = library.get(layer.clip);
    if (clip) pose = overlay(pose, sample(clip, layer.time, clip.loop), layer.weight, layer.whole);
  }
  if (!b.seated) pose = shape.ground(pose);
  const here = world.pose(state, object);
  const model = (p: Vec3) => toModel(here, s.scale, p);
  const scene = (p: Vec3) =>
    add(here.position, rotate(here.rotation, v(p.x * s.scale.x, p.y * s.scale.y, p.z * s.scale.z)));
  const reaching = new Set<Hand>();
  if (b.reach && b.reach.weight > 0) {
    const hand0 = b.reach.hand ?? 'right';
    const point = pointOf(world, state, b.reach.target, scene(shape.hand(pose, hand0)));
    const hand = b.reach.hand ?? shape.nearerHand(model(point));
    pose = shape.reach(pose, hand, model(point), b.reach.weight);
    reaching.add(hand);
  }
  for (const held of b.holding) {
    const hand = held.hand ?? 'right';
    if (reaching.has(hand)) continue;
    const box = world.box(state, held.object);
    pose = shape.reach(pose, hand, model(centre(box)), 1);
    reaching.add(hand);
  }
  if (b.look && b.look.weight > 0) {
    const box = world.isObject(b.look.target) ? world.box(state, b.look.target) : null;
    const point = box
      ? v(
          (box.min.x + box.max.x) / 2,
          box.min.y + 0.85 * (box.max.y - box.min.y),
          (box.min.z + box.max.z) / 2,
        )
      : world.targetPose(state, b.look.target).position;
    pose = shape.look(pose, model(point), b.look.weight, LOOK_LIMIT);
  }
  return { human: pose, own, face: b.face, blink: b.blink };
}
