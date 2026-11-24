import { CreateBox } from '@babylonjs/core/Meshes/Builders/boxBuilder.js';
import { CreateCylinder } from '@babylonjs/core/Meshes/Builders/cylinderBuilder.js';
import { TransformNode } from '@babylonjs/core/Meshes/transformNode.js';
import { Scene } from '@babylonjs/core/scene.js';
import { jointName, type JointName, type Vec3 } from '@storystage/story-api';
import { describe, expect, it } from 'vitest';
import { ARMS_HELD } from '../humanoid/body.ts';
import { armHang } from './arm-room.ts';
import { headlessEngine } from './headless.ts';

/**
 * A body as a model rests: a trunk `wide` metres across on the spine, and an upper arm
 * 0.1 m thick on each side, straight out from shoulders 0.2 m either side of the middle.
 */
function body(wide: number) {
  const scene = new Scene(headlessEngine());
  const at: Record<string, Vec3> = {
    hips: { x: 0, y: 1, z: 0 },
    spine: { x: 0, y: 1.1, z: 0 },
    leftUpperArm: { x: 0.2, y: 1.45, z: 0 },
    leftLowerArm: { x: 0.5, y: 1.45, z: 0 },
    leftHand: { x: 0.75, y: 1.45, z: 0 },
    rightUpperArm: { x: -0.2, y: 1.45, z: 0 },
    rightLowerArm: { x: -0.5, y: 1.45, z: 0 },
    rightHand: { x: -0.75, y: 1.45, z: 0 },
  };
  const joints = new Map<JointName, TransformNode>();
  for (const [name, p] of Object.entries(at)) {
    const node = new TransformNode(name, scene);
    node.position.set(p.x, p.y, p.z);
    joints.set(jointName(name), node);
  }
  // Many rings, as a real trunk's mesh is dense.
  const trunk = CreateCylinder(
    'trunk',
    { diameter: wide, height: 0.5, subdivisions: 25, tessellation: 24 },
    scene,
  );
  trunk.parent = joints.get(jointName('spine'))!;
  trunk.position.y = 0.1;
  const meshes = [trunk];
  for (const side of ['left', 'right']) {
    const arm = CreateBox(`${side}Arm`, { width: 0.3, height: 0.1, depth: 0.1 }, scene);
    arm.parent = joints.get(jointName(`${side}UpperArm`))!;
    arm.position.x = side === 'left' ? 0.15 : -0.15;
    meshes.push(arm);
  }
  const places = new Map([...Object.entries(at)].map(([n, p]) => [jointName(n), p]));
  return { meshes, joints, places };
}

const degrees = (r: number | undefined) => ((r ?? NaN) * 180) / Math.PI;

describe("how low a humanoid's arms can hang beside its body (owner's choice, 24 Nov)", () => {
  it('nearly straight down beside a slim body', () => {
    const { meshes, joints, places } = body(0.3);
    expect(degrees(armHang(meshes, joints, places))).toBeGreaterThan(70);
  });

  it('less far beside a wide one, but at least as low as KayKit holds them', () => {
    const slim = body(0.3);
    const wide = body(0.6);
    const hang = armHang(wide.meshes, wide.joints, wide.places)!;
    expect(hang).toBeLessThan(armHang(slim.meshes, slim.joints, slim.places)! - 0.2);
    expect(hang).toBeGreaterThanOrEqual(ARMS_HELD);
  });

  it('as KayKit holds them, beside a body wider than the arms reach', () => {
    const { meshes, joints, places } = body(1.6);
    expect(armHang(meshes, joints, places)).toBeCloseTo(ARMS_HELD, 9);
  });

  it("can't say for a model with no trunk", () => {
    const { meshes, joints, places } = body(0.3);
    expect(armHang(meshes.slice(1), joints, places)).toBeUndefined();
  });
});
