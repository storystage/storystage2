import { backstageId, IDENTITY, jointName, objectId, type SceneSetup } from '@storystage/story-api';
import { describe, expect, it } from 'vitest';
import { inOrder } from './missing.ts';

const turn = { x: 0, y: 0, z: 0, w: 1 };
const wing = jointName('leftWing');
const head = jointName('head');
const [a, b, c] = [objectId('a'), objectId('b'), objectId('c')];
const owl = backstageId('test/Flyer/owl');
const ghost = backstageId('test/Biped/ghost');
const sky = backstageId('storystage/Sky/clearDay');
const object = (id: typeof a, model: SceneSetup['objects'][number]['model']) => ({
  id,
  model,
  class: 'Biped' as const,
  transform: IDENTITY,
  joints: { [head]: turn, [wing]: turn },
});
const setup: SceneSetup = {
  backdrop: {},
  objects: [object(a, ghost), object(b, owl), object(c, { standIn: 'box' })],
  camera: { transform: IDENTITY },
  markers: [],
};

describe("what a scene couldn't find", () => {
  it('is the backdrop first, then each object in set-up order, its model or its pose', () => {
    // Found in any order, with a stale joint entry from before.
    const found = [
      { kind: 'model', object: a, model: ghost },
      { kind: 'joint', object: b, joint: head },
      { kind: 'backdrop', id: sky },
    ] as const;
    expect(inOrder(setup, found, () => [head])).toEqual([
      { kind: 'backdrop', id: sky },
      // A's model is missing, so its pose isn't reported; C is a stand-in.
      { kind: 'model', object: a, model: ghost },
      { kind: 'joint', object: b, joint: wing },
    ]);
  });
});
