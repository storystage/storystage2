import { jointName, type Quat } from '@storystage/story-api';
import { describe, expect, it } from 'vitest';
import { axisTurns, v } from '../math.ts';
import { Body } from './body.ts';
import { loadHumanLibrary } from './library.ts';
import { pack, unpack } from './packed.ts';
import {
  blend,
  fromModelTurns,
  modelTurns,
  sample,
  T_POSE,
  type HumanClip,
  type HumanPose,
} from './pose.ts';

const arm = jointName('leftUpperArm');
const head = jointName('head');
const pose = (turns: Record<string, Quat>, hips = v(0, 0, 0)): HumanPose => ({
  turns: new Map(Object.entries(turns).map(([j, q]) => [jointName(j), q])),
  hips,
});
/** How far apart two turns are, in turns. */
const apart = (a: Quat | undefined, b: Quat) => {
  const q = a ?? { x: 0, y: 0, z: 0, w: 1 };
  const d = Math.min(1, Math.abs(q.x * b.x + q.y * b.y + q.z * b.z + q.w * b.w));
  return Math.acos(d) / Math.PI;
};

const down = axisTurns(v(0, 0, 1), -0.25);
const clip: HumanClip = {
  name: 'lower',
  duration: 1,
  loop: false,
  keys: [
    { time: 0, pose: T_POSE },
    { time: 1, pose: pose({ leftUpperArm: down }, v(0, -0.1, 0)) },
  ],
};

describe('humanoid poses', () => {
  it('go between keys at an even speed, and hold at the ends unless they loop', () => {
    expect(apart(sample(clip, 0.5).turns.get(arm), axisTurns(v(0, 0, 1), -0.125))).toBeLessThan(
      1e-6,
    );
    expect(sample(clip, 0.5).hips.y).toBeCloseTo(-0.05, 9);
    expect(apart(sample(clip, 3).turns.get(arm), down)).toBeLessThan(1e-6);
    expect(sample(clip, 1.25, true).hips.y).toBeCloseTo(-0.025, 9);
  });

  it('blend by weight, with the T-pose making up a weight under 1', () => {
    const lowered = pose({ leftUpperArm: down });
    const nod = pose({ head: axisTurns(v(1, 0, 0), 0.1) });
    const half = blend([{ pose: lowered, weight: 0.5 }]);
    expect(apart(half.turns.get(arm), axisTurns(v(0, 0, 1), -0.125))).toBeLessThan(1e-6);
    const both = blend([
      { pose: lowered, weight: 1 },
      { pose: nod, weight: 1 },
    ]);
    // Each counts for half, and holds the other's bone where the T-pose has it.
    expect(apart(both.turns.get(arm), axisTurns(v(0, 0, 1), -0.125))).toBeLessThan(1e-6);
    expect(apart(both.turns.get(head), axisTurns(v(1, 0, 0), 0.05))).toBeLessThan(1e-6);
  });

  it('turn into turns in the model and back', () => {
    const p = pose({
      spine: axisTurns(v(1, 0, 0), 0.1),
      leftUpperArm: down,
      head: axisTurns(v(0, 1, 0), 0.05),
    });
    const world = modelTurns(p);
    // The arm hangs from the spine, so it turns with it.
    expect(apart(world.get(head), world.get(jointName('spine'))!)).toBeGreaterThan(0.02);
    const back = fromModelTurns(world, p.hips);
    for (const [joint, q] of p.turns) expect(apart(back.turns.get(joint), q)).toBeLessThan(1e-6);
  });

  it('pack into a few bytes, and come back within a hundredth of a degree', () => {
    const packed = pack(
      'lower',
      30,
      [0, 0.5, 1].map((t) => sample(clip, t)),
    );
    expect(packed.frames).toBe(3);
    const back = unpack(packed);
    expect(back.duration).toBeCloseTo(2 / 30, 9);
    for (let i = 0; i < 3; i++) {
      const was = sample(clip, i / 2);
      expect(apart(back.keys[i]!.pose.turns.get(arm), was.turns.get(arm)!)).toBeLessThan(1 / 36000);
      expect(back.keys[i]!.pose.hips.y).toBeCloseTo(was.hips.y, 4);
    }
  });
});

describe('the shared clips', () => {
  it('have walking, running, postures and more, from KayKit', async () => {
    const library = await loadHumanLibrary();
    for (const name of ['idle', 'walk', 'run', 'sitDown', 'sitting', 'lieDown', 'lying', 'pickUp'])
      expect(library.has(name)).toBe(true);
    const walk = library.get('walk')!;
    expect(walk.loop).toBe(true);
    // A run's feet carry it about twice as fast as a walk's.
    expect(library.get('run')!.speed! / walk.speed!).toBeGreaterThan(1.6);
    expect(library.get('run')!.speed! / walk.speed!).toBeLessThan(2.4);
    // A walk starts again where it began.
    const first = walk.keys[0]!.pose;
    const last = walk.keys[walk.keys.length - 1]!.pose;
    for (const [joint, q] of first.turns)
      expect(apart(last.turns.get(joint), q)).toBeLessThan(0.01);
  });

  it('come back the same every time', async () => {
    const a = await loadHumanLibrary();
    expect(sample(a.get('walk')!, 0.4)).toEqual(sample(a.get('walk')!, 0.4));
  });
});

describe('a body resting in an A-pose', () => {
  const k = Math.SQRT1_2;
  const places = new Map(
    (
      [
        ['hips', 0, 1, 0],
        ['spine', 0, 1.1, 0],
        ['head', 0, 1.6, 0],
        ['leftUpperArm', 0.2, 1.45, 0],
        ['leftLowerArm', 0.2 + 0.3 * k, 1.45 - 0.3 * k, 0],
        ['leftHand', 0.2 + 0.55 * k, 1.45 - 0.55 * k, 0],
        ['rightUpperArm', -0.2, 1.45, 0],
        ['rightLowerArm', -0.2 - 0.3 * k, 1.45 - 0.3 * k, 0],
        ['rightHand', -0.2 - 0.55 * k, 1.45 - 0.55 * k, 0],
        ['leftUpperLeg', 0.1, 0.95, 0],
        ['leftFoot', 0.1, 0.08, 0],
        ['rightUpperLeg', -0.1, 0.95, 0],
        ['rightFoot', -0.1, 0.08, 0],
      ] as const
    ).map(([j, x, y, z]) => [jointName(j), v(x, y, z)]),
  );

  it('is posed from a T-pose, as the rig poses it', () => {
    const body = Body.of(places)!;
    const hand = body.places(T_POSE).get(jointName('leftHand'))!;
    expect(hand.x).toBeCloseTo(0.75, 9);
    expect(hand.y).toBeCloseTo(1.45, 9);
    const down = body
      .places(pose({ leftUpperArm: axisTurns(v(0, 0, 1), -0.25) }))
      .get(jointName('leftHand'))!;
    expect(down.x).toBeCloseTo(0.2, 9);
    expect(down.y).toBeCloseTo(0.9, 9);
  });
});
