/**
 * WP4.3: the Story API's procedures and functions, one for each block the stage runs (the
 * catalog's `command:` and `query:` entries). A procedure sends one stage command and waits for
 * it to finish, as Alice's do; "do together" is the runtime's. A function asks the stage.
 *
 * Details left out take Alice's defaults (`DETAILS`). Units are spec 02's: metres, turns and
 * seconds. A joint (the runtime's `getJoint`, a `JointValue`) turns, rolls and points with the
 * stage's `joint` command, and can be a target; anything else on a joint is a fault (decision 0051).
 */
import { MOVE_AXES, ROLL_AXES, TURN_AXES } from '../catalog/axes.ts';
import { DETAILS } from '../catalog/details.ts';
import type { ENUMS } from '../catalog/types.ts';
import type {
  BubbleLook,
  Look,
  SceneLook,
  StageCommand,
  StageQuery,
  StageQueryResult,
  Target,
} from '../stage-commands.ts';
import {
  CAMERA,
  SCENE,
  micros,
  type AnimationStyle,
  type JointName,
  type ObjectId,
  type Quat,
  type Transform,
  type Vec3,
} from '../vocabulary.ts';
import { COLOR_BYTES, colorName } from './colours.ts';
import {
  StoryFault,
  type EnumValue,
  type JointValue,
  type ObjectValue,
  type StoryCall,
  type StoryContext,
  type StoryFunction,
  type StoryLibrary,
  type StoryWait,
  type Value,
} from './types.ts';

type EnumName = keyof typeof ENUMS;
type EnumOf<K extends EnumName> = (typeof ENUMS)[K][number];
type WithoutTiming<T> = T extends unknown ? Omit<T, 'seq' | 'start'> : never;
/** A stage command as a block sends it: the runtime adds `seq` and `start`. */
type Command = WithoutTiming<StageCommand>;
type Block = Generator<StoryWait, Value, unknown>;

// ---- Reading a call's values -------------------------------------------------------------

const isObject = (v: Value): v is ObjectValue =>
  typeof v === 'object' && v !== null && !Array.isArray(v) && v.kind === 'object';
const isEnum = (v: Value): v is EnumValue =>
  typeof v === 'object' && v !== null && !Array.isArray(v) && v.kind === 'enum';
const isJoint = (v: Value | undefined): v is JointValue =>
  typeof v === 'object' && v !== null && !Array.isArray(v) && v.kind === 'joint';

function number(v: Value | undefined, what: string): number {
  if (typeof v !== 'number' || !Number.isFinite(v))
    throw new StoryFault(`${what} must be a number.`);
  return v;
}
function positive(v: Value | undefined, what: string): number {
  const n = number(v, what);
  if (!(n > 0)) throw new StoryFault(`${what} must be more than 0.`);
  return n;
}
function portion(v: Value | undefined, what: string): number {
  const n = number(v, what);
  if (!(n >= 0 && n <= 1)) throw new StoryFault(`${what} must be from 0 to 1.`);
  return n;
}
function object(v: Value | undefined, what: string): ObjectId {
  if (isJoint(v))
    throw new StoryFault(`${what} is a joint, which can turn, roll and point, but not do this.`);
  if (v === undefined || !isObject(v)) throw new StoryFault(`${what} must be an object.`);
  return v.id as ObjectId;
}
/** Something to go to, face or measure from: an object, a marker or a joint. */
function thing(v: Value | undefined, what: string): Target {
  if (isJoint(v)) return { object: v.object as ObjectId, joint: v.joint as JointName };
  return object(v, what);
}
function words(v: Value | undefined, what: string): string {
  if (typeof v !== 'string') throw new StoryFault(`${what} must be words.`);
  return v;
}
function choice<K extends EnumName>(type: K, v: Value | undefined, what: string): EnumOf<K> {
  if (v === undefined || !isEnum(v) || v.type !== type)
    throw new StoryFault(`${what} must be a ${type}.`);
  return v.value as EnumOf<K>;
}
/** A `Color`, or a paint given as words (`#rrggbb`, or a Backstage surface); the stage checks it. */
function paint(v: Value | undefined, what: string): string {
  if (typeof v === 'string') return v;
  return choice('Color', v, what);
}

/** A detail, or its default. */
const detail = (call: StoryCall, name: string): Value | undefined =>
  call.details[name] ?? (DETAILS[name]?.default as Value | undefined) ?? undefined;
const enumDetail = <K extends EnumName>(call: StoryCall, name: string, type: K): EnumOf<K> => {
  const v = detail(call, name);
  return typeof v === 'string' ? (v as EnumOf<K>) : choice(type, v, name);
};

/** The object the block is called on: the scene's blocks are on `SCENE`. */
const self = (call: StoryCall) => object(call.target, 'The object');

/** A block's timing details: `duration` (seconds, 0 or more) and `animationStyle`. */
function timing(call: StoryCall) {
  const seconds = number(detail(call, 'duration'), 'duration');
  if (seconds < 0) throw new StoryFault('duration must be 0 or more.');
  return {
    duration: micros(seconds),
    style: enumDetail(call, 'animationStyle', 'AnimationStyle') as AnimationStyle,
  };
}

/** `asSeenBy`: another object's axes, or the object's own. */
function space(call: StoryCall) {
  const by = call.details.asSeenBy;
  return by === undefined ? ('self' as const) : { asSeenBy: object(by, 'asSeenBy') };
}

/** The path style details, left out of the command when it's the default straight line. */
function path(call: StoryCall) {
  const style = enumDetail(call, 'pathStyle', 'PathStyle');
  return style === 'beeLine' ? {} : { pathStyle: style };
}

// ---- Running a block -----------------------------------------------------------------------

/** Sends one command and waits for it to finish, as the next statement does in Alice. */
function* perform(context: StoryContext, command: Command): Block {
  context.emit(command);
  if (command.duration > 0) yield { kind: 'sleep', duration: command.duration };
  return null;
}

function* ask(query: StageQuery): Generator<StoryWait, StageQueryResult, unknown> {
  return (yield { kind: 'ask', query }) as StageQueryResult;
}

const objectValue = (id: string): ObjectValue => ({ kind: 'object', id, type: null });
const enumValue = (type: string, value: string): EnumValue => ({ kind: 'enum', type, value });

/** A colour as a program has it: one of Alice's names if it is one, otherwise `#rrggbb`. */
function colourValue(rrggbb: string): Value {
  const name = colorName(rrggbb);
  return name ? enumValue('Color', name) : rrggbb;
}

/** A paint as a program has it. A model's own paint is white, as in Alice. */
function paintValue(paint: string | null): Value {
  if (paint === null) return enumValue('Color', 'white');
  if (paint in COLOR_BYTES) return enumValue('Color', paint);
  return paint.startsWith('#') ? colourValue(paint) : paint;
}

/** A procedure: works out its command, then performs it. */
const procedure =
  (make: (call: StoryCall) => Command): StoryFunction =>
  (call, context) =>
    perform(context, make(call));

/** A command without its timing: what a character action is before the stage says how long. */
type Untimed = Command extends infer C
  ? C extends Command
    ? Omit<C, 'duration' | 'style'>
    : never
  : never;

/**
 * A character action (WP4c): it has no duration detail, so it asks the stage how long it takes
 * at its own pace (`naturalDuration`), then performs it over that time.
 */
const action = (make: (call: StoryCall) => Untimed): StoryFunction =>
  function* (call, context) {
    const untimed = make(call);
    const own = (yield* ask({ kind: 'naturalDuration', action: untimed, at: context.now }))
      .value as number;
    return yield* perform(context, {
      ...untimed,
      duration: own,
      style: 'beginAndEndGently',
    } as Command);
  };

/**
 * `turn` and `roll`: an object turns in the axes `asSeenBy` gives, and a joint turns in its own
 * (the stage's `joint` command), as Alice's joints do.
 */
function turning(call: StoryCall, axis: Vec3): Command {
  const turns = number(call.args.amount, 'amount');
  if (isJoint(call.target))
    return {
      object: call.target.object as ObjectId,
      kind: 'joint',
      joint: call.target.joint as JointName,
      axis,
      turns,
      ...timing(call),
    };
  return { object: self(call), kind: 'rotate', axis, turns, space: space(call), ...timing(call) };
}

// ---- Where things are, for the "is above" family -------------------------------------------

const sub = (a: Vec3, b: Vec3): Vec3 => ({ x: a.x - b.x, y: a.y - b.y, z: a.z - b.z });
const add = (a: Vec3, b: Vec3): Vec3 => ({ x: a.x + b.x, y: a.y + b.y, z: a.z + b.z });
function rotate(q: Quat, p: Vec3): Vec3 {
  const ix = q.w * p.x + q.y * p.z - q.z * p.y;
  const iy = q.w * p.y + q.z * p.x - q.x * p.z;
  const iz = q.w * p.z + q.x * p.y - q.y * p.x;
  const iw = -q.x * p.x - q.y * p.y - q.z * p.z;
  return {
    x: ix * q.w + iw * -q.x + iy * -q.z - iz * -q.y,
    y: iy * q.w + iw * -q.y + iz * -q.x - ix * -q.z,
    z: iz * q.w + iw * -q.z + ix * -q.y - iy * -q.x,
  };
}
const back = (q: Quat): Quat => ({ x: -q.x, y: -q.y, z: -q.z, w: q.w });

interface Bounds {
  readonly min: Vec3;
  readonly max: Vec3;
}

/**
 * An object's box in another object's axes (`frame`), from its position, turn and size. The
 * stage reports a size, not where the box sits, so a model is taken to stand centred on its own
 * origin, as Backstage's models do.
 */
function* boundsIn(
  id: ObjectId,
  frame: Transform,
  now: number,
): Generator<StoryWait, Bounds, unknown> {
  const where = (yield* ask({ kind: 'transform', object: id, at: now })).value as Transform;
  const size = (yield* ask({ kind: 'size', object: id, at: now })).value as Vec3;
  const corners: Vec3[] = [];
  for (const x of [-size.x / 2, size.x / 2])
    for (const y of [0, size.y])
      for (const z of [-size.z / 2, size.z / 2]) {
        const inScene = add(where.position, rotate(where.rotation, { x, y, z }));
        corners.push(rotate(back(frame.rotation), sub(inScene, frame.position)));
      }
  const min = (axis: keyof Vec3) => Math.min(...corners.map((c) => c[axis]));
  const max = (axis: keyof Vec3) => Math.max(...corners.map((c) => c[axis]));
  return {
    min: { x: min('x'), y: min('y'), z: min('z') },
    max: { x: max('x'), y: max('y'), z: max('z') },
  };
}

const SCENE_FRAME: Transform = {
  position: { x: 0, y: 0, z: 0 },
  rotation: { x: 0, y: 0, z: 0, w: 1 },
  scale: { x: 1, y: 1, z: 1 },
};

/** How far the gap is from one box to the other along a side; Alice counts under 1 cm as 0. */
type Side = (mine: Bounds, theirs: Bounds) => number;
const SIDES: Readonly<Record<string, { side: Side; frame: 'scene' | 'other' }>> = {
  Above: { side: (m, t) => m.min.y - t.max.y, frame: 'scene' },
  Below: { side: (m, t) => t.min.y - m.max.y, frame: 'scene' },
  // Left is +X and forward +Z here (spec 02, Directions).
  ToTheLeftOf: { side: (m, t) => m.min.x - t.max.x, frame: 'other' },
  ToTheRightOf: { side: (m, t) => t.min.x - m.max.x, frame: 'other' },
  InFrontOf: { side: (m, t) => m.min.z - t.max.z, frame: 'other' },
  Behind: { side: (m, t) => t.min.z - m.max.z, frame: 'other' },
};

function* gap(
  call: StoryCall,
  context: StoryContext,
  which: string,
): Generator<StoryWait, number, unknown> {
  const { side, frame } = SIDES[which]!;
  const mine = self(call);
  const other = object(call.args.other, 'other');
  const by = call.details.asSeenBy;
  const frameId = by !== undefined ? object(by, 'asSeenBy') : frame === 'other' ? other : null;
  const axes = frameId
    ? ((yield* ask({ kind: 'transform', object: frameId, at: context.now })).value as Transform)
    : SCENE_FRAME;
  const distance = side(
    yield* boundsIn(mine, axes, context.now),
    yield* boundsIn(other, axes, context.now),
  );
  return Math.abs(distance) < 0.01 ? 0 : distance;
}

/** `getDistanceAbove` and `isAbove`, and the rest of the family. */
function sideBlocks(): Record<string, StoryFunction> {
  const out: Record<string, StoryFunction> = {};
  for (const which of Object.keys(SIDES)) {
    out[`getDistance${which}`] = function* (call, context) {
      return yield* gap(call, context, which);
    };
    out[`is${which}`] = function* (call, context) {
      return (yield* gap(call, context, which)) > 0;
    };
  }
  return out;
}

// ---- The blocks ----------------------------------------------------------------------------

const dimensions = ['Width', 'Height', 'Depth'] as const;
const AXIS = { Width: 'x', Height: 'y', Depth: 'z' } as const;

function resizeFactor(call: StoryCall, dimension: (typeof dimensions)[number]): Vec3 {
  const f = positive(call.args.factor, 'factor');
  const keep = detail(call, 'isVolumePreserved');
  const others = keep === false ? 1 : 1 / Math.sqrt(f);
  return { x: others, y: others, z: others, [AXIS[dimension]]: f } as Vec3;
}

function bubble(call: StoryCall): BubbleLook {
  return {
    position: enumDetail(call, 'bubblePosition', 'BubblePosition'),
    textScale: positive(detail(call, 'textScale'), 'textScale'),
    textStyle: enumDetail(call, 'textStyle', 'TextStyle'),
    font: enumDetail(call, 'fontType', 'TextFont'),
    textColour: enumDetail(call, 'fontColor', 'Color'),
    fillColour: enumDetail(call, 'bubbleFillColor', 'Color'),
    outlineColour: enumDetail(call, 'bubbleOutlineColor', 'Color'),
  };
}

const say = (bubbleKind: 'say' | 'think') =>
  procedure((call) => ({
    object: self(call),
    kind: 'say',
    text: words(call.args.text, 'text'),
    bubble: bubbleKind,
    look: bubble(call),
    ...timing(call),
  }));

const up = (call: StoryCall) => {
  const by = call.details.upAsSeenBy;
  return by === undefined ? {} : { up: object(by, 'upAsSeenBy') as Target };
};

const sceneColour = (part: 'atmosphere' | 'above' | 'below') =>
  procedure((call) => {
    const colour = choice('Color', call.args.color, 'color');
    const common = { object: SCENE, ...timing(call) };
    return part === 'atmosphere'
      ? { ...common, kind: 'atmosphere', colour }
      : { ...common, kind: 'light', from: part, colour };
  });

function* lookOf(call: StoryCall, context: StoryContext): Generator<StoryWait, Look, unknown> {
  return (yield* ask({ kind: 'look', object: self(call), at: context.now })).value as Look;
}
function* skyOf(context: StoryContext): Generator<StoryWait, SceneLook, unknown> {
  return (yield* ask({ kind: 'sceneLook', at: context.now })).value as SceneLook;
}

export const STORY_LIBRARY: StoryLibrary = {
  // Moving and turning
  move: procedure((call) => {
    const way = MOVE_AXES[choice('MoveDirection', call.args.direction, 'direction')];
    const amount = number(call.args.amount, 'amount');
    const by = { x: way.x * amount, y: way.y * amount, z: way.z * amount };
    return { object: self(call), kind: 'translate', by, space: space(call), ...timing(call) };
  }),
  turn: procedure((call) =>
    turning(call, TURN_AXES[choice('TurnDirection', call.args.direction, 'direction')]),
  ),
  roll: procedure((call) =>
    turning(call, ROLL_AXES[choice('RollDirection', call.args.direction, 'direction')]),
  ),
  turnToFace: procedure((call) => ({
    object: self(call),
    kind: 'turnToFace',
    target: thing(call.args.target, 'target'),
    ...timing(call),
  })),
  orientToUpright: procedure((call) => ({
    object: self(call),
    kind: 'orient',
    to: 'upright',
    ...up(call),
    ...timing(call),
  })),
  pointAt: function* (call, context) {
    if (!isJoint(call.target))
      return yield* perform(context, {
        object: self(call),
        kind: 'orient',
        to: { pointAt: thing(call.args.target, 'target') },
        ...up(call),
        ...timing(call),
      });
    // A joint points by turning, from the way it faces now (+Z in its own axes) to the target.
    const joint = call.target;
    const at = { object: joint.object as ObjectId, joint: joint.joint as JointName };
    const me = (yield* ask({ kind: 'transform', object: at, at: context.now })).value as Transform;
    const there = thing(call.args.target, 'target');
    const them = (yield* ask({ kind: 'transform', object: there, at: context.now }))
      .value as Transform;
    const d = rotate(back(me.rotation), sub(them.position, me.position));
    const n = Math.hypot(d.x, d.y, d.z);
    // The turn from +Z to `d`: about +Z × d, by the angle between them.
    const axis = { x: -d.y, y: d.x, z: 0 };
    const a = Math.hypot(axis.x, axis.y);
    const turns = n > 0 && a > 1e-9 ? Math.atan2(a, d.z) / (2 * Math.PI) : 0;
    return yield* perform(context, {
      object: at.object,
      kind: 'joint',
      joint: at.joint,
      axis: a > 1e-9 ? { x: axis.x / a, y: axis.y / a, z: 0 } : { x: 0, y: 1, z: 0 },
      turns,
      ...timing(call),
    });
  },
  orientTo: procedure((call) => ({
    object: self(call),
    kind: 'orient',
    to: { lineUpWith: thing(call.args.target, 'target') },
    ...timing(call),
  })),
  moveToward: procedure((call) => ({
    object: self(call),
    kind: 'moveToward',
    target: thing(call.args.target, 'target'),
    amount: number(call.args.amount, 'amount'),
    ...timing(call),
  })),
  moveAwayFrom: procedure((call) => ({
    object: self(call),
    kind: 'moveToward',
    target: thing(call.args.target, 'target'),
    amount: -number(call.args.amount, 'amount'),
    ...timing(call),
  })),
  moveTo: procedure((call) => ({
    object: self(call),
    kind: 'moveTo',
    target: thing(call.args.target, 'target'),
    ...path(call),
    ...timing(call),
  })),
  moveAndOrientTo: procedure((call) => ({
    object: self(call),
    kind: 'moveAndOrientTo',
    target: thing(call.args.target, 'target'),
    ...path(call),
    ...timing(call),
  })),
  moveAndOrientToAGoodVantagePointOf: procedure((call) => ({
    object: self(call),
    kind: 'moveAndOrientTo',
    target: object(call.args.entity, 'entity'),
    goodView: true,
    ...timing(call),
  })),
  place: procedure((call) => ({
    object: self(call),
    kind: 'place',
    relation: choice('SpatialRelation', call.args.spatialRelation, 'spatialRelation'),
    target: thing(call.args.target, 'target'),
    gap: number(detail(call, 'alongAxisOffset'), 'alongAxisOffset'),
    ...path(call),
    ...timing(call),
  })),
  setVehicle: procedure((call) => {
    const vehicle = object(call.args.vehicle, 'vehicle');
    const onto = vehicle === SCENE ? null : vehicle;
    return {
      object: self(call),
      kind: 'vehicle',
      vehicle: onto,
      duration: 0,
      style: 'beginAndEndGently',
    };
  }),

  // Size
  resize: procedure((call) => {
    const f = positive(call.args.factor, 'factor');
    return { object: self(call), kind: 'resize', factor: { x: f, y: f, z: f }, ...timing(call) };
  }),
  ...Object.fromEntries(
    dimensions.flatMap((dimension) => [
      [
        `resize${dimension}`,
        procedure((call) => ({
          object: self(call),
          kind: 'resize',
          factor: resizeFactor(call, dimension),
          ...timing(call),
        })),
      ],
      [
        `set${dimension}`,
        procedure((call) => ({
          object: self(call),
          kind: 'setSize',
          dimension: dimension.toLowerCase() as 'width' | 'height' | 'depth',
          to: positive(call.args[dimension.toLowerCase()], dimension.toLowerCase()),
          policy: enumDetail(call, 'policy', 'SetDimensionPolicy'),
          ...timing(call),
        })),
      ],
      [
        `get${dimension}`,
        function* (call: StoryCall, context: StoryContext): Block {
          const size = yield* ask({ kind: 'size', object: self(call), at: context.now });
          return (size.value as Vec3)[AXIS[dimension]];
        },
      ],
    ]),
  ),

  // Looks
  setPaint: procedure((call) => ({
    object: self(call),
    kind: 'paint',
    paint: paint(call.args.paint, 'paint'),
    ...timing(call),
  })),
  setOpacity: procedure((call) => ({
    object: self(call),
    kind: 'opacity',
    to: portion(call.args.opacity, 'opacity'),
    ...timing(call),
  })),
  setBackPaint: procedure((call) => ({
    object: self(call),
    kind: 'backPaint',
    paint: paint(call.args.paint, 'paint'),
    ...timing(call),
  })),
  setValue: procedure((call) => ({
    object: self(call),
    kind: 'text',
    text: words(call.args.text, 'text'),
    duration: 0,
    style: 'beginAndEndGently',
  })),
  say: say('say'),
  think: say('think'),
  straightenOutJoints: procedure((call) => ({
    object: self(call),
    kind: 'pose',
    pose: 'straight',
    ...timing(call),
  })),
  foldWings: procedure((call) => ({
    object: self(call),
    kind: 'pose',
    pose: 'wingsFolded',
    ...timing(call),
  })),
  spreadWings: procedure((call) => ({
    object: self(call),
    kind: 'pose',
    pose: 'wingsSpread',
    ...timing(call),
  })),
  *getPaint(call, context) {
    return paintValue((yield* lookOf(call, context)).paint);
  },
  *getOpacity(call, context) {
    return (yield* lookOf(call, context)).opacity;
  },
  *getBackPaint(call, context) {
    return paintValue((yield* lookOf(call, context)).backPaint);
  },
  *getValue(call, context) {
    return (yield* lookOf(call, context)).text ?? '';
  },

  // The scene
  setAtmosphereColor: sceneColour('atmosphere'),
  setFromAboveLightColor: sceneColour('above'),
  setFromBelowLightColor: sceneColour('below'),
  setFogDensity: procedure((call) => ({
    object: SCENE,
    kind: 'fog',
    density: portion(call.args.density, 'density'),
    ...timing(call),
  })),
  // 4.4. Scene changes (goToScene, crossfade, fadeToBlack) end the scene in the runtime, and the
  // production's player makes the transition (spec 02, section 9, rule 8): none is the stage's.
  *getAtmosphereColor(_call, context) {
    return colourValue((yield* skyOf(context)).atmosphere);
  },
  *getFromAboveLightColor(_call, context) {
    return colourValue((yield* skyOf(context)).fromAbove);
  },
  *getFromBelowLightColor(_call, context) {
    return colourValue((yield* skyOf(context)).fromBelow);
  },
  *getFogDensity(_call, context) {
    return (yield* skyOf(context)).fog;
  },

  // The camera
  // Alice changes the angle at once, and gives it in turns.
  setVerticalViewingAngle: procedure((call) => ({
    object: CAMERA,
    kind: 'lens',
    verticalAngle: positive(call.args.angle, 'angle'),
    duration: 0,
    style: 'beginAndEndGently',
  })),
  *getVerticalViewingAngle(_call, context) {
    return (yield* ask({ kind: 'lens', at: context.now })).value as number;
  },
  frameShot: procedure((call) => {
    const targets = call.args.targets;
    if (!Array.isArray(targets) || targets.length === 0)
      throw new StoryFault('targets must be a list of objects.');
    return {
      object: self(call),
      kind: 'shot',
      shot: choice('ShotType', call.args.shot, 'shot'),
      targets: targets.map((t) => object(t, 'targets')),
      ...timing(call),
    };
  }),

  // Questions
  *isCollidingWith(call, context) {
    const q = {
      kind: 'isColliding',
      a: self(call),
      b: object(call.args.other, 'other'),
      at: context.now,
    } as const;
    return (yield* ask(q)).value as boolean;
  },
  *getDistanceTo(call, context) {
    const q = {
      kind: 'distance',
      from: self(call),
      to: object(call.args.other, 'other'),
      at: context.now,
    } as const;
    return (yield* ask(q)).value as number;
  },
  *getVehicle(call, context) {
    const vehicle = (yield* ask({ kind: 'vehicle', object: self(call), at: context.now }))
      .value as ObjectId | null;
    return objectValue(vehicle ?? SCENE);
  },
  *isFacing(call, context) {
    const me = (yield* ask({ kind: 'transform', object: self(call), at: context.now }))
      .value as Transform;
    const other = object(call.args.other, 'other');
    const them = (yield* ask({ kind: 'transform', object: other, at: context.now }))
      .value as Transform;
    // In my own axes, is it in front of me? Alice's test, with forward +Z (spec 02, Directions).
    return rotate(back(me.rotation), sub(them.position, me.position)).z > 0;
  },
  ...sideBlocks(),

  // Character actions (4.5) and faces (4.6), each at its own pace.
  playAnimation: action((call) => ({
    object: self(call),
    kind: 'clip',
    clip: words(call.args.clip, 'clip'),
  })),
  walkTo: action((call) => ({
    object: self(call),
    kind: 'walk',
    to: thing(call.args.target, 'target'),
    gait: 'walk',
  })),
  runTo: action((call) => ({
    object: self(call),
    kind: 'walk',
    to: thing(call.args.target, 'target'),
    gait: 'run',
  })),
  sitOn: action((call) => ({
    object: self(call),
    kind: 'posture',
    posture: 'sit',
    on: thing(call.args.target, 'target'),
  })),
  standUp: action((call) => ({ object: self(call), kind: 'posture', posture: 'stand' })),
  lieDown: action((call) => ({ object: self(call), kind: 'posture', posture: 'lie' })),
  fall: action((call) => ({ object: self(call), kind: 'posture', posture: 'fall' })),
  touch: action((call) => ({
    object: self(call),
    kind: 'reach',
    target: thing(call.args.target, 'target'),
    then: 'touch',
  })),
  reachFor: action((call) => ({
    object: self(call),
    kind: 'reach',
    target: thing(call.args.target, 'target'),
    then: 'stay',
  })),
  pickUp: action((call) => ({
    object: self(call),
    kind: 'pickUp',
    target: object(call.args.target, 'target'),
  })),
  putDown: action((call) => ({
    object: self(call),
    kind: 'putDown',
    target: object(call.args.target, 'target'),
  })),
  enterFrom: action((call) => ({
    object: self(call),
    kind: 'enter',
    from: choice('SceneEdge', call.args.edge, 'edge'),
    gait: 'walk',
  })),
  exitTo: action((call) => ({
    object: self(call),
    kind: 'walk',
    to: { edge: choice('SceneEdge', call.args.edge, 'edge') },
    gait: 'walk',
  })),
  gesture: action((call) => ({
    object: self(call),
    kind: 'gesture',
    gesture: choice('Gesture', call.args.gesture, 'gesture'),
  })),
  showExpression: action((call) => ({
    object: self(call),
    kind: 'expression',
    expression: choice('Expression', call.args.expression, 'expression'),
  })),
  lookAt: action((call) => ({
    object: self(call),
    kind: 'lookAt',
    target: thing(call.args.target, 'target'),
  })),
};
