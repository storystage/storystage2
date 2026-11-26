import { jointName } from '@storystage/story-api';
import { describe, expect, it } from 'vitest';
import { axisTurns, length, sub, v } from './math.ts';
import { POSE_HANDLES, limbOf, onFacingPlane, poleFor } from './posing.ts';

describe('drag posing, pure (5.9)', () => {
  it('bends an arm for a hand and a leg for a foot', () => {
    expect(POSE_HANDLES).toEqual(['leftHand', 'rightHand', 'leftFoot', 'rightFoot']);
    expect(limbOf('leftHand')).toEqual({
      root: jointName('leftUpperArm'),
      middle: jointName('leftLowerArm'),
      end: jointName('leftHand'),
    });
    expect(limbOf('rightFoot')).toEqual({
      root: jointName('rightUpperLeg'),
      middle: jointName('rightLowerLeg'),
      end: jointName('rightFoot'),
    });
  });

  it('bends an elbow out, down and back, and a knee forwards, as the object faces', () => {
    const arm = { root: v(0.2, 1.45, 0), middle: v(0.5, 1.45, 0), end: v(0.75, 1.45, 0) };
    const facing = { x: 0, y: 0, z: 0, w: 1 };
    const elbow = poleFor('leftHand', arm, facing);
    // Facing +Z, its left is +X: out is +X, back is -Z.
    expect(elbow.x).toBeGreaterThan(arm.root.x);
    expect(elbow.y).toBeLessThan(arm.root.y);
    expect(elbow.z).toBeLessThan(0);
    expect(poleFor('rightHand', arm, facing).x).toBeLessThan(arm.root.x);
    const leg = { root: v(0.1, 0.95, 0), middle: v(0.1, 0.5, 0), end: v(0.1, 0.08, 0) };
    expect(poleFor('leftFoot', leg, facing).z).toBeGreaterThan(0);
    // Turned to face -Z, a knee bends towards -Z.
    expect(poleFor('leftFoot', leg, axisTurns(v(0, 1, 0), 0.5)).z).toBeLessThan(0);
  });

  it('keeps a dragged point as far from the view as it was', () => {
    const forward = v(0, 0, 1);
    const ray = { origin: v(0, 1, -4), direction: v(0.1, -0.05, 1) };
    const at = onFacingPlane(ray, v(0.3, 1.2, 0.5), forward)!;
    expect(at.z).toBeCloseTo(0.5, 9);
    // On the line of sight.
    const t = (at.z - ray.origin.z) / ray.direction.z;
    expect(length(sub(at, v(0.1 * t, 1 - 0.05 * t, -4 + t)))).toBeLessThan(1e-9);
    // Not along the plane, nor behind the view.
    expect(
      onFacingPlane({ origin: v(0, 1, -4), direction: v(1, 0, 0) }, v(0, 1, 0), forward),
    ).toBeNull();
    expect(onFacingPlane(ray, v(0, 1, -10), forward)).toBeNull();
  });
});
