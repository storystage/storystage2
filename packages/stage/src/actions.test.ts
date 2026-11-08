import {
  IDENTITY,
  jointName,
  micros,
  objectId,
  type JointName,
  type SceneSetup,
  type Transform,
  type Vec3,
} from '@storystage/story-api';
import { beforeAll, describe, expect, it } from 'vitest';
import { Body } from './humanoid/body.ts';
import { loadHumanLibrary, type HumanLibrary } from './humanoid/library.ts';
import { modelTurns } from './humanoid/pose.ts';
import { add, axisTurns, rotate, v } from './math.ts';
import { loadNavigation, type NavigationMaker } from './navigation.ts';
import { cmd } from './testing/conformance.ts';
import { STAND_IN_BOX, Timeline, type Shape } from './timeline.ts';

/** Where a small person's joints rest, facing +Z with +X on its left, as `tinyHumanUrl`'s do. */
const PERSON: readonly [string, number, number, number][] = [
  ['hips', 0, 1, 0],
  ['spine', 0, 1.1, 0],
  ['chest', 0, 1.3, 0],
  ['neck', 0, 1.5, 0],
  ['head', 0, 1.6, 0],
  ['leftUpperArm', 0.2, 1.45, 0],
  ['leftLowerArm', 0.5, 1.45, 0],
  ['leftHand', 0.75, 1.45, 0],
  ['rightUpperArm', -0.2, 1.45, 0],
  ['rightLowerArm', -0.5, 1.45, 0],
  ['rightHand', -0.75, 1.45, 0],
  ['leftUpperLeg', 0.1, 0.95, 0],
  ['leftLowerLeg', 0.1, 0.5, 0],
  ['leftFoot', 0.1, 0.08, 0],
  ['rightUpperLeg', -0.1, 0.95, 0],
  ['rightLowerLeg', -0.1, 0.5, 0],
  ['rightFoot', -0.1, 0.08, 0],
];
const places = new Map<JointName, Vec3>(PERSON.map(([j, x, y, z]) => [jointName(j), v(x, y, z)]));
const person: Shape = {
  joints: [...places.keys()],
  box: { min: v(-0.8, 0, -0.2), max: v(0.8, 1.8, 0.2) },
  jointPlaces: places,
};

const ann = objectId('ann');
const wall = objectId('wall');
const spot = objectId('spot');
const at = (x: number, y = 0, z = 0): Transform => ({ ...IDENTITY, position: { x, y, z } });
const scene: SceneSetup = {
  backdrop: {},
  objects: [
    { id: ann, model: { standIn: 'ann' }, class: 'Biped', transform: at(-3) },
    // A block stretched into a wall 4 m long.
    {
      id: wall,
      model: { standIn: 'wall' },
      class: 'Prop',
      transform: { ...at(0), scale: v(2, 2, 8) },
    },
  ],
  camera: { transform: at(0, 1.5, -8) },
  markers: [{ id: spot, transform: at(3) }],
};

let library: HumanLibrary;
let navigation: NavigationMaker;
beforeAll(async () => {
  [library, navigation] = await Promise.all([loadHumanLibrary(), loadNavigation()]);
});

function timeline() {
  const t = new Timeline();
  t.load(scene, (o) =>
    o.id === ann ? person : { joints: [], box: STAND_IN_BOX, jointPlaces: new Map() },
  );
  t.useHumanoids(library, navigation);
  return t;
}
const where = (t: Timeline) => t.transform(ann).position;
const body = Body.of(places)!;
/** A joint's place in the scene, as the timeline poses it. */
const jointAt = (t: Timeline, joint: string) => {
  const pose = t.shown(ann).human!;
  const { position, rotation } = t.transform(ann);
  return add(position, rotate(rotation, body.places(pose).get(jointName(joint))!));
};

describe('walking', () => {
  it('goes round a wall, at a walking pace, and stops where it was going', () => {
    const t = timeline();
    const seconds = t.answer(
      {
        kind: 'naturalDuration',
        action: { object: ann, kind: 'walk', to: spot, gait: 'walk' },
        at: 0,
      },
      () => false,
    ).value as number;
    // Further than straight across, and at about a person's walking pace.
    expect(seconds).toBeGreaterThan(micros(6 / 2));
    t.schedule([cmd(0, seconds / 1e6, { object: ann, kind: 'walk', to: spot, gait: 'walk' })]);
    for (let s = 0; s <= seconds; s += micros(0.25)) {
      t.seek(s);
      const p = where(t);
      // Never through the wall (1 m thick, 4 m long).
      expect(Math.abs(p.x) < 0.5 && Math.abs(p.z) < 2).toBe(false);
    }
    t.seek(seconds);
    expect(where(t).x).toBeCloseTo(3, 1);
    expect(where(t).z).toBeCloseTo(0, 1);
  });

  it('swings its legs as it goes, and runs faster than it walks', () => {
    const t = timeline();
    const walk = t.answer(
      {
        kind: 'naturalDuration',
        action: { object: ann, kind: 'walk', to: spot, gait: 'walk' },
        at: 0,
      },
      () => false,
    ).value as number;
    const run = t.answer(
      {
        kind: 'naturalDuration',
        action: { object: ann, kind: 'walk', to: spot, gait: 'run' },
        at: 0,
      },
      () => false,
    ).value as number;
    expect(run).toBeLessThan(walk * 0.7);
    t.schedule([cmd(0, walk / 1e6, { object: ann, kind: 'walk', to: spot, gait: 'walk' })]);
    const feet = [];
    for (const s of [0.4, 0.6, 0.8, 1.0]) {
      t.seek(micros(s));
      feet.push(jointAt(t, 'leftFoot').z - where(t).z);
    }
    expect(Math.max(...feet) - Math.min(...feet)).toBeGreaterThan(0.05);
  });
});

describe('a person', () => {
  it('stands at rest, with its arms down', () => {
    const t = timeline();
    expect(t.shown(ann).human).not.toBeNull();
    expect(jointAt(t, 'leftHand').y).toBeLessThan(1.2);
  });

  it('lies on the ground, not above it', () => {
    const t = timeline();
    t.schedule([cmd(0, 3, { object: ann, kind: 'posture', posture: 'lie' })]);
    t.seek(micros(4));
    const ys = [...body.places(t.shown(ann).human!).values()].map((p) => p.y);
    expect(Math.min(...ys)).toBeCloseTo(body.clearance, 3);
    // And it's lying: the head is low.
    expect(jointAt(t, 'head').y).toBeLessThan(0.5);
  });

  it('falls over and gets up again', () => {
    const t = timeline();
    t.schedule([
      cmd(0, 0.9, { object: ann, kind: 'posture', posture: 'fall' }),
      cmd(2, 2.4, { object: ann, kind: 'posture', posture: 'stand' }),
    ]);
    t.seek(micros(1.5));
    expect(jointAt(t, 'head').y).toBeLessThan(0.5);
    t.seek(micros(5));
    expect(jointAt(t, 'head').y).toBeGreaterThan(1.4);
  });

  it('puts its hand on what it reaches for, with the nearer hand', () => {
    const t = timeline();
    const target = v(-2.6, 1.2, 0.4);
    t.load(
      { ...scene, markers: [{ id: spot, transform: { ...IDENTITY, position: target } }] },
      (o) => (o.id === ann ? person : { joints: [], box: STAND_IN_BOX, jointPlaces: new Map() }),
    );
    t.useHumanoids(library, navigation);
    t.schedule([cmd(0, 0.8, { object: ann, kind: 'reach', target: spot, then: 'stay' })]);
    t.seek(micros(1));
    const hand = jointAt(t, 'leftHand');
    for (const k of ['x', 'y', 'z'] as const) expect(hand[k]).toBeCloseTo(target[k], 2);
  });

  it('turns its head to look, while its body stays where it is', () => {
    const t = timeline();
    t.schedule([cmd(0, 0.5, { object: ann, kind: 'lookAt', target: wall })]);
    t.seek(micros(1));
    const turns = modelTurns(t.shown(ann).human!);
    const facing = rotate(turns.get(jointName('head'))!, v(0, 0, 1));
    // The wall is on its left (+X).
    expect(facing.x).toBeGreaterThan(0.5);
    expect(t.transform(ann).rotation).toEqual(IDENTITY.rotation);
  });

  it('waves with its right hand, and its legs stay as they would have', () => {
    const still = timeline();
    still.seek(micros(0.7));
    const foot = jointAt(still, 'leftFoot');
    const t = timeline();
    t.schedule([cmd(0, 2, { object: ann, kind: 'gesture', gesture: 'wave' })]);
    t.seek(micros(0.7));
    expect(jointAt(t, 'rightHand').y).toBeGreaterThan(1.6);
    const now = jointAt(t, 'leftFoot');
    for (const k of ['x', 'y', 'z'] as const) expect(now[k]).toBeCloseTo(foot[k], 2);
  });

  it('has the five gestures and the fall in the library', () => {
    for (const name of ['wave', 'nod', 'shrug', 'clap', 'point', 'fall'])
      expect(library.has(name)).toBe(true);
    void axisTurns;
  });
});
