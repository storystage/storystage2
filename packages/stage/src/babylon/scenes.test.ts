/** WP8.2 and 8.3: getting the next scene ready, and crossfading from one scene to the next. */
import type { Scene } from '@babylonjs/core/scene.js';
import {
  IDENTITY,
  backstageId,
  jointName,
  micros,
  objectId,
  type SceneSetup,
  type StageEvent,
} from '@storystage/story-api';
import { describe, expect, it } from 'vitest';
import { FakeStage } from '../testing/fake-stage.ts';
import { cmd } from '../testing/conformance.ts';
import { headlessEngine } from './headless.ts';
import type { ModelSource } from './models.ts';
import { BabylonStage } from './stage.ts';
import { tinyModelUrl } from './tiny-model.ts';

const robot = backstageId('test/Biped/robot');
const url = tinyModelUrl(['hips', 'spine', 'chest', 'neck', 'head']);

/** A model source that counts how often each model is asked for. */
function counting() {
  const asked = new Map<string, number>();
  const source: ModelSource = {
    find: (id) => {
      asked.set(id, (asked.get(id) ?? 0) + 1);
      return id === robot ? { url, joints: [jointName('head')] } : null;
    },
  };
  return { source, asked };
}

const ann = objectId('ann');
const bob = objectId('bob');
const scene = (id = ann, x = 0): SceneSetup => ({
  backdrop: {},
  objects: [
    { id, model: robot, class: 'Biped', transform: { ...IDENTITY, position: { x, y: 0, z: 0 } } },
  ],
  camera: { transform: { ...IDENTITY, position: { x: 0, y: 1, z: -8 } } },
  markers: [],
});

const inside = (stage: BabylonStage) =>
  stage as unknown as { scene: Scene; engine: { scenes: Scene[] } };
/** Where an object's node is drawn, in whichever scene has it. */
const drawnAt = (stage: BabylonStage, id: string) =>
  inside(stage)
    .engine.scenes.map((s) => s.getTransformNodeByName(id))
    .find((n) => n)!.position.x;

describe('preloading the next scene (8.2)', () => {
  it('fetches its models while this scene plays, and the load uses them', async () => {
    const { source, asked } = counting();
    const stage = new BabylonStage(headlessEngine(), { models: source });
    await stage.load(scene());
    await stage.preload(scene(bob));
    expect(stage.objects()).toContain(ann);
    expect(stage.objects()).not.toContain(bob);
    const before = asked.get(robot);
    await stage.load(scene(bob));
    // Placed from what was fetched ahead, not asked for again.
    expect(asked.get(robot)).toBe(before);
    expect(stage.objects()).toContain(bob);
    expect(inside(stage).engine.scenes).toHaveLength(1);
  });

  it('helps even when a different scene comes next, and never rejects', async () => {
    const { source } = counting();
    const stage = new BabylonStage(headlessEngine(), { models: source });
    await stage.preload({
      ...scene(),
      objects: [{ ...scene().objects[0]!, model: backstageId('nope') }],
    });
    await stage.load(scene(bob));
    expect(stage.objects()).toContain(bob);
    expect(inside(stage).engine.scenes).toHaveLength(1);
  });
});

describe('crossfading (8.3)', () => {
  async function crossfaded(quality: 'standard' | 'low' = 'standard', offscreen = false) {
    const stage = new BabylonStage(headlessEngine(), {
      models: counting().source,
      quality,
      offscreen,
    });
    await stage.load(scene(ann, 0));
    // Ann walks 2 m to her left over 2 s, and the new scene starts 1 s in.
    stage.schedule([
      cmd(0, 2, { object: ann, kind: 'translate', by: { x: 2, y: 0, z: 0 }, space: 'scene' }),
    ]);
    stage.seek(micros(1));
    await stage.load(scene(bob, 3), { crossfade: micros(1) });
    return stage;
  }

  it('keeps the old scene, moving on with the new one, until the crossfade is over', async () => {
    const stage = await crossfaded();
    expect(inside(stage).engine.scenes).toHaveLength(2);
    expect(stage.objects()).toEqual(
      [bob, objectId('camera')].filter((id) => stage.objects().includes(id)),
    );
    expect(drawnAt(stage, ann)).toBeCloseTo(1, 1);
    stage.seek(micros(0.5));
    // Half a second on in the new scene is half a second on in the old.
    expect(drawnAt(stage, ann)).toBeGreaterThan(1.3);
    stage.seek(micros(1));
    expect(inside(stage).engine.scenes).toHaveLength(1);
  });

  it('holds the old scene still at "low" quality live, but never in an export', async () => {
    const live = await crossfaded('low');
    live.seek(micros(0.5));
    expect(drawnAt(live, ann)).toBeCloseTo(1, 1);
    const exported = await crossfaded('low', true);
    exported.seek(micros(0.5));
    expect(drawnAt(exported, ann)).toBeGreaterThan(1.3);
  });

  it('fires nothing from the old scene, and answers only for the new one', async () => {
    const stage = await crossfaded();
    const heard: StageEvent[] = [];
    stage.onEvent((e) => heard.push(e));
    stage.seek(micros(0.5));
    expect(heard).toEqual([]);
    expect(() => stage.transform(ann)).toThrow(/nothing called ann/);
  });

  it('has nothing to fade with no scene before, and refuses a crossfade below zero', async () => {
    const stage = new BabylonStage(headlessEngine(), { models: counting().source });
    await stage.load(scene(ann), { crossfade: micros(1) });
    expect(inside(stage).engine.scenes).toHaveLength(1);
    await expect(stage.load(scene(bob), { crossfade: -1 })).rejects.toMatchObject({
      code: 'bad_argument',
    });
    expect(stage.objects()).toContain(ann);
  });
});

describe('the fake stage', () => {
  it('records preloading and a crossfade', async () => {
    const stage = new FakeStage();
    await stage.preload(scene());
    await stage.load(scene(), { crossfade: micros(1) });
    await stage.load(scene());
    expect(stage.calls.map((c) => [c.method, c.args.length])).toEqual([
      ['preload', 1],
      ['load', 2],
      ['load', 1],
    ]);
  });
});
