import { exampleProduction } from '@storystage/production';
import { jointName, type Quat } from '@storystage/story-api';
import { describe, expect, it } from 'vitest';
import {
  REST,
  jointTurn,
  jointTurns,
  poseJoints,
  sameTurn,
  withJoint,
  type JointTurns,
} from './pose.ts';

// A character's pose as three turns (07-ux 7.2; S3's #424): heading, then tilt, then roll.

const close = (a: Quat, b: Quat) => sameTurn(a, b);

describe('a joint’s three turns', () => {
  it('reads back the turns that made it', () => {
    const cases: JointTurns[] = [
      { heading: 0, tilt: 0, roll: 0 },
      { heading: 0.25, tilt: 0, roll: 0 },
      { heading: 0, tilt: 0.125, roll: 0 },
      { heading: 0, tilt: 0, roll: -0.2 },
      { heading: 0.1, tilt: -0.2, roll: 0.3 },
      { heading: -0.45, tilt: 0.24, roll: 0.45 },
    ];
    for (const t of cases) expect(jointTurns(jointTurn(t))).toEqual(t);
  });

  it('turns about the joint’s y, then x, then z', () => {
    const quarter = Math.SQRT1_2;
    expect(
      close(jointTurn({ heading: 0.25, tilt: 0, roll: 0 }), { x: 0, y: quarter, z: 0, w: quarter }),
    ).toBe(true);
    expect(
      close(jointTurn({ heading: 0, tilt: 0.25, roll: 0 }), { x: quarter, y: 0, z: 0, w: quarter }),
    ).toBe(true);
    expect(
      close(jointTurn({ heading: 0, tilt: 0, roll: 0.25 }), { x: 0, y: 0, z: quarter, w: quarter }),
    ).toBe(true);
    // Heading first: y then x is not x then y.
    const q = jointTurn({ heading: 0.25, tilt: 0.25, roll: 0 });
    expect(Math.hypot(q.x, q.y, q.z, q.w)).toBeCloseTo(1);
    expect(q.z).toBeCloseTo(-0.5);
  });

  it('keeps each turn within its limit', () => {
    expect(jointTurns(jointTurn({ heading: 0.9, tilt: -0.6, roll: 0 }))).toEqual({
      heading: 0.5,
      tilt: -0.25,
      roll: 0,
    });
  });

  it('reads a quarter-turn tilt as heading and tilt, the same turn', () => {
    const typed = { heading: 0.1, tilt: 0.25, roll: 0.05 };
    const turn = jointTurn(typed);
    const read = jointTurns(turn);
    expect(read.tilt).toBe(0.25);
    expect(read.roll).toBe(0);
    expect(close(jointTurn(read), turn)).toBe(true);
  });
});

describe('posing an object', () => {
  const p = exampleProduction();
  const scene = p.scenes[0]!.id;
  const head = jointName('head');
  const neck = jointName('neck');
  const penguin = (q: typeof p) => q.scenes[0]!.setup.objects.find((o) => o.id === 'penguin')!;

  it('sets a joint’s turn, and leaves a joint at rest out', () => {
    const turned = jointTurn({ heading: 0.125, tilt: 0, roll: 0 });
    let q = withJoint(p, scene, 'penguin', head, turned);
    q = withJoint(q, scene, 'penguin', neck, turned);
    expect(Object.keys(penguin(q).joints!)).toEqual(['head', 'neck']);
    q = withJoint(q, scene, 'penguin', neck, REST);
    expect(Object.keys(penguin(q).joints!)).toEqual(['head']);
    q = withJoint(q, scene, 'penguin', head, null);
    expect('joints' in penguin(q)).toBe(false);
    // Nothing else changed.
    expect(penguin(q)).toEqual(penguin(p));
  });
});

describe('the joints a model can be posed by', () => {
  it('are every joint it has: the joint map’s in its order, then its own, with their words', () => {
    const has = ['plumageCenterTip', 'leftLowerArm', 'head', 'hips', 'tailTip'].map(jointName);
    const joints = poseJoints('Biped', has);
    expect(joints.map((j) => j.id)).toEqual([
      'hips',
      'head',
      'leftLowerArm',
      'tailTip',
      'plumageCenterTip',
    ]);
    expect(joints.find((j) => j.id === 'leftLowerArm')?.word).toBe('left elbow');
    expect(joints.at(-1)?.word).toBe('plumage center tip');
  });

  it('are none for a prop, a class without joints, or a model not yet known', () => {
    expect(poseJoints('Biped', 'prop-only')).toEqual([]);
    expect(poseJoints('Prop', [jointName('head')])).toEqual([]);
    expect(poseJoints('Biped', undefined)).toEqual([]);
  });
});
