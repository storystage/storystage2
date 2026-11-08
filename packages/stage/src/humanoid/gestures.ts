/**
 * WP4.6: the shared library's gestures, written here because KayKit has none: wave, nod, shrug,
 * clap and point, and the fall (owner's decision of 8 Nov 2026). A gesture turns only the bones
 * it names, so it plays over whatever the legs are doing.
 *
 * Turns are from a T-pose in the axes of a model facing +Z with +X on its left, so an arm hangs
 * down by turning about Z: its left arm by a negative turn, its right by a positive one.
 */
import type { JointName, Quat } from '@storystage/story-api';
import { axisTurns, mul, v } from '../math.ts';
import type { HumanClip, HumanPose } from './pose.ts';

const X = v(1, 0, 0);
const Y = v(0, 1, 0);
const Z = v(0, 0, 1);

type Turns = Readonly<Record<string, Quat>>;

const pose = (turns: Turns): HumanPose => ({
  turns: new Map(Object.entries(turns).map(([j, q]) => [j as JointName, q])),
  hips: v(0, 0, 0),
});

/** Arms hanging at the sides. */
const ARMS_DOWN: Turns = {
  leftUpperArm: axisTurns(Z, -0.2),
  rightUpperArm: axisTurns(Z, 0.2),
  leftLowerArm: axisTurns(Y, -0.02),
  rightLowerArm: axisTurns(Y, 0.02),
};

function clip(name: string, keys: readonly (readonly [number, Turns])[]): HumanClip {
  const duration = keys[keys.length - 1]![0];
  return { name, duration, loop: false, keys: keys.map(([time, t]) => ({ time, pose: pose(t) })) };
}

/**
 * The right hand up in front of the shoulder, the forearm waving from side to side. In front, not
 * beside the head, so it shows on a character whose head is wider than its arms are long.
 */
function wave(): HumanClip {
  const up = { ...ARMS_DOWN, rightUpperArm: mul(axisTurns(Y, 0.12), axisTurns(Z, -0.08)) };
  const hand = (turns: number) => ({ ...up, rightLowerArm: axisTurns(Z, turns) });
  return clip('wave', [
    [0, ARMS_DOWN],
    [0.35, hand(-0.16)],
    [0.6, hand(-0.09)],
    [0.85, hand(-0.22)],
    [1.1, hand(-0.09)],
    [1.35, hand(-0.22)],
    [1.6, hand(-0.16)],
    [2, ARMS_DOWN],
  ]);
}

/** The head down and up, twice. */
function nod(): HumanClip {
  const head = (turns: number) => ({
    ...ARMS_DOWN,
    neck: axisTurns(X, turns / 2),
    head: axisTurns(X, turns / 2),
  });
  return clip('nod', [
    [0, head(0)],
    [0.25, head(0.05)],
    [0.5, head(-0.01)],
    [0.75, head(0.05)],
    [1.1, head(0)],
  ]);
}

/** Shoulders up, forearms out in front, palms up, and the head on one side. */
function shrug(): HumanClip {
  const up: Turns = {
    leftShoulder: axisTurns(Z, 0.03),
    rightShoulder: axisTurns(Z, -0.03),
    leftUpperArm: axisTurns(Z, -0.19),
    rightUpperArm: axisTurns(Z, 0.19),
    leftLowerArm: mul(axisTurns(Y, -0.2), axisTurns(X, -0.2)),
    rightLowerArm: mul(axisTurns(Y, 0.2), axisTurns(X, -0.2)),
    head: axisTurns(Z, 0.025),
  };
  return clip('shrug', [
    [0, ARMS_DOWN],
    [0.35, up],
    [0.85, up],
    [1.2, ARMS_DOWN],
  ]);
}

/** Both hands in front of the chest, meeting four times. */
function clap(): HumanClip {
  const hands = (together: boolean): Turns => ({
    leftUpperArm: mul(axisTurns(Y, -0.16), axisTurns(Z, -0.12)),
    rightUpperArm: mul(axisTurns(Y, 0.16), axisTurns(Z, 0.12)),
    leftLowerArm: axisTurns(Y, together ? -0.13 : -0.06),
    rightLowerArm: axisTurns(Y, together ? 0.13 : 0.06),
  });
  const keys: [number, Turns][] = [[0, ARMS_DOWN]];
  for (let i = 0; i < 4; i++) {
    keys.push([0.3 + i * 0.3, hands(false)]);
    keys.push([0.45 + i * 0.3, hands(true)]);
  }
  keys.push([1.6, hands(false)], [1.9, ARMS_DOWN]);
  return clip('clap', keys);
}

/** The right arm straight out in front, held. A reach can turn it towards a thing. */
function point(): HumanClip {
  const out = {
    ...ARMS_DOWN,
    rightUpperArm: mul(axisTurns(Y, 0.24), axisTurns(Z, -0.02)),
    rightLowerArm: axisTurns(Y, 0.01),
  };
  return clip('point', [
    [0, ARMS_DOWN],
    [0.35, out],
    [1.15, out],
    [1.5, ARMS_DOWN],
  ]);
}

/**
 * Falling over backwards onto the ground, ending as the shared library's `lying` begins, so
 * standing up from lying (`standUpFromLying`) follows on from it.
 */
function fall(standing: HumanPose, lying: HumanPose): HumanClip {
  const tipping: HumanPose = {
    turns: new Map([
      ...standing.turns,
      ...pose({
        spine: axisTurns(X, -0.04),
        leftUpperLeg: axisTurns(X, -0.08),
        rightUpperLeg: axisTurns(X, -0.08),
        leftLowerLeg: axisTurns(X, 0.12),
        rightLowerLeg: axisTurns(X, 0.12),
        leftUpperArm: axisTurns(Z, -0.08),
        rightUpperArm: axisTurns(Z, 0.08),
      }).turns,
    ]),
    hips: v(0, -0.3, -0.1),
  };
  return {
    name: 'fall',
    duration: 0.9,
    loop: false,
    keys: [
      { time: 0, pose: standing },
      { time: 0.35, pose: tipping },
      { time: 0.9, pose: lying },
    ],
  };
}

/** The gestures, by name, and the fall, from the library's standing and lying poses. */
export function codedClips(standing: HumanPose, lying: HumanPose): HumanClip[] {
  return [wave(), nod(), shrug(), clap(), point(), fall(standing, lying)];
}
