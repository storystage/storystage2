/**
 * WP4's done-when: every procedure and function of the Story API runs on every class it belongs
 * to, against the stage, and the scene ends as it should. The driver here does what the runtime
 * does with a block: schedule each command at the current time, move time on for each wait, and
 * answer each question from the stage.
 */
import {
  CAMERA,
  IDENTITY,
  SCENE,
  STORY_LIBRARY,
  StageError,
  entriesOf,
  jointName,
  micros,
  objectId,
  type ApiClass,
  type Look,
  type ObjectId,
  type SceneLook,
  type SceneSetup,
  type StageCommand,
  type StoryClass,
  type StoryContext,
  type StoryCall,
  type Transform,
  type Value,
} from '@storystage/story-api';
import { describe, expect, it } from 'vitest';
import type { Stage } from './contract.ts';
import { heading, rotate } from './math.ts';
import { FakeStage } from './testing/fake-stage.ts';

const it_ = objectId('it');
const other = objectId('other');
const obj = (id: string): Value => ({ kind: 'object', id, type: null });
const choice = (type: string, value: string): Value => ({ kind: 'enum', type, value });

const setup = (cls: StoryClass): SceneSetup => ({
  backdrop: {},
  objects: [
    { id: it_, model: { standIn: 'it' }, class: cls, transform: IDENTITY },
    // Two metres to the left of `it` (left is +X, spec 02, Directions).
    {
      id: other,
      model: { standIn: 'other' },
      class: 'Prop',
      transform: { ...IDENTITY, position: { x: 2, y: 0, z: 0 } },
    },
  ],
  camera: { transform: { ...IDENTITY, position: { x: 0, y: 1, z: -8 } } },
  markers: [],
});

/** `seq` is unique and increasing across a run, as the runtime's is. */
let seq = 0;

/** Runs one block as the runtime would, from the stage's time, and leaves the stage at its end. */
function drive(
  stage: Stage,
  name: string,
  /** What the block is called on: an object, or a joint value. */
  target: ObjectId | Value,
  args: Record<string, Value>,
  details: Record<string, Value> = {},
): Value {
  let now = stage.time();
  const context: StoryContext = {
    get now() {
      return now;
    },
    emit: (command) => stage.schedule([{ ...command, seq: seq++, start: now } as StageCommand]),
    random: () => 0,
  };
  const steps = STORY_LIBRARY[name]!(
    {
      node: 'n' as StoryCall['node'],
      target: typeof target === 'string' ? obj(target) : target,
      name,
      args,
      details,
    },
    context,
  );
  let input: unknown;
  for (;;) {
    const step = steps.next(input);
    if (step.done) {
      stage.seek(now);
      return step.value;
    }
    input = undefined;
    if (step.value.kind === 'sleep') now += step.value.duration;
    else input = stage.answer(step.value.query);
  }
}

const close = (a: number, b: number) => expect(a).toBeCloseTo(b, 5);
const where = (stage: Stage) => stage.transform(it_);
const look = (stage: Stage) =>
  stage.answer({ kind: 'look', object: it_, at: stage.time() }).value as Look;
const sky = (stage: Stage) =>
  stage.answer({ kind: 'sceneLook', at: stage.time() }).value as SceneLook;

interface Case {
  readonly args?: Record<string, Value>;
  readonly details?: Record<string, Value>;
  /** What the scene, or the answer, should be at the end. */
  readonly check: (stage: Stage, value: Value) => void;
}

/** A case for every block on a model, with `it` at the origin facing +Z and `other` at its left. */
const MODEL_CASES: Readonly<Record<string, Case>> = {
  // Character actions (WP4c), each at its own pace. On the fake stage everything is a stand-in,
  // with no body to pose, so these check where it goes and what it holds.
  // The other block is 0.25 m wide each side of x = 2; a walker stops a step (0.35 m) short.
  walkTo: {
    args: { target: obj(other) },
    check: (s) => {
      close(where(s).position.x, 1.4);
      close(heading(where(s).rotation), 0.25);
    },
  },
  runTo: { args: { target: obj(other) }, check: (s) => close(where(s).position.x, 1.4) },
  // A block a metre tall is taken to be a chair, with its seat a little under half way up.
  sitOn: { args: { target: obj(other) }, check: (s) => close(where(s).position.y, 0.45) },
  standUp: { check: (s) => close(where(s).position.y, 0) },
  lieDown: { check: (s) => close(where(s).position.x, 0) },
  fall: { check: (s) => close(where(s).position.x, 0) },
  touch: { args: { target: obj(other) }, check: (s) => close(where(s).position.x, 0) },
  reachFor: { args: { target: obj(other) }, check: (s) => close(where(s).position.x, 0) },
  pickUp: {
    args: { target: obj(other) },
    check: (s) =>
      expect(s.answer({ kind: 'vehicle', object: other, at: s.time() }).value).toBe(it_),
  },
  // Putting down what it isn't holding does nothing.
  putDown: { args: { target: obj(other) }, check: (s) => close(s.transform(other).position.x, 2) },
  enterFrom: {
    args: { edge: choice('SceneEdge', 'right') },
    check: (s) => close(where(s).position.x, 0),
  },
  exitTo: {
    args: { edge: choice('SceneEdge', 'left') },
    check: (s) => expect(where(s).position.x).toBeGreaterThan(4),
  },
  gesture: {
    args: { gesture: choice('Gesture', 'wave') },
    check: (s) => close(where(s).position.x, 0),
  },
  showExpression: {
    args: { expression: choice('Expression', 'happy') },
    check: (s) => close(where(s).position.x, 0),
  },
  lookAt: { args: { target: obj(other) }, check: (s) => close(heading(where(s).rotation), 0) },
  // A shared clip is a humanoid's; anything else plays only its own clips.
  playAnimation: { args: { clip: 'idle' }, check: (s) => close(where(s).position.x, 0) },
  move: {
    args: { direction: choice('MoveDirection', 'left'), amount: 1 },
    check: (s) => close(where(s).position.x, 1),
  },
  turn: {
    args: { direction: choice('TurnDirection', 'left'), amount: 0.25 },
    check: (s) => close(heading(where(s).rotation), 0.25),
  },
  roll: {
    args: { direction: choice('RollDirection', 'right'), amount: 0.25 },
    check: (s) => close(rotate(where(s).rotation, { x: 0, y: 1, z: 0 }).x, -1),
  },
  turnToFace: {
    args: { target: obj(other) },
    check: (s) => close(heading(where(s).rotation), 0.25),
  },
  orientToUpright: { check: (s) => close(Math.abs(where(s).rotation.w), 1) },
  pointAt: { args: { target: obj(other) }, check: (s) => close(heading(where(s).rotation), 0.25) },
  orientTo: { args: { target: obj(other) }, check: (s) => close(Math.abs(where(s).rotation.w), 1) },
  moveToward: {
    args: { target: obj(other), amount: 1 },
    check: (s) => close(where(s).position.x, 1),
  },
  moveAwayFrom: {
    args: { target: obj(other), amount: 1 },
    check: (s) => close(where(s).position.x, -1),
  },
  moveTo: { args: { target: obj(other) }, check: (s) => close(where(s).position.x, 2) },
  moveAndOrientTo: { args: { target: obj(other) }, check: (s) => close(where(s).position.x, 2) },
  // Stand-ins are half a metre wide, so side by side their middles are 2.5 m apart.
  place: {
    args: { spatialRelation: choice('SpatialRelation', 'leftOf'), target: obj(other) },
    check: (s) => close(where(s).position.x, 2.5),
  },
  setVehicle: {
    args: { vehicle: obj(other) },
    check: (s) =>
      expect(s.answer({ kind: 'vehicle', object: it_, at: s.time() }).value).toBe(other),
  },
  resize: { args: { factor: 2 }, check: (s) => close(where(s).scale.y, 2) },
  resizeWidth: {
    args: { factor: 2 },
    check: (s) => {
      close(where(s).scale.x, 2);
      close(where(s).scale.y, Math.SQRT1_2);
    },
  },
  resizeHeight: {
    args: { factor: 2 },
    details: { isVolumePreserved: false },
    check: (s) => close(where(s).scale.y, 2),
  },
  resizeDepth: { args: { factor: 2 }, check: (s) => close(where(s).scale.z, 2) },
  setWidth: { args: { width: 1 }, check: (s) => close(where(s).scale.y, 2) },
  setHeight: { args: { height: 2 }, check: (s) => close(where(s).scale.x, 2) },
  setDepth: {
    args: { depth: 1 },
    details: { policy: choice('SetDimensionPolicy', 'preserveNothing') },
    check: (s) => expect(where(s).scale).toEqual({ x: 1, y: 1, z: 2 }),
  },
  getWidth: { check: (_s, v) => expect(v).toBe(0.5) },
  getHeight: { check: (_s, v) => expect(v).toBe(1) },
  getDepth: { check: (_s, v) => expect(v).toBe(0.5) },
  setPaint: {
    args: { paint: choice('Color', 'red') },
    check: (s) => expect(look(s).paint).toBe('red'),
  },
  setOpacity: { args: { opacity: 0.5 }, check: (s) => close(look(s).opacity, 0.5) },
  getPaint: { check: (_s, v) => expect(v).toEqual(choice('Color', 'white')) },
  getOpacity: { check: (_s, v) => expect(v).toBe(1) },
  say: {
    args: { text: 'Hello' },
    details: { duration: 0 },
    check: (s) => expect(s.speech(it_)).toBeNull(),
  },
  think: {
    args: { text: 'Hmm' },
    // Seen half way through: a bubble shows only while it lasts.
    check: (s) => {
      s.seek(micros(0.5));
      expect(s.speech(it_)).toEqual({ text: 'Hmm', bubble: 'think' });
    },
  },
  speakLine: {
    args: { text: 'Here is the key.' },
    details: { line: 'l7' },
    // Timed by its words (spec 06, 4.2): 2 s, so still showing at 1.5 s, gone after.
    check: (s) => {
      s.seek(micros(1.5));
      expect(s.speech(it_)).toEqual({ text: 'Here is the key.', bubble: 'caption', line: 'l7' });
      s.seek(micros(2.1));
      expect(s.speech(it_)).toBeNull();
    },
  },
  straightenOutJoints: { check: (s) => close(Math.abs(where(s).rotation.w), 1) },
  isCollidingWith: { args: { other: obj(other) }, check: (_s, v) => expect(v).toBe(false) },
  getDistanceTo: { args: { other: obj(other) }, check: (_s, v) => close(v as number, 2) },
  getVehicle: { check: (_s, v) => expect(v).toEqual(obj(SCENE)) },
  isFacing: { args: { other: obj(other) }, check: (_s, v) => expect(v).toBe(false) },
  getDistanceAbove: { args: { other: obj(other) }, check: (_s, v) => close(v as number, -1) },
  isAbove: { args: { other: obj(other) }, check: (_s, v) => expect(v).toBe(false) },
  getDistanceBelow: { args: { other: obj(other) }, check: (_s, v) => close(v as number, -1) },
  isBelow: { args: { other: obj(other) }, check: (_s, v) => expect(v).toBe(false) },
  // `other` is two metres to the left: their boxes are 1.5 m apart.
  getDistanceToTheRightOf: {
    args: { other: obj(other) },
    check: (_s, v) => close(v as number, 1.5),
  },
  isToTheRightOf: { args: { other: obj(other) }, check: (_s, v) => expect(v).toBe(true) },
  getDistanceToTheLeftOf: {
    args: { other: obj(other) },
    check: (_s, v) => close(v as number, -2.5),
  },
  isToTheLeftOf: { args: { other: obj(other) }, check: (_s, v) => expect(v).toBe(false) },
  getDistanceInFrontOf: { args: { other: obj(other) }, check: (_s, v) => close(v as number, -0.5) },
  isInFrontOf: { args: { other: obj(other) }, check: (_s, v) => expect(v).toBe(false) },
  getDistanceBehind: { args: { other: obj(other) }, check: (_s, v) => close(v as number, -0.5) },
  isBehind: { args: { other: obj(other) }, check: (_s, v) => expect(v).toBe(false) },
  setBackPaint: {
    args: { paint: choice('Color', 'blue') },
    check: (s) => expect(look(s).backPaint).toBe('blue'),
  },
  getBackPaint: { check: (_s, v) => expect(v).toEqual(choice('Color', 'white')) },
  setValue: { args: { text: 'THE END' }, check: (s) => expect(look(s).text).toBe('THE END') },
  getValue: { check: (_s, v) => expect(v).toBe('') },
};

/** Blocks the stage doesn't do yet (its README): each is refused, as a fault at the block. */
const NOT_YET = new Set(['foldWings', 'spreadWings']);

const SCENE_CASES: Readonly<Record<string, Case>> = {
  setAtmosphereColor: {
    args: { color: choice('Color', 'black') },
    check: (s) => expect(sky(s).atmosphere).toBe('#000000'),
  },
  setFromAboveLightColor: {
    args: { color: choice('Color', 'yellow') },
    check: (s) => expect(sky(s).fromAbove).toBe('#ffff00'),
  },
  setFromBelowLightColor: {
    args: { color: choice('Color', 'red') },
    check: (s) => expect(sky(s).fromBelow).toBe('#ff0000'),
  },
  setFogDensity: { args: { density: 0.5 }, check: (s) => close(sky(s).fog, 0.5) },
  getAtmosphereColor: { check: (_s, v) => expect(v).toEqual(choice('Color', 'black')) },
  getFromAboveLightColor: { check: (_s, v) => expect(v).toEqual(choice('Color', 'white')) },
  getFromBelowLightColor: { check: (_s, v) => expect(v).toEqual(choice('Color', 'black')) },
  getFogDensity: { check: (_s, v) => expect(v).toBe(0) },
};

const CAMERA_CASES: Readonly<Record<string, Case>> = {
  moveAndOrientToAGoodVantagePointOf: {
    args: { entity: obj(other) },
    check: (s) => {
      const camera = s.transform(CAMERA);
      close(camera.position.x, 2);
      expect(camera.position.z).toBeGreaterThan(0.5);
    },
  },
  setVerticalViewingAngle: {
    args: { angle: 0.1 },
    check: (s) => close(s.answer({ kind: 'lens', at: s.time() }).value as number, 0.1),
  },
  getVerticalViewingAngle: { check: (_s, v) => close(v as number, 0.5 / (2 * Math.PI)) },
  frameShot: {
    args: { shot: choice('ShotType', 'closeUp'), targets: [obj(other)] },
    check: (s) => expect(() => s.stateHash()).not.toThrow(),
  },
};

/** The blocks a class has that the stage runs. */
const staged = (cls: ApiClass) =>
  entriesOf(cls)
    .filter((e) => /^(command|query):/.test(e.runs))
    .map((e) => e.name);

const MODEL_CLASSES: readonly StoryClass[] = [
  'Biped',
  'Quadruped',
  'Flyer',
  'Swimmer',
  'Slitherer',
  'Prop',
  'Transport',
  'Billboard',
  'Text',
];

const ran = new Set<string>();

describe('every Story API block, against the stage', () => {
  for (const cls of MODEL_CLASSES)
    describe(cls, () => {
      for (const name of staged(cls))
        it(name, async () => {
          const stage = new FakeStage();
          await stage.load(setup(cls));
          ran.add(name);
          if (NOT_YET.has(name)) {
            expect(() => drive(stage, name, it_, {})).toThrow(StageError);
            return;
          }
          if (name === 'playAnimation' && cls !== 'Biped') {
            expect(() => drive(stage, name, it_, { clip: 'idle' })).toThrow(/no clip/);
            return;
          }
          const c = MODEL_CASES[name];
          if (!c) throw new Error(`No case for ${name}.`);
          c.check(stage, drive(stage, name, it_, c.args ?? {}, c.details ?? {}));
        });
    });

  for (const [cls, target, cases] of [
    ['Scene', SCENE, SCENE_CASES],
    ['Camera', CAMERA, CAMERA_CASES],
  ] as const)
    describe(cls, () => {
      for (const name of staged(cls).filter((n) => n in cases || !(n in MODEL_CASES)))
        it(name, async () => {
          const stage = new FakeStage();
          await stage.load(setup('Prop'));
          ran.add(name);
          const c = cases[name as keyof typeof cases] as Case | undefined;
          if (!c) throw new Error(`No case for ${name}.`);
          // A scene's getters read what the scene's setters before them in this table left.
          if (name.startsWith('get') && cls === 'Scene')
            drive(stage, 'setAtmosphereColor', SCENE, { color: choice('Color', 'black') });
          c.check(stage, drive(stage, name, target, c.args ?? {}, c.details ?? {}));
        });
    });

  it('ran every block in the library', () => {
    expect([...ran].sort()).toEqual(Object.keys(STORY_LIBRARY).sort());
  });
});

describe('joints, as the runtime gives them (getJoint)', () => {
  const head: Value = { kind: 'joint', object: it_, joint: 'head' };
  const headAt = { object: it_, joint: jointName('head') };
  const headTurn = (stage: Stage) =>
    (stage.answer({ kind: 'transform', object: headAt, at: stage.time() }).value as Transform)
      .rotation;
  const loaded = async () => {
    const stage = new FakeStage();
    await stage.load(setup('Biped'));
    return stage;
  };

  it('turn in their own axes, and leave their object where it was', async () => {
    const stage = await loaded();
    drive(stage, 'turn', head, { direction: choice('TurnDirection', 'left'), amount: 0.25 });
    close(heading(headTurn(stage)), 0.25);
    close(heading(where(stage).rotation), 0);
    drive(stage, 'roll', head, { direction: choice('RollDirection', 'right'), amount: 0.25 });
    close(rotate(headTurn(stage), { x: 0, y: 1, z: 0 }).y, 0);
  });

  it('point at a thing by turning, and can be a target themselves', async () => {
    const stage = await loaded();
    // `other` is 2 m to its left (+X), so the head turns a quarter to face it.
    drive(stage, 'pointAt', head, { target: obj(other) });
    close(heading(headTurn(stage)), 0.25);
    close(heading(where(stage).rotation), 0);
    drive(stage, 'turnToFace', other, { target: head });
    close(heading(stage.transform(other).rotation), -0.25);
  });

  it("can't move, which is a fault at the block (decision 0051)", async () => {
    const stage = await loaded();
    expect(() =>
      drive(stage, 'move', head, { direction: choice('MoveDirection', 'up'), amount: 1 }),
    ).toThrow(/joint/);
  });

  it('come in chains, from the root out, as the model has them', async () => {
    const stage = new FakeStage({
      jointsFor: () => ['tailTip', 'tail2', 'neck', 'tail', 'head'].map(jointName),
    });
    await stage.load(setup('Quadruped'));
    const chain = (c: 'neck' | 'tail') =>
      stage.answer({ kind: 'jointChain', object: it_, chain: c, at: 0 }).value;
    expect(chain('tail')).toEqual(['tail', 'tail2', 'tailTip']);
    expect(chain('neck')).toEqual(['neck']);
    const bare = new FakeStage();
    await bare.load(setup('Prop'));
    expect(bare.answer({ kind: 'jointChain', object: it_, chain: 'tail', at: 0 }).value).toEqual(
      [],
    );
  });
});

/** The camera's blocks include a model's (it can move and turn): those run on the camera too. */
describe('the camera moves like a model', () => {
  it('move', async () => {
    const stage = new FakeStage();
    await stage.load(setup('Prop'));
    drive(stage, 'move', CAMERA, { direction: choice('MoveDirection', 'up'), amount: 1 });
    close(stage.transform(CAMERA).position.y, 2);
  });
});
