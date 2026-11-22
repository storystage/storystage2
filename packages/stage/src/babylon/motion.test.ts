import { Scene } from '@babylonjs/core/scene.js';
import type { TransformNode } from '@babylonjs/core/Meshes/transformNode.js';
import {
  IDENTITY,
  backstageId,
  jointName,
  objectId,
  type Quat,
  type StoryClass,
  type Transform,
  type Vec3,
} from '@storystage/story-api';
import { describe, expect, it } from 'vitest';
import { axisTurns, mul, rotate, v } from '../math.ts';
import type { ObjectState } from '../timeline.ts';
import { headlessEngine } from './headless.ts';
import { ModelLibrary, type ModelSource } from './models.ts';
import { tinyModelUrl } from './tiny-model.ts';
import type { Motion } from './view.ts';

const head = jointName('head');
const person = backstageId('test/Biped/nodder');
const arm = backstageId('test/Prop/arm');
const armJoints = ['base', 'upper', 'lower', 'tip'].map(jointName);

const source: ModelSource = {
  find: (id) =>
    id === person
      ? {
          url: tinyModelUrl(['hips', 'spine', 'chest', 'neck', 'head'], {
            clips: [
              { name: 'nod', bone: 'head', axis: [1, 0, 0], turns: 0.25 },
              { name: 'shake', bone: 'head', axis: [0, 1, 0], turns: 0.25 },
            ],
          }),
          joints: [jointName('neck'), head],
        }
      : id === arm
        ? // An arm along +X: a shoulder 0.3 m out, then an elbow and a hand 0.3 m apart.
          {
            url: tinyModelUrl(['base', 'upper', 'lower', 'tip'], { step: [0.3, 0, 0] }),
            joints: armJoints,
          }
        : null,
};

/** The parts of an object's state the view reads. */
const still = (joints: ReadonlyMap<string, Quat> = new Map()) =>
  ({ joints, opacity: 1, paint: null, paintBlend: null }) as unknown as ObjectState;

async function placed(id = person, cls: StoryClass = 'Biped') {
  const scene = new Scene(headlessEngine());
  scene.useRightHandedSystem = true;
  const { view } = await new ModelLibrary(scene, source).place(objectId('it'), id, cls);
  const node = (name: string) => scene.getTransformNodeByName(name) as TransformNode;
  const turn = (name: string) => {
    const { x, y, z, w } = node(name).rotationQuaternion!;
    // A turn and its negative are the same; give the one with w ≥ 0.
    return w < 0 ? { x: -x, y: -y, z: -z, w: -w } : { x, y, z, w };
  };
  const at = (name: string): Vec3 => {
    node(name).computeWorldMatrix(true);
    const { x, y, z } = node(name).getAbsolutePosition();
    return { x, y, z };
  };
  const show = (motion: Motion, where: Transform = IDENTITY, state = still()) => {
    view.show(state, where, motion);
    // The joints' places, top down, as the next frame would have them.
    for (const n of node('it').getDescendants(false)) n.computeWorldMatrix(true);
  };
  return { scene, view, node, turn, at, show };
}

const closeQ = (a: Quat, b: Quat) => {
  for (const k of ['x', 'y', 'z', 'w'] as const) expect(a[k]).toBeCloseTo(b[k], 4);
};
const closeV = (a: Vec3, b: Vec3, digits = 3) => {
  for (const k of ['x', 'y', 'z'] as const) expect(a[k]).toBeCloseTo(b[k], digits);
};

describe('clips', () => {
  it('are listed by name, and never played by the scene', async () => {
    const { view, scene } = await placed();
    expect(view.clips()).toEqual(['nod', 'shake']);
    expect(scene.animationGroups.some((g) => g.isPlaying)).toBe(false);
  });

  it('pose the model as it is that far in', async () => {
    const { show, turn } = await placed();
    show({ clips: [{ name: 'nod', time: 0.5, weight: 1 }] });
    closeQ(turn('head'), axisTurns(v(1, 0, 0), 0.125));
    show({ clips: [{ name: 'nod', time: 1, weight: 1, loop: false }] });
    closeQ(turn('head'), axisTurns(v(1, 0, 0), 0.25));
  });

  it('start again at the end, or stop there', async () => {
    const { show, turn } = await placed();
    show({ clips: [{ name: 'nod', time: 1.25, weight: 1 }] });
    closeQ(turn('head'), axisTurns(v(1, 0, 0), 0.0625));
    show({ clips: [{ name: 'nod', time: 3, weight: 1, loop: false }] });
    closeQ(turn('head'), axisTurns(v(1, 0, 0), 0.25));
  });

  it('blend by weight, half and half lying between the two', async () => {
    const { show, turn } = await placed();
    show({
      clips: [
        { name: 'nod', time: 1, weight: 0.5, loop: false },
        { name: 'shake', time: 1, weight: 0.5, loop: false },
      ],
    });
    const both = turn('head');
    expect(both.x).toBeGreaterThan(0.2);
    expect(both.x).toBeCloseTo(both.y, 6);
    expect(both.z).toBeCloseTo(0, 6);
  });

  it('make up a weight under 1 with the rest pose, and scale one over 1 down', async () => {
    const { show, turn } = await placed();
    show({ clips: [{ name: 'nod', time: 1, weight: 0.5, loop: false }] });
    closeQ(turn('head'), axisTurns(v(1, 0, 0), 0.125));
    show({ clips: [{ name: 'nod', time: 1, weight: 3, loop: false }] });
    closeQ(turn('head'), axisTurns(v(1, 0, 0), 0.25));
  });

  it('give the same pose for the same moment, and the rest pose when they stop', async () => {
    const { show, turn } = await placed();
    const motion = {
      clips: [
        { name: 'nod', time: 0.3, weight: 0.7 },
        { name: 'shake', time: 0.8, weight: 0.4 },
      ],
    };
    show(motion);
    const first = turn('head');
    show({ clips: [{ name: 'shake', time: 0.1, weight: 1 }] });
    show(motion);
    expect(turn('head')).toEqual(first);
    show({});
    closeQ(turn('head'), { x: 0, y: 0, z: 0, w: 1 });
  });

  it('have the joints turned on top of them', async () => {
    const { show, turn } = await placed();
    const shake = axisTurns(v(0, 1, 0), 0.1);
    show(
      { clips: [{ name: 'nod', time: 1, weight: 1, loop: false }] },
      IDENTITY,
      still(new Map([[head, shake]])),
    );
    closeQ(turn('head'), mul(axisTurns(v(1, 0, 0), 0.25), shake));
  });
});

describe('reaching', () => {
  // Out at x = 2, turned a quarter to the left, so the arm points along -Z.
  const where: Transform = {
    ...IDENTITY,
    position: v(2, 1, 0),
    rotation: axisTurns(v(0, 1, 0), 0.25),
  };
  const reach = (target: Vec3) => ({
    reach: [
      { root: armJoints[1]!, middle: armJoints[2]!, end: armJoints[3]!, target, pole: v(2, 3, 0) },
    ],
  });

  it('puts the hand on a point in reach, keeping the arm its length', async () => {
    const { show, at } = await placed(arm, 'Prop');
    show({}, where);
    closeV(at('tip'), v(2, 1, -0.9));
    const target = v(2.2, 1.1, -0.6);
    show(reach(target), where);
    closeV(at('tip'), target);
    const bone = (a: Vec3, b: Vec3) => Math.hypot(a.x - b.x, a.y - b.y, a.z - b.z);
    expect(bone(at('upper'), at('lower'))).toBeCloseTo(0.3, 4);
    expect(bone(at('lower'), at('tip'))).toBeCloseTo(0.3, 4);
    // The elbow bends up, towards the pole.
    expect(at('lower').y).toBeGreaterThan(1.05);
  });

  it('points at a point out of reach, and goes back when it stops', async () => {
    const { show, at } = await placed(arm, 'Prop');
    show(reach(v(2, 1, -3)), where);
    closeV(at('tip'), v(2, 1, -0.9));
    show(reach(v(4, 1, -0.3)), where);
    expect(at('tip').x).toBeGreaterThan(2.55);
    show({}, where);
    closeV(at('tip'), v(2, 1, -0.9));
  });
});

describe('looking', () => {
  it('turns the head to face a point, within its limit', async () => {
    const { show, node } = await placed();
    const facing = () => {
      const { x, y, z, w } = node('head').absoluteRotationQuaternion;
      return rotate({ x, y, z, w }, v(0, 0, 1));
    };
    show({ look: [{ joint: head, target: v(1, 0.8, 1) }] });
    closeV(facing(), v(Math.SQRT1_2, 0, Math.SQRT1_2), 4);
    show({ look: [{ joint: head, target: v(0, 0.8, -1) }] });
    expect(Math.acos(facing().z) / (2 * Math.PI)).toBeCloseTo(0.2, 4);
    show({ look: [{ joint: head, target: v(0, 0.8, -1), limit: 0.5 }] });
    closeV(facing(), v(0, 0, -1), 4);
  });

  it('looks from wherever the object is, after its clips', async () => {
    const { show, node } = await placed();
    const where: Transform = { ...IDENTITY, position: v(-3, 0, 2) };
    show(
      {
        clips: [{ name: 'shake', time: 1, weight: 1, loop: false }],
        look: [{ joint: head, target: v(-3, 0.8, 5), limit: 0.3 }],
      },
      where,
    );
    const { x, y, z, w } = node('head').absoluteRotationQuaternion;
    closeV(rotate({ x, y, z, w }, v(0, 0, 1)), v(0, 0, 1), 4);
  });
});
