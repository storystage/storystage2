import { describe, expect, it } from 'vitest';
import { normalize, sub, transformPoint, type Vec3 } from './math.ts';
import { POSES, POSE_TARGETS, canPose, poseMesh, solvePose } from './pose.ts';
import { box, figure } from './testing.ts';

const fig = figure();
const node = (name: string) => fig.nodes!.findIndex((n) => n.name === name);
const origin: Vec3 = [0, 0, 0];

/** Where each joint is once posed. */
function jointsAfter(pose: Parameters<typeof solvePose>[1]) {
  const solved = solvePose(fig, pose)!;
  return (name: string) => transformPoint(solved[node(name)]!, origin);
}

describe('canPose', () => {
  it('poses a rigged humanoid, and nothing without a full skeleton', () => {
    expect(canPose(fig)).toBe(true);
    expect(canPose(box([0, 0, 0], [1, 1, 1]))).toBe(false);
    const noLegs = {
      ...fig,
      joints: fig.joints!.filter((i) => !/Leg|Foot/.test(fig.nodes![i]!.name)),
    };
    expect(canPose(noLegs)).toBe(false);
  });
});

describe('solvePose', () => {
  it.each(['stand', ...POSES] as const)(
    '%s: points every limb in its target direction, whatever the rest pose',
    (pose) => {
      const at = jointsAfter(pose);
      const next: Record<string, string> = {
        leftUpperArm: 'leftLowerArm',
        leftLowerArm: 'leftHand',
        rightUpperArm: 'rightLowerArm',
        rightLowerArm: 'rightHand',
        leftUpperLeg: 'leftLowerLeg',
        leftLowerLeg: 'leftFoot',
        rightUpperLeg: 'rightLowerLeg',
        rightLowerLeg: 'rightFoot',
      };
      for (const [joint, target] of Object.entries(POSE_TARGETS[pose])) {
        const d = normalize(sub(at(next[joint]!), at(joint)));
        const t = normalize(target);
        for (let k = 0; k < 3; k++) expect(d[k], `${pose} ${joint}`).toBeCloseTo(t[k]!, 5);
      }
    },
  );

  it('keeps bone lengths', () => {
    const rest = jointsAfter('stand');
    const walk = jointsAfter('walk');
    const len = (at: (n: string) => Vec3, a: string, b: string) => {
      const d = sub(at(b), at(a));
      return Math.hypot(...d);
    };
    expect(len(walk, 'leftUpperLeg', 'leftLowerLeg')).toBeCloseTo(
      len(rest, 'leftUpperLeg', 'leftLowerLeg'),
      6,
    );
  });

  it('returns null for a model that cannot be posed', () => {
    expect(solvePose(box([0, 0, 0], [1, 1, 1]), 'walk')).toBeNull();
  });
});

describe('poseMesh', () => {
  const maxBy = (mesh: typeof fig, axis: number) =>
    Math.max(
      ...Array.from({ length: mesh.positions.length / 3 }, (_, i) => mesh.positions[i * 3 + axis]!),
    );
  const minBy = (mesh: typeof fig, axis: number) =>
    Math.min(
      ...Array.from({ length: mesh.positions.length / 3 }, (_, i) => mesh.positions[i * 3 + axis]!),
    );

  it('standing brings the arms down from a T-pose', () => {
    expect(maxBy(fig, 0)).toBeCloseTo(0.84, 5);
    const stood = poseMesh(fig, 'stand');
    expect(maxBy(stood, 0)).toBeLessThan(0.45);
  });

  it('pointing reaches forward, and sitting puts the knees forward', () => {
    expect(maxBy(poseMesh(fig, 'point'), 2)).toBeGreaterThan(0.55);
    const sit = jointsAfter('sit');
    expect(sit('leftLowerLeg')[2]).toBeGreaterThan(0.3);
  });

  it('walking puts the left leg forward and the right leg back', () => {
    const walk = jointsAfter('walk');
    expect(walk('leftFoot')[2]).toBeGreaterThan(0.1);
    expect(walk('rightFoot')[2]).toBeLessThan(-0.1);
  });

  it('leaves a model it cannot pose as it is', () => {
    const b = box([0, 0, 0], [1, 1, 1]);
    expect(poseMesh(b, 'walk')).toBe(b);
    expect(minBy(poseMesh(fig, 'walk'), 1)).toBeLessThan(0.2);
  });
});
