import { LoadAssetContainerAsync } from '@babylonjs/core/Loading/sceneLoader.js';
import { TransformNode } from '@babylonjs/core/Meshes/transformNode.js';
import { Quaternion } from '@babylonjs/core/Maths/math.vector.js';
import { Scene } from '@babylonjs/core/scene.js';
import { registerBuiltInLoaders } from '@babylonjs/loaders/dynamic.js';
import {
  backstageId,
  jointName,
  objectId,
  type JointName,
  type Quat,
  type Vec3,
} from '@storystage/story-api';
import { describe, expect, it } from 'vitest';
import { axisTurns, v } from '../math.ts';
import { HUMAN_BONES, type HumanPose } from '../humanoid/pose.ts';
import { headlessEngine } from './headless.ts';
import { HumanoidRig } from './humanoid-rig.ts';
import { ModelLibrary } from './models.ts';
import { tinyHumanUrl } from './tiny-model.ts';

registerBuiltInLoaders();

async function human(twisted = false) {
  const scene = new Scene(headlessEngine());
  scene.useRightHandedSystem = true;
  const container = await LoadAssetContainerAsync(tinyHumanUrl({ twisted }), scene, {
    pluginExtension: '.glb',
  });
  container.addAllToScene();
  const root = new TransformNode('it', scene);
  root.rotationQuaternion = Quaternion.Identity();
  for (const n of container.rootNodes) n.parent = root;
  const joints = new Map<JointName, TransformNode>();
  for (const { joint } of HUMAN_BONES) {
    const node = scene.getTransformNodeByName(joint);
    if (node) joints.set(joint, node);
  }
  const rig = new HumanoidRig(root, joints);
  const at = (joint: string): Vec3 => {
    for (const n of [root, ...root.getDescendants(false)])
      (n as TransformNode).computeWorldMatrix(true);
    const { x, y, z } = joints.get(jointName(joint))!.getAbsolutePosition();
    return { x, y, z };
  };
  return { rig, at, root };
}

const pose = (turns: Record<string, Quat>, hips: Vec3 = v(0, 0, 0)): HumanPose => ({
  turns: new Map(Object.entries(turns).map(([j, q]) => [jointName(j), q])),
  hips,
});

const close = (a: Vec3, b: Vec3, digits = 4) => {
  for (const k of ['x', 'y', 'z'] as const) expect(a[k]).toBeCloseTo(b[k], digits);
};

// The left arm hangs down: a quarter turn about +Z takes +X (its left) to -Y.
const armDown = pose({ leftUpperArm: axisTurns(v(0, 0, 1), -0.25) });

describe('a humanoid rig', () => {
  it('finds the humanoid bones and how high the hips are', async () => {
    const { rig } = await human();
    expect(rig.joints()).toContain('leftHand');
    expect(rig.hipsHeight).toBeCloseTo(1, 6);
  });

  it('reads a model at rest as the T-pose', async () => {
    const { rig } = await human(true);
    const read = rig.read();
    for (const q of read.turns.values()) expect(Math.abs(q.w)).toBeCloseTo(1, 5);
    close(read.hips, v(0, 0, 0));
  });

  for (const twisted of [false, true])
    it(`poses its bones whatever their axes${twisted ? ' (odd axes)' : ''}`, async () => {
      const { rig, at } = await human(twisted);
      rig.apply(armDown);
      close(at('leftLowerArm'), v(0.2, 1.15, 0));
      close(at('leftHand'), v(0.2, 0.9, 0));
      // The rest of the body stays where it was.
      close(at('rightHand'), v(-0.75, 1.45, 0));
      rig.apply(pose({ spine: axisTurns(v(1, 0, 0), 0.25) }));
      // Bending forward a quarter at the spine takes the head out in front.
      close(at('head'), v(0, 1.1, 0.5));
    });

  it('moves the hips by hips’ heights, and goes back to rest', async () => {
    const { rig, at } = await human(true);
    rig.apply(pose({}, v(0, -0.5, 0.25)));
    close(at('hips'), v(0, 0.5, 0.25));
    close(at('head'), v(0, 1.1, 0.25));
    rig.rest();
    close(at('hips'), v(0, 1, 0));
    close(at('leftHand'), v(0.75, 1.45, 0));
  });

  it('turns a VRM 0.x avatar, which faces -Z, to face +Z like everything else', async () => {
    const scene = new Scene(headlessEngine());
    scene.useRightHandedSystem = true;
    const url = tinyHumanUrl({ facing: 'back' });
    const library = new ModelLibrary(scene, { find: () => ({ url, joints: [] }) });
    await library.place(objectId('it'), backstageId('test/Biped/vrm'), 'Biped');
    const hand = scene.getTransformNodeByName('leftHand')!;
    hand.computeWorldMatrix(true);
    // Its left hand is on +X, as a model facing +Z has it.
    expect(hand.getAbsolutePosition().x).toBeCloseTo(0.75, 5);
  });

  it('reads back the pose it was given', async () => {
    const { rig } = await human(true);
    const given = pose(
      {
        leftUpperArm: axisTurns(v(0, 0, 1), -0.2),
        leftLowerArm: axisTurns(v(0, 1, 0), 0.1),
        head: axisTurns(v(0, 1, 0), 0.05),
      },
      v(0, -0.1, 0),
    );
    rig.apply(given);
    const read = rig.read();
    for (const [joint, q] of given.turns) {
      const r = read.turns.get(joint)!;
      const d = Math.abs(q.x * r.x + q.y * r.y + q.z * r.z + q.w * r.w);
      expect(d).toBeCloseTo(1, 5);
    }
    close(read.hips, given.hips);
  });
});
