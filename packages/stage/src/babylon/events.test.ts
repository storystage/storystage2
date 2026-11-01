import {
  IDENTITY,
  micros,
  objectId,
  type SceneSetup,
  type StageEvent,
} from '@storystage/story-api';
import { describe, expect, it, vi } from 'vitest';
import { SETUP, cmd } from '../testing/conformance.ts';
import { headlessEngine } from './headless.ts';
import { BabylonStage } from './stage.ts';

const cat = objectId('cat');
const dog = objectId('dog');
/** The cat straight ahead of the camera, 10 m away, and the dog well out of shot. */
const inShot: SceneSetup = {
  ...SETUP,
  objects: [
    { ...SETUP.objects[0]!, transform: { ...IDENTITY, position: { x: 0, y: 0, z: 4 } } },
    { ...SETUP.objects[1]!, transform: { ...IDENTITY, position: { x: 50, y: 0, z: 4 } } },
  ],
  camera: { transform: { ...IDENTITY, position: { x: 0, y: 0.5, z: -6 } } },
};

async function listening(setup: SceneSetup = SETUP) {
  const stage = new BabylonStage(headlessEngine());
  await stage.load(setup);
  const heard: StageEvent[] = [];
  stage.onEvent((e) => heard.push(e));
  return { stage, heard };
}

const walkTogether = (start: number) => cmd(start, 1, { object: cat, kind: 'moveTo', target: dog });

describe('clicks', () => {
  it('say which object was clicked, and when', async () => {
    const { stage, heard } = await listening(inShot);
    stage.seek(micros(1));
    stage.click(320, 180);
    expect(heard).toEqual([{ kind: 'click', object: cat, at: micros(1) }]);
  });

  it('say so when they miss', async () => {
    const { stage, heard } = await listening(inShot);
    stage.click(20, 20);
    expect(heard).toEqual([{ kind: 'click', object: null, at: 0 }]);
  });

  it('find an object where it is now, not where it started', async () => {
    const { stage, heard } = await listening(inShot);
    stage.schedule([
      cmd(0, 1, { object: cat, kind: 'translate', by: { x: 0, y: 5, z: 0 }, space: 'scene' }),
    ]);
    stage.seek(micros(1));
    stage.click(320, 180);
    expect(heard[0]).toMatchObject({ object: null });
  });

  it('go through something that has faded away', async () => {
    const { stage, heard } = await listening(inShot);
    stage.schedule([cmd(0, 1, { object: cat, kind: 'opacity', to: 0 })]);
    stage.seek(micros(1));
    stage.click(320, 180);
    expect(heard[0]).toMatchObject({ object: null });
  });
});

describe('keys', () => {
  it('reach the listeners with the scene time', async () => {
    const { stage, heard } = await listening();
    stage.seek(micros(2));
    stage.key('space');
    expect(heard).toEqual([{ kind: 'key', key: 'space', at: micros(2) }]);
  });
});

describe('collisions', () => {
  it('fire once, as two objects start to touch', async () => {
    const { stage, heard } = await listening();
    stage.schedule([walkTogether(0)]);
    for (const t of [0.1, 0.3, 0.9, 1, 1.5]) stage.seek(micros(t));
    expect(heard.filter((e) => e.kind === 'collisionStart')).toHaveLength(1);
    expect(heard[0]).toMatchObject({ kind: 'collisionStart', a: cat, b: dog });
  });

  it('do not fire for objects already touching when the scene starts', async () => {
    const together: SceneSetup = {
      ...SETUP,
      objects: SETUP.objects.map((o) => ({ ...o, transform: IDENTITY })),
    };
    const { stage, heard } = await listening(together);
    stage.seek(micros(1));
    expect(heard).toEqual([]);
  });

  it('do not fire on the way back, and fire again on the way forward', async () => {
    const { stage, heard } = await listening();
    stage.schedule([walkTogether(0)]);
    stage.seek(micros(1));
    stage.seek(0);
    expect(heard).toHaveLength(1);
    stage.seek(micros(1));
    expect(heard).toHaveLength(2);
  });

  it('start afresh after a reset', async () => {
    const { stage, heard } = await listening();
    stage.schedule([walkTogether(0)]);
    stage.seek(micros(1));
    stage.reset();
    stage.schedule([walkTogether(0)]);
    stage.seek(micros(1));
    expect(heard).toHaveLength(2);
  });

  it('do not fire for a listener joining after they already touch', async () => {
    const stage = new BabylonStage(headlessEngine());
    await stage.load(SETUP);
    stage.schedule([walkTogether(0)]);
    stage.seek(micros(1));
    const heard: StageEvent[] = [];
    stage.onEvent((e) => heard.push(e));
    stage.seek(micros(2));
    expect(heard).toEqual([]);
  });
});

describe('live play', () => {
  it('runs each frame until told to stop', async () => {
    const stage = new BabylonStage(headlessEngine());
    await stage.load(SETUP);
    const frame = vi.fn();
    stage.startLive(frame);
    await vi.waitFor(() => expect(frame.mock.calls.length).toBeGreaterThan(2));
    stage.stopLive();
    const stopped = frame.mock.calls.length;
    await new Promise((resolve) => setTimeout(resolve, 80));
    expect(frame.mock.calls.length).toBeLessThanOrEqual(stopped + 1);
  });

  it('has one loop at a time', async () => {
    const stage = new BabylonStage(headlessEngine());
    await stage.load(SETUP);
    const first = vi.fn();
    const second = vi.fn();
    stage.startLive(first);
    stage.startLive(second);
    await vi.waitFor(() => expect(second).toHaveBeenCalled());
    first.mockClear();
    await new Promise((resolve) => setTimeout(resolve, 80));
    expect(first).not.toHaveBeenCalled();
    stage.dispose();
  });
});
