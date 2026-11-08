import { DirectionalLight } from '@babylonjs/core/Lights/directionalLight.js';
import { Scene } from '@babylonjs/core/scene.js';
import {
  CAMERA,
  IDENTITY,
  SCENE,
  backstageId,
  jointName,
  micros,
  objectId,
} from '@storystage/story-api';
import { describe, expect, it } from 'vitest';
import { BACKDROP_TEMPLATES, resolveBackdrop } from '../backdrops.ts';
import { SETUP, cmd, describeStageContract } from '../testing/conformance.ts';
import { FakeStage } from '../testing/fake-stage.ts';
import { buildBackdrop } from './backdrop.ts';
import { headlessEngine } from './headless.ts';
import { BabylonStage } from './stage.ts';

describeStageContract('BabylonStage', () => new BabylonStage(headlessEngine()));

const cat = objectId('cat');
const dog = objectId('dog');
const backdropScene = (id: string) => {
  const template = BACKDROP_TEMPLATES.find((t) => t.id === id)!;
  const scene = new Scene(headlessEngine());
  scene.useRightHandedSystem = true;
  buildBackdrop(scene, resolveBackdrop(template.backdrop));
  return scene;
};

describe('BabylonStage', () => {
  it('works out the same scene as the fake stage', async () => {
    const commands = [
      cmd(0, 0, { object: cat, kind: 'vehicle', vehicle: dog }),
      cmd(0, 1, { object: dog, kind: 'translate', by: { x: 1, y: 0, z: 2 }, space: 'scene' }),
      cmd(0.5, 1, {
        object: dog,
        kind: 'rotate',
        axis: { x: 0, y: 1, z: 0 },
        turns: 0.3,
        space: 'self',
      }),
      cmd(1, 0.5, { object: CAMERA, kind: 'moveTo', target: dog }),
    ];
    const real = new BabylonStage(headlessEngine());
    const fake = new FakeStage();
    for (const stage of [real, fake]) {
      await stage.load(SETUP);
      stage.schedule(commands);
    }
    for (const t of [0, 0.4, 0.9, 1.2, 2]) {
      real.seek(micros(t));
      fake.seek(micros(t));
      expect(real.stateHash()).toBe(fake.stateHash());
    }
  });

  it('looks along +Z with +X on the left of the picture, as spec 02 says', async () => {
    const stage = new BabylonStage(headlessEngine());
    await stage.load({
      ...SETUP,
      objects: [
        {
          id: cat,
          model: { standIn: 'cat' },
          class: 'Quadruped',
          transform: { ...IDENTITY, position: { x: 1, y: 0, z: 4 } },
        },
      ],
      camera: { transform: { ...IDENTITY, position: { x: 0, y: 0.5, z: -6 } } },
    });
    const scene = (stage as unknown as { scene: Scene }).scene;
    scene.render();
    const hitAt = (x: number) => scene.pick(x, 180)?.pickedMesh?.name;
    // 1 m left at 10 m, with a 640 × 360 picture and a vertical angle of 0.5 radians.
    const metres = 1 / (10 * Math.tan(0.25) * 2);
    const left = 320 - metres * 360;
    expect(hitAt(left)).toBe('cat body');
    expect(hitAt(640 - left)).toBeUndefined();
  });

  it('keeps the old scene if the new one cannot load', async () => {
    const stage = new BabylonStage(headlessEngine());
    await stage.load(SETUP);
    await expect(
      stage.load({ ...SETUP, backdrop: { ground: backstageId('storystage/Ground/cheese') } }),
    ).rejects.toMatchObject({ code: 'unknown_model' });
    expect(stage.objects()).toContain(cat);
    await expect(stage.renderFrame()).resolves.toBeDefined();
  });

  it('has nothing to draw before a scene is loaded', async () => {
    await expect(new BabylonStage(headlessEngine()).renderFrame()).rejects.toMatchObject({
      code: 'bad_argument',
    });
  });

  it('gives a frame the size of the picture', async () => {
    const stage = new BabylonStage(headlessEngine());
    await stage.load(SETUP);
    const frame = await stage.renderFrame();
    expect(frame.data).toHaveLength(frame.width * frame.height * 4);
    expect(frame.width).toBe(640);
  });

  it('tells when two stand-ins touch by their size, not their distance', async () => {
    const stage = new BabylonStage(headlessEngine());
    await stage.load(SETUP);
    const touching = (t: number) =>
      stage.answer({ kind: 'isColliding', a: cat, b: dog, at: micros(t) }).value;
    expect(touching(0)).toBe(false);
    stage.schedule([
      cmd(0, 1, { object: cat, kind: 'translate', by: { x: 1.6, y: 0, z: 0 }, space: 'scene' }),
    ]);
    expect(touching(1)).toBe(true);
    expect(stage.answer({ kind: 'isColliding', a: cat, b: CAMERA, at: 0 }).value).toBe(false);
  });

  it('shows a program’s sky, light, fog and lens as they change', async () => {
    const stage = new BabylonStage(headlessEngine());
    await stage.load(SETUP);
    const scene = (stage as unknown as { scene: Scene }).scene;
    const below = scene.getLightByName('below') as DirectionalLight;
    stage.schedule([
      cmd(0, 1, { object: SCENE, kind: 'atmosphere', colour: '#000000' }),
      cmd(0, 0, { object: SCENE, kind: 'light', from: 'below', colour: 'red' }),
      cmd(0, 1, { object: SCENE, kind: 'fog', density: 0.5 }),
      cmd(0, 1, { object: CAMERA, kind: 'lens', verticalAngle: 0.1 }),
    ]);
    stage.seek(micros(1));
    expect(scene.clearColor.r).toBe(0);
    expect(below.diffuse.r).toBe(1);
    expect(scene.fogMode).toBe(Scene.FOGMODE_EXP);
    expect(scene.fogDensity).toBeCloseTo(0.125, 6);
    expect(scene.activeCamera!.fov).toBeCloseTo(0.1 * 2 * Math.PI, 6);
    stage.seek(0);
    expect(scene.fogMode).toBe(Scene.FOGMODE_NONE);
    expect(scene.activeCamera!.fov).toBeCloseTo(0.5, 6);
  });

  it('agrees with the fake stage on stand-ins’ sizes and joints', async () => {
    const real = new BabylonStage(headlessEngine());
    const fake = new FakeStage();
    const commands = [
      cmd(0, 1, { object: cat, kind: 'place', relation: 'behind', target: dog, gap: 1 }),
      cmd(1, 1, { object: CAMERA, kind: 'moveAndOrientTo', target: cat, goodView: true }),
      cmd(2, 1, { object: dog, kind: 'moveTo', target: { object: cat, joint: jointName('head') } }),
    ];
    for (const stage of [real, fake]) {
      await stage.load(SETUP);
      stage.schedule(commands);
    }
    for (const t of [0.5, 1.5, 3]) {
      real.seek(micros(t));
      fake.seek(micros(t));
      expect(real.stateHash()).toBe(fake.stateHash());
    }
  });
});

describe('the backdrop', () => {
  it('lights a scene as Alice does: ambient, three from above, one from below', () => {
    const scene = backdropScene('grass');
    expect(scene.lights).toHaveLength(5);
    const fromAbove = scene.lights.filter(
      (l): l is DirectionalLight => l instanceof DirectionalLight && l.direction.y < 0,
    );
    expect(fromAbove).toHaveLength(3);
    expect(fromAbove.every((l) => l.intensity === 0.533)).toBe(true);
    const across = fromAbove.reduce(
      (sum, l) => sum.add(l.direction),
      fromAbove[0]!.direction.scale(0),
    );
    expect(Math.hypot(across.x, across.z)).toBeCloseTo(0, 6);
  });

  it('colours the sky and fades fog to it', () => {
    const scene = backdropScene('seaFloor');
    expect(scene.clearColor.b).toBeCloseTo(0.859, 3);
    expect(scene.fogMode).toBe(Scene.FOGMODE_EXP);
    expect(scene.fogDensity).toBeCloseTo(0.027, 6);
    expect(scene.fogColor.b).toBeCloseTo(0.859, 3);
    expect(backdropScene('grass').fogMode).toBe(Scene.FOGMODE_NONE);
  });

  it('builds a ground, and a room with walls and a ceiling', () => {
    const names = (id: string) => backdropScene(id).meshes.map((m) => m.name);
    expect(names('grass')).toEqual(['ground']);
    expect(names('room')).toEqual(['ground', 'wall', 'wall', 'wall', 'wall', 'ceiling']);
  });

  it('builds every template', () => {
    for (const t of BACKDROP_TEMPLATES) expect(backdropScene(t.id).lights, t.id).toHaveLength(5);
  });
});
