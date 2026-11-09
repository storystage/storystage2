import type { Scene } from '@babylonjs/core/scene.js';
import type { StandardMaterial } from '@babylonjs/core/Materials/standardMaterial.js';
import type { TransformNode } from '@babylonjs/core/Meshes/transformNode.js';
import {
  IDENTITY,
  backstageId,
  jointName,
  micros,
  objectId,
  type BackstageId,
  type ObjectId,
  type SceneSetup,
} from '@storystage/story-api';
import type { BackstageManifest } from '@storystage/backstage';
import { describe, expect, it } from 'vitest';
import { SETUP, cmd } from '../testing/conformance.ts';
import { headlessEngine } from './headless.ts';
import { modelsFromManifest, type ModelSource } from './models.ts';
import { BabylonStage } from './stage.ts';
import { tinyModelUrl } from './tiny-model.ts';

const head = jointName('head');
const robot = backstageId('test/Biped/robot');
const url = tinyModelUrl(['hips', 'spine', 'chest', 'neck', 'head']);
const source: ModelSource = {
  find: (id) => (id === robot ? { url, joints: [jointName('neck'), head] } : null),
};

const ann = objectId('ann');
const bob = objectId('bob');
const place = (id: ObjectId, x: number, model: BackstageId = robot) => ({
  id,
  model,
  class: 'Biped' as const,
  transform: { ...IDENTITY, position: { x, y: 0, z: 0 } },
});
const setup: SceneSetup = { ...SETUP, objects: [place(ann, -2), place(bob, 2)] };

async function loaded(scene: SceneSetup = setup) {
  const stage = new BabylonStage(headlessEngine(), { models: source });
  await stage.load(scene);
  const inside = (stage as unknown as { scene: Scene }).scene;
  const root = (id: ObjectId) => inside.getTransformNodeByName(id)!;
  const node = (id: ObjectId, name: string) =>
    root(id)
      .getDescendants(false)
      .find((n) => n.name === name) as TransformNode;
  const body = (id: ObjectId) =>
    root(id)
      .getChildMeshes()
      .find((m) => m.name === 'Body')!;
  return { stage, inside, root, node, body };
}

describe('models', () => {
  it('load, and list the joints from their Backstage entry', async () => {
    const { stage, body } = await loaded();
    expect(stage.joints(ann)).toEqual([jointName('neck'), head]);
    expect(body(ann)).toBeDefined();
  });

  it('refuse a model Backstage does not have, or a file that will not load', async () => {
    const missing = new BabylonStage(headlessEngine(), { models: source });
    const nothing = { ...setup, objects: [place(ann, 0, backstageId('test/Biped/ghost'))] };
    await expect(missing.load(nothing)).rejects.toMatchObject({ code: 'unknown_model' });
    const broken = new BabylonStage(headlessEngine(), {
      models: { find: () => ({ url: 'data:model/gltf-binary;base64,AAAA', joints: [] }) },
    });
    await expect(broken.load(setup)).rejects.toMatchObject({ code: 'unknown_model' });
    await expect(new BabylonStage(headlessEngine()).load(setup)).rejects.toMatchObject({
      code: 'unknown_model',
    });
  });

  it('are found through a manifest', () => {
    const manifest = {
      items: [{ id: robot, files: { model: 'robot.glb' }, joints: 'prop-only' }],
    } as unknown as BackstageManifest;
    const found = modelsFromManifest(manifest, 'backstage');
    expect(found.find(robot)).toEqual({ url: 'backstage/robot.glb', joints: 'prop-only' });
    expect(found.find(backstageId('nope'))).toBeNull();
  });

  it('share the geometry but not the skeleton or surfaces', async () => {
    const { body } = await loaded();
    expect(body(ann).material).not.toBe(body(bob).material);
    expect(body(ann).skeleton).not.toBe(body(bob).skeleton);
  });

  it('become plain surfaces that keep their colour', async () => {
    const { body } = await loaded();
    const surface = body(ann).material as StandardMaterial;
    expect(surface.getClassName()).toBe('StandardMaterial');
    expect(surface.diffuseColor.b).toBeCloseTo(0.6, 5);
    expect(surface.specularColor.r).toBe(0);
  });

  it('turn a joint on top of its pose, and only on that object', async () => {
    const { stage, node } = await loaded();
    const axis = { x: 0, y: 1, z: 0 };
    stage.schedule([cmd(0, 1, { object: ann, kind: 'joint', joint: head, axis, turns: 0.25 })]);
    stage.seek(micros(1));
    expect(Math.abs(node(ann, 'head').rotationQuaternion!.y)).toBeCloseTo(Math.SQRT1_2, 5);
    expect(node(bob, 'head').rotationQuaternion!.y).toBeCloseTo(0, 5);
    stage.seek(0);
    expect(node(ann, 'head').rotationQuaternion!.y).toBeCloseTo(0, 5);
  });

  it('drive the skin from the node a joint turns', async () => {
    const { node, body } = await loaded();
    const bone = body(ann).skeleton!.bones.find((b) => b.name === 'head')!;
    expect(bone.getTransformNode()).toBe(node(ann, 'head'));
  });

  it('are measured for touching', async () => {
    const { stage } = await loaded({ ...setup, objects: [place(ann, 0), place(bob, 0.9)] });
    expect(stage.answer({ kind: 'isColliding', a: ann, b: bob, at: 0 }).value).toBe(true);
    const apart = await loaded({ ...setup, objects: [place(ann, 0), place(bob, 1.1)] });
    expect(apart.stage.answer({ kind: 'isColliding', a: ann, b: bob, at: 0 }).value).toBe(false);
  });

  it('measure a stand-in by the size it carries (StandIn.size)', async () => {
    // A table 2 m wide at x = -1 reaches to x = 0; a robot a metre wide at 0.2 overlaps it.
    const table = (x: number) => ({
      id: bob,
      model: { standIn: 'table', size: { x: 2, y: 0.75, z: 1 } },
      class: 'Prop' as const,
      transform: { ...IDENTITY, position: { x, y: 0, z: 0 } },
    });
    const near = await loaded({ ...setup, objects: [place(ann, 0.2), table(-1)] });
    expect(near.stage.answer({ kind: 'isColliding', a: ann, b: bob, at: 0 }).value).toBe(true);
    const far = await loaded({ ...setup, objects: [place(ann, 1.5), table(-1.5)] });
    expect(far.stage.answer({ kind: 'isColliding', a: ann, b: bob, at: 0 }).value).toBe(false);
  });
});

describe('opacity and paint', () => {
  it('fade every part of an object, and hide it at nothing', async () => {
    const { stage, root, body } = await loaded();
    stage.schedule([
      cmd(0, 1, { object: ann, kind: 'opacity', to: 0.5 }),
      cmd(1, 1, { object: ann, kind: 'opacity', to: 0 }),
    ]);
    stage.seek(micros(1));
    expect(body(ann).visibility).toBeCloseTo(0.5, 5);
    expect(root(ann).isEnabled()).toBe(true);
    stage.seek(micros(2));
    expect(root(ann).isEnabled()).toBe(false);
    stage.seek(0);
    expect(body(ann).visibility).toBe(1);
    expect(root(ann).isEnabled()).toBe(true);
  });

  it('start from the set-up', async () => {
    const { body, root } = await loaded({
      ...setup,
      objects: [
        { ...place(ann, 0), opacity: 0.25, paint: 'red' },
        { ...place(bob, 2), opacity: 0 },
      ],
    });
    expect(body(ann).visibility).toBe(0.25);
    expect((body(ann).material as StandardMaterial).diffuseColor.r).toBe(1);
    expect((body(ann).material as StandardMaterial).diffuseColor.b).toBe(0);
    expect(root(bob).isEnabled()).toBe(false);
  });

  it('paint a name or a colour, and go back to the model on the way back', async () => {
    const { stage, body } = await loaded();
    const colour = () => (body(ann).material as StandardMaterial).diffuseColor;
    stage.schedule([
      cmd(1, 0, { object: ann, kind: 'paint', paint: 'orange' }),
      cmd(2, 0, { object: ann, kind: 'paint', paint: '#336699' }),
    ]);
    stage.seek(micros(1));
    expect(colour().g).toBeCloseTo(200 / 255, 5);
    stage.seek(micros(2));
    expect(colour().r).toBeCloseTo(0.2, 5);
    stage.seek(0);
    expect(colour().b).toBeCloseTo(0.6, 5);
  });

  it('paint a stand-in, but leave its nose', async () => {
    const stage = new BabylonStage(headlessEngine());
    await stage.load(SETUP);
    const inside = (stage as unknown as { scene: Scene }).scene;
    const colour = (mesh: string) =>
      (inside.getMeshByName(mesh)!.material as StandardMaterial).diffuseColor;
    const nose = colour('cat nose').clone();
    stage.schedule([cmd(0, 0, { object: objectId('cat'), kind: 'paint', paint: 'red' })]);
    stage.seek(1);
    expect(colour('cat body').r).toBe(1);
    expect(colour('cat nose').r).toBe(nose.r);
  });
});

describe('stand-ins', () => {
  it("take their class's joints, so code written for the real model still runs", async () => {
    const stage = new BabylonStage(headlessEngine());
    await stage.load(SETUP);
    const cat = objectId('cat');
    expect(stage.joints(cat)).toContain(head);
    const axis = { x: 0, y: 1, z: 0 };
    stage.schedule([cmd(0, 1, { object: cat, kind: 'joint', joint: head, axis, turns: 0.1 })]);
    expect(() => stage.seek(micros(1))).not.toThrow();
  });
});
