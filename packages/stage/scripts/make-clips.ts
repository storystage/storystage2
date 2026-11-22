/**
 * Makes the stage's shared humanoid clips (WP4.6) from a KayKit character's own (CC0), by the
 * owner's decision of 8 Nov 2026. Each frame is read as a humanoid pose (`HumanoidRig.read`),
 * so the clips play on any humanoid.
 *
 *   node packages/stage/scripts/make-clips.ts <path to a KayKit .glb>
 *
 * It writes `src/humanoid/kaykit-clips.ts`. The KayKit characters in Backstage share one rig and
 * one set of clips, so any of them gives the same result.
 */
import { readFileSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { LoadAssetContainerAsync } from '@babylonjs/core/Loading/sceneLoader.js';
import { TransformNode } from '@babylonjs/core/Meshes/transformNode.js';
import type { Vector3 } from '@babylonjs/core/Maths/math.vector.js';
import { Quaternion } from '@babylonjs/core/Maths/math.vector.js';
import { Scene } from '@babylonjs/core/scene.js';
import { registerBuiltInLoaders } from '@babylonjs/loaders/dynamic.js';
import { mapSkeleton } from '@storystage/backstage';
import type { JointName } from '@storystage/story-api';
import { headlessEngine } from '../src/babylon/headless.ts';
import { HumanoidRig } from '../src/babylon/humanoid-rig.ts';
import { pack, type PackedClip } from '../src/humanoid/packed.ts';
import type { HumanPose } from '../src/humanoid/pose.ts';

const FPS = 30;

/** KayKit's clip, our name, and whether it starts again at its end. */
const CLIPS: readonly (readonly [string, string, boolean])[] = [
  ['Idle', 'idle', true],
  ['Walking_A', 'walk', true],
  ['Running_A', 'run', true],
  ['Sit_Chair_Down', 'sitDown', false],
  ['Sit_Chair_Idle', 'sitting', true],
  ['Sit_Chair_StandUp', 'standUpFromSitting', false],
  ['Sit_Floor_Down', 'sitDownOnFloor', false],
  ['Sit_Floor_Idle', 'sittingOnFloor', true],
  ['Sit_Floor_StandUp', 'standUpFromFloor', false],
  ['Lie_Down', 'lieDown', false],
  ['Lie_Idle', 'lying', true],
  ['Lie_StandUp', 'standUpFromLying', false],
  ['PickUp', 'pickUp', false],
  ['Interact', 'interact', false],
  ['Cheer', 'cheer', false],
];

registerBuiltInLoaders();

const file = process.argv[2];
if (!file) throw new Error('Give the path to a KayKit character, such as knight.glb.');
const scene = new Scene(headlessEngine());
scene.useRightHandedSystem = true;
const url = `data:model/gltf-binary;base64,${readFileSync(file).toString('base64')}`;
const container = await LoadAssetContainerAsync(url, scene, { pluginExtension: '.glb' });
container.addAllToScene();
for (const group of container.animationGroups) group.stop();
const root = new TransformNode('model', scene);
root.rotationQuaternion = Quaternion.Identity();
for (const n of container.rootNodes) n.parent = root;
const nodes = new Map(scene.transformNodes.map((n) => [n.name, n]));
const { bones } = mapSkeleton([...nodes.keys()], 'biped');
const joints = new Map(
  Object.entries(bones).map(([joint, bone]) => [joint as JointName, nodes.get(bone)!]),
);
const rig = new HumanoidRig(root, joints);

/** Every node a clip moves, as it rests, to go back to between clips. */
const rest = scene.transformNodes.map((n) => ({
  n,
  position: n.position.clone(),
  rotation: n.rotationQuaternion?.clone() ?? null,
  scaling: n.scaling.clone(),
}));

const out: PackedClip[] = [];
for (const [source, name, loop] of CLIPS) {
  const group = container.animationGroups.find((g) => g.name === source);
  if (!group) throw new Error(`The model has no clip called ${source}.`);
  for (const r of rest) {
    r.n.position.copyFrom(r.position);
    if (r.rotation) r.n.rotationQuaternion!.copyFrom(r.rotation);
    r.n.scaling.copyFrom(r.scaling);
  }
  const seconds = (group.to - group.from) / 60;
  const frames = Math.round(seconds * FPS) + 1;
  const poses: HumanPose[] = [];
  const feet: { left: Vector3; right: Vector3 }[] = [];
  for (let f = 0; f < frames; f++) {
    for (const { animation, target } of group.targetedAnimations) {
      const frame = group.from + (f / FPS) * animation.framePerSecond;
      const value = animation.evaluate(Math.min(frame, group.to));
      const node = target as TransformNode;
      if (animation.targetProperty === 'position') node.position.copyFrom(value);
      else if (animation.targetProperty === 'rotationQuaternion')
        (node.rotationQuaternion ??= Quaternion.Identity()).copyFrom(value);
      else if (animation.targetProperty === 'scaling') node.scaling.copyFrom(value);
    }
    poses.push(rig.read());
    const foot = (j: string) =>
      joints
        .get(j as JointName)!
        .getAbsolutePosition()
        .clone();
    feet.push({ left: foot('leftFoot'), right: foot('rightFoot') });
  }
  out.push(
    pack(name, FPS, poses, {
      loop,
      ...(loop && /walk|run/.test(name) ? { speed: speedOf(feet) } : {}),
    }),
  );
}

/**
 * How fast a walk's feet carry it, in hips' heights a second. A foot is on the ground for about
 * half of each step and slides back its whole swing while it is, so the body goes twice the
 * swing in each cycle. (Timing each foot only while it's down undercounts a run's short steps.)
 */
function speedOf(feet: readonly { left: Vector3; right: Vector3 }[]): number {
  const swing = (['left', 'right'] as const).map((side) => {
    const zs = feet.map((f) => f[side].z);
    return Math.max(...zs) - Math.min(...zs);
  });
  const cycle = (feet.length - 1) / FPS;
  const mean = (swing[0]! + swing[1]!) / 2;
  return Math.round(((2 * mean) / cycle / rig.hipsHeight) * 1000) / 1000;
}

const target = fileURLToPath(new URL('../src/humanoid/kaykit-clips.ts', import.meta.url));
writeFileSync(
  target,
  `/**
 * Made by \`scripts/make-clips.ts\` from the clips of KayKit's Character Pack: Adventurers 1.0,
 * by Kay Lousberg (CC0). Don't edit it; make it again.
 */
import type { PackedClip } from './packed.ts';

export const KAYKIT_CREDIT = 'Animations from KayKit Character Pack: Adventurers, by Kay Lousberg (CC0)';

export const KAYKIT_CLIPS: readonly PackedClip[] = ${JSON.stringify(out, null, 2)};
`,
);
console.log(
  out
    .map((c) => `${c.name}: ${c.frames} frames${c.speed ? `, ${c.speed} hips a second` : ''}`)
    .join('\n'),
);
