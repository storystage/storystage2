import { Material } from '@babylonjs/core/Materials/material.js';
import { Color3 } from '@babylonjs/core/Maths/math.color.js';
import { PBRMaterial } from '@babylonjs/core/Materials/PBR/pbrMaterial.js';
import { StandardMaterial } from '@babylonjs/core/Materials/standardMaterial.js';
import { Texture } from '@babylonjs/core/Materials/Textures/texture.js';
import { Logger } from '@babylonjs/core/Misc/logger.js';
import { Scene } from '@babylonjs/core/scene.js';
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
import { describe, expect, it, vi } from 'vitest';
import { SETUP, cmd } from '../testing/conformance.ts';
import { headlessEngine } from './headless.ts';
import { Body } from '../humanoid/body.ts';
import { glow, ModelLibrary, modelsFromManifest, type ModelSource } from './models.ts';
import { BabylonStage } from './stage.ts';
import { ObjectView } from './view.ts';
import { tinyHumanUrl, tinyModelUrl, tinySkeletonUrl, tinyTwinsUrl } from './tiny-model.ts';

const head = jointName('head');
const robot = backstageId('test/Biped/robot');
const url = tinyModelUrl(['hips', 'spine', 'chest', 'neck', 'head']);
/** The tiny model's blue, 0.6 in its file (linear), as it shows on screen (sRGB). */
const SHOWN_BLUE = Math.pow(0.6, 1 / 2.2);
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

  it('that Backstage does not have, or that will not load, show as stand-ins (spec 03, 1.3)', async () => {
    const ghost = backstageId('test/Biped/ghost');
    const missing = new BabylonStage(headlessEngine(), { models: source });
    await missing.load({ ...setup, objects: [place(ann, 0, ghost), place(bob, 2)] });
    // The scene plays on, the missing one as a stand-in with its model's name, and it says so.
    expect(missing.objects()).toEqual(expect.arrayContaining([ann, bob]));
    expect(missing.missing()).toEqual([{ kind: 'model', object: ann, model: ghost }]);
    expect(missing.joints(ann)).toContain(head);
    const broken = new BabylonStage(headlessEngine(), {
      models: { find: () => ({ url: 'data:model/gltf-binary;base64,AAAA', joints: [] }) },
    });
    await broken.load(setup);
    expect(broken.missing().map((m) => m.kind)).toEqual(['model', 'model']);
    const none = new BabylonStage(headlessEngine());
    await none.load(setup);
    expect(none.missing()).toHaveLength(2);
    // A scene with everything found has nothing missing.
    const found = new BabylonStage(headlessEngine(), { models: source });
    await found.load(setup);
    expect(found.missing()).toEqual([]);
  });

  it("walk an animal with its own clip, as fast as its toe sweeps (S4's clip names, 18 Nov)", async () => {
    // A leg 0.5 m long that swings a twelfth of a turn over its 1 s walk: its toe sweeps
    // 0.5 sin 30° = 0.25 m, so the walk goes 0.25 / 0.65 m a second.
    const animal = backstageId('test/Quadruped/animal');
    const toe = jointName('frontLeftToe');
    const file = tinySkeletonUrl(
      [{ name: 'spineBase' }, { name: 'frontLeftToe', parent: 'spineBase', at: [0, -0.5, 0] }],
      {
        clips: [
          { name: 'walk', bone: 'spineBase', axis: [1, 0, 0], turns: 1 / 12 },
          { name: 'iddle', bone: 'spineBase', axis: [0, 1, 0], turns: 0.01 },
        ],
      },
    );
    const stage = new BabylonStage(headlessEngine(), {
      models: {
        find: (id) => (id === animal ? { url: file, joints: [jointName('spineBase'), toe] } : null),
      },
    });
    const spot = objectId('spot');
    await stage.load({
      ...SETUP,
      objects: [{ ...place(ann, 0, animal), class: 'Quadruped' as const }],
      markers: [{ id: spot, transform: { ...IDENTITY, position: { x: 2, y: 0, z: 0 } } }],
    });
    const walk = { object: ann, kind: 'walk', to: spot, gait: 'walk' } as const;
    const seconds = stage.answer({ kind: 'naturalDuration', action: walk, at: 0 }).value as number;
    expect(seconds / 1e6).toBeCloseTo(2 / (0.25 / 0.65), 2);
  });

  it("reckon a foot below the knee for a leg mapped no lower (S4's savanna animals)", async () => {
    // A knee 0.5 m up that swings a twelfth of a turn: the ground below it sweeps
    // 0.5 sin 30° = 0.25 m, as the toe did above. The knee itself only turns where it is.
    const animal = backstageId('test/Quadruped/kneed');
    const file = tinySkeletonUrl(
      [{ name: 'spineBase' }, { name: 'frontLeftKnee', parent: 'spineBase', at: [0, 0.5, 0] }],
      { clips: [{ name: 'walk', bone: 'frontLeftKnee', axis: [1, 0, 0], turns: 1 / 12 }] },
    );
    const knee = jointName('frontLeftKnee');
    const stage = new BabylonStage(headlessEngine(), {
      models: {
        find: (id) =>
          id === animal ? { url: file, joints: [jointName('spineBase'), knee] } : null,
      },
    });
    const spot = objectId('spot');
    await stage.load({
      ...SETUP,
      objects: [{ ...place(ann, 0, animal), class: 'Quadruped' as const }],
      markers: [{ id: spot, transform: { ...IDENTITY, position: { x: 2, y: 0, z: 0 } } }],
    });
    const walk = { object: ann, kind: 'walk', to: spot, gait: 'walk' } as const;
    const seconds = stage.answer({ kind: 'naturalDuration', action: walk, at: 0 }).value as number;
    expect(seconds / 1e6).toBeCloseTo(2 / (0.25 / 0.65), 2);
  });

  it('say which posed joints the model has not got, after its model, and never for a stand-in (spec 03, 2.2)', async () => {
    const wing = jointName('leftWing');
    const turn = { x: 0, y: 0, z: 0, w: 1 };
    const posed = (id: ObjectId, x: number, model?: BackstageId) => ({
      ...place(id, x, model),
      joints: { [head]: turn, [wing]: turn },
    });
    const ghost = backstageId('test/Biped/ghost');
    const stage = new BabylonStage(headlessEngine(), { models: source });
    // Bob's model is missing, so he's a stand-in: only his model is reported.
    await stage.load({ ...setup, objects: [posed(ann, -2), posed(bob, 2, ghost)] });
    expect(stage.missing()).toEqual([
      { kind: 'joint', object: ann, joint: wing },
      { kind: 'model', object: bob, model: ghost },
    ]);
    // A load that only changes the pose keeps the scene, and says again what's missing.
    await stage.load({
      ...setup,
      objects: [{ ...posed(ann, -2), joints: { [head]: turn } }, posed(bob, 2, ghost)],
    });
    expect(stage.missing()).toEqual([{ kind: 'model', object: bob, model: ghost }]);
  });

  it('are found through a manifest', () => {
    const manifest = {
      items: [{ id: robot, files: { model: 'robot.glb' }, joints: 'prop-only' }],
    } as unknown as BackstageManifest;
    const found = modelsFromManifest(manifest, 'backstage');
    expect(found.find(robot)).toEqual({ url: 'backstage/robot.glb', joints: 'prop-only' });
    expect(found.find(backstageId('nope'))).toBeNull();
    // Manifest 2.4.0's `gait` goes on to the stage: S4's frog hops.
    const frog = backstageId('frog');
    const hopping = modelsFromManifest(
      {
        items: [{ id: frog, files: { model: 'frog.glb' }, joints: 'prop-only', gait: 'hop' }],
      } as unknown as BackstageManifest,
      'backstage',
    );
    expect(hopping.find(frog)).toEqual({
      url: 'backstage/frog.glb',
      joints: 'prop-only',
      gait: 'hop',
    });
  });

  it('share the geometry but not the skeleton or surfaces', async () => {
    const { body } = await loaded();
    expect(body(ann).material).not.toBe(body(bob).material);
    expect(body(ann).skeleton).not.toBe(body(bob).skeleton);
  });

  it('become plain surfaces that keep their colour, as it shows on screen', async () => {
    const { body } = await loaded();
    const surface = body(ann).material as StandardMaterial;
    expect(surface.getClassName()).toBe('StandardMaterial');
    // glTF gives a linear colour (0.6); a plain surface takes it as it shows, in sRGB.
    expect(surface.diffuseColor.b).toBeCloseTo(SHOWN_BLUE, 5);
    expect(surface.specularColor.r).toBe(0);
  });

  it("keep their own light, as glTF adds it to the lit colour (S4's Sun, 21 Nov)", async () => {
    const lamp = backstageId('test/Prop/lamp');
    const lampUrl = tinyModelUrl(['hips'], { emissive: [1, 0.5, 0] });
    const stage = new BabylonStage(headlessEngine(), {
      models: { find: (id) => (id === lamp ? { url: lampUrl, joints: [] } : source.find(id)) },
    });
    await stage.load({ ...SETUP, objects: [place(ann, 0, lamp), place(bob, 2)] });
    const inside = (stage as unknown as { scene: Scene }).scene;
    const surface = (id: ObjectId) =>
      inside
        .getTransformNodeByName(id)!
        .getChildMeshes()
        .find((m) => m.name === 'Body')!.material as StandardMaterial;
    const lit = surface(ann);
    expect(lit.useEmissiveAsIllumination).toBe(true);
    // glTF's colour is linear; a plain surface takes it as it shows, in sRGB.
    expect(lit.emissiveColor.r).toBeCloseTo(1, 5);
    expect(lit.emissiveColor.g).toBeCloseTo(Math.pow(0.5, 1 / 2.2), 5);
    expect(lit.emissiveColor.b).toBe(0);
    // A surface with no light of its own is lit only by the scene.
    expect(surface(bob).useEmissiveAsIllumination).toBe(false);
    expect(surface(bob).emissiveColor.r).toBe(0);
  });

  it("keep a picture of their own light at the colour's level (S4's review, 21 Nov)", () => {
    const scene = new Scene(headlessEngine());
    const source = new PBRMaterial('lamp', scene);
    const picture = new Texture(null, scene);
    source.emissiveTexture = picture;
    source.emissiveColor = new Color3(0.5, 0.5, 0.5);
    const plain = new StandardMaterial('plain lamp', scene);
    glow(plain, source);
    expect(plain.emissiveTexture).toBe(picture);
    expect(picture.level).toBe(0.5);
    // The picture is the light; the colour adds none of its own.
    expect(plain.emissiveColor.equals(Color3.Black())).toBe(true);
    expect(plain.useEmissiveAsIllumination).toBe(true);
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

describe('a mesh on several nodes', () => {
  const twins = backstageId('test/Prop/twins');
  const models: ModelSource = { find: () => ({ url: tinyTwinsUrl(), joints: 'prop-only' }) };
  const parts = (inside: Scene, id: ObjectId) =>
    inside
      .getTransformNodeByName(id)!
      .getChildMeshes()
      .filter((m) => m.getTotalVertices() > 0);

  it("loads, each node with a surface of its own object's (S4's six, 22 Nov)", async () => {
    const stage = new BabylonStage(headlessEngine(), { models });
    await stage.load({ ...SETUP, objects: [place(ann, -2, twins), place(bob, 2, twins)] });
    expect(stage.missing()).toEqual([]);
    const inside = (stage as unknown as { scene: Scene }).scene;
    const [left, right] = parts(inside, ann);
    expect(left!.material!.getClassName()).toBe('StandardMaterial');
    expect(right!.material).toBe(left!.material);
    expect(parts(inside, bob)[0]!.material).not.toBe(left!.material);
  });

  it('fades every node, which an instance would not', async () => {
    const stage = new BabylonStage(headlessEngine(), { models });
    await stage.load({
      ...SETUP,
      objects: [{ ...place(ann, -2, twins), opacity: 0.5 }, place(bob, 2, twins)],
    });
    stage.seek(micros(0));
    const inside = (stage as unknown as { scene: Scene }).scene;
    expect(parts(inside, ann).map((m) => [m.isAnInstance, m.visibility])).toEqual([
      [false, 0.5],
      [false, 0.5],
    ]);
    expect(parts(inside, bob).map((m) => m.visibility)).toEqual([1, 1]);
  });
});

describe("a VRM's own bone table", () => {
  const placed = async (url: string) => {
    const library = new ModelLibrary(new Scene(headlessEngine()), {
      find: () => ({ url, joints: [] }),
    });
    return (await library.place(ann, robot, 'Biped')).shape;
  };

  for (const [version, facing] of [
    ['0.x', 'back'],
    ['1.0', 'front'],
  ] as const)
    it(`says which node is which bone, whatever it's called (VRM ${version})`, async () => {
      const shape = await placed(tinyHumanUrl({ facing, byTable: true }));
      const named = await placed(tinyHumanUrl({ facing }));
      expect([...shape.jointPlaces.keys()].sort()).toEqual([...named.jointPlaces.keys()].sort());
      for (const [joint, at] of named.jointPlaces) {
        const got = shape.jointPlaces.get(joint)!;
        for (const axis of ['x', 'y', 'z'] as const) expect(got[axis]).toBeCloseTo(at[axis], 5);
      }
      expect(Body.of(shape.jointPlaces)).not.toBeNull();
    });

  it('wins over another node that has the bone’s name', async () => {
    const url = tinySkeletonUrl(
      [
        { name: 'Pelvis1', at: [0, 1, 0] },
        { name: 'hips', at: [0, 3, 0] },
      ],
      { extensions: { VRMC_vrm: { humanoid: { humanBones: { hips: { node: 0 } } } } } },
    );
    expect((await placed(url)).jointPlaces.get(jointName('hips'))!.y).toBeCloseTo(1, 5);
  });

  it("takes VRM 0.x's thumb as VRM 1.0 names it, one bone along", async () => {
    const humanBones = ['Proximal', 'Intermediate', 'Distal'].map((part, node) => ({
      bone: `leftThumb${part}`,
      node,
    }));
    const url = tinySkeletonUrl(
      [1, 2, 3].map((y) => ({ name: `T${y}`, at: [0, y, 0] as const })),
      { extensions: { VRM: { humanoid: { humanBones } } } },
    );
    const at = (await placed(url)).jointPlaces;
    expect(
      ['Metacarpal', 'Proximal', 'Distal'].map((p) => at.get(jointName(`leftThumb${p}`))!.y),
    ).toEqual([1, 2, 3]);
  });

  it('leaves the bones it says nothing of to their names', async () => {
    const url = tinySkeletonUrl([{ name: 'Hips' }, { name: 'LeftToeBase', parent: 'Hips' }], {
      extensions: { VRMC_vrm: { humanoid: { humanBones: { hips: { node: 0 } } } } },
    });
    expect((await placed(url)).jointPlaces.has(jointName('leftToes'))).toBe(true);
  });

  it('is passed over where it makes no sense', async () => {
    const humanBones = [null, { bone: 7, node: 0 }, { bone: 'head', node: 99 }, { bone: 'neck' }];
    const url = tinySkeletonUrl([{ name: 'hips' }], {
      extensions: { VRM: { humanoid: { humanBones } } },
    });
    expect([...(await placed(url)).jointPlaces.keys()]).toEqual(['hips']);
  });
});

describe('a joint listed under its own name', () => {
  it("is never a node that is already another joint (S4's review of #648)", async () => {
    const library = new ModelLibrary(new Scene(headlessEngine()), {
      find: () => ({ url: tinySkeletonUrl([{ name: 'Hips' }]), joints: [jointName('Hips')] }),
    });
    const { jointPlaces } = (await library.place(ann, robot, 'Biped')).shape;
    expect([...jointPlaces.keys()]).toEqual(['hips']);
  });
});

describe('a model that fails unexpectedly', () => {
  it('is a stand-in, leaves nothing half placed, and says why in the log', async () => {
    const log = vi.spyOn(Logger, 'Error').mockImplementation(() => {});
    const odd = backstageId('test/Biped/odd');
    // Joints that can't be read: placing fails after the copy is in the scene.
    const models: ModelSource = {
      find: (id) => (id === odd ? { url, joints: null as never } : source.find(id)),
    };
    const stage = new BabylonStage(headlessEngine(), { models });
    await stage.load({ ...SETUP, objects: [place(ann, -2, odd), place(bob, 2)] });
    expect(stage.missing()).toEqual([{ kind: 'model', object: ann, model: odd }]);
    const inside = (stage as unknown as { scene: Scene }).scene;
    expect(inside.transformNodes.filter((n) => n.name === ann).length).toBeLessThanOrEqual(1);
    // Only bob's: none of ann's failed copy.
    expect(inside.meshes.filter((m) => m.name === 'Body')).toHaveLength(1);
    expect(String(log.mock.calls[0]![0])).toContain(odd);
    log.mockRestore();
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

  it('blend what is part faded, and only that (opaque glTF said never to blend, #117)', async () => {
    const { stage, body } = await loaded();
    stage.schedule([
      cmd(0, 1, { object: ann, kind: 'opacity', to: 0.5 }),
      cmd(1, 1, { object: ann, kind: 'opacity', to: 1 }),
    ]);
    const blends = (id: ObjectId) => body(id).material!.needAlphaBlendingForMesh(body(id));
    expect(blends(ann)).toBe(false);
    stage.seek(micros(1));
    expect(blends(ann)).toBe(true);
    expect(blends(bob)).toBe(false);
    stage.seek(micros(2));
    expect(blends(ann)).toBe(false);
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
    // Drawn as one shape: its nearer parts hide its farther ones (draw-order.ts).
    expect(body(ann).material!.needDepthPrePass).toBe(true);
    expect((body(ann).material as StandardMaterial).diffuseColor.r).toBe(1);
    expect((body(ann).material as StandardMaterial).diffuseColor.b).toBe(0);
    expect(root(bob).isEnabled()).toBe(false);
  });

  it("are as set up after loading draws a cut-out part faded, unseen (S4's review of #649)", async () => {
    const warm = vi.spyOn(ObjectView.prototype, 'warm');
    const cutOut = backstageId('test/Prop/cut-out');
    const stage = new BabylonStage(headlessEngine(), {
      models: {
        find: () => ({ url: tinySkeletonUrl([{ name: 'hips' }], { cutOut: true }), joints: [] }),
      },
    });
    await stage.load({
      ...setup,
      objects: [
        { ...place(ann, -2, cutOut), class: 'Prop' },
        { ...place(bob, 2, cutOut), class: 'Prop', opacity: 0 },
      ],
    });
    expect(warm).toHaveBeenCalledWith(true);
    warm.mockRestore();
    const inside = (stage as unknown as { scene: Scene }).scene;
    const root = (id: ObjectId) => inside.getTransformNodeByName(id)!;
    const body = (id: ObjectId) =>
      root(id)
        .getChildMeshes()
        .find((m) => m.name === 'Body')!;
    expect(body(ann).material!.transparencyMode).toBe(Material.MATERIAL_ALPHATEST);
    expect(body(ann).material!.needDepthPrePass).toBe(false);
    expect(body(ann).visibility).toBe(1);
    expect(root(ann).isEnabled()).toBe(true);
    expect(body(bob).visibility).toBe(0);
    expect(root(bob).isEnabled()).toBe(false);
  });

  it("are drawn part faded, unseen, as a scene loads, the pre-pass's shader too (S4's review of #667)", async () => {
    const original = ObjectView.prototype.warm;
    const prePassed: boolean[] = [];
    const warm = vi.spyOn(ObjectView.prototype, 'warm').mockImplementation(function (
      this: ObjectView,
      on: boolean | null,
    ) {
      original.call(this, on);
      if (on) prePassed.push(this.meshes.every((m) => m.material?.needDepthPrePass === true));
    });
    const stage = new BabylonStage(headlessEngine(), {
      models: { find: () => ({ url: tinySkeletonUrl([{ name: 'hips' }]), joints: [] }) },
    });
    await stage.load({ ...setup, objects: [{ ...place(ann, -2, robot), class: 'Prop' }] });
    warm.mockRestore();
    expect(prePassed).toEqual([true]);
    const inside = (stage as unknown as { scene: Scene }).scene;
    const body = inside
      .getTransformNodeByName(ann)!
      .getChildMeshes()
      .find((m) => m.name === 'Body')!;
    expect(body.material!.needDepthPrePass).toBe(false);
    expect(body.visibility).toBe(1);
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
    expect(colour().b).toBeCloseTo(SHOWN_BLUE, 5);
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
