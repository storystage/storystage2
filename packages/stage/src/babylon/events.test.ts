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
    expect(heard).toEqual([{ kind: 'click', object: cat, x: 0.5, y: 0.5, at: micros(1) }]);
  });

  it('say so when they miss', async () => {
    const { stage, heard } = await listening(inShot);
    stage.click(20, 20);
    expect(heard).toEqual([{ kind: 'click', object: null, x: 20 / 640, y: 1 - 20 / 360, at: 0 }]);
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

  it('are heard being let go, too', async () => {
    const { stage, heard } = await listening();
    stage.keyRelease('a');
    expect(heard).toEqual([{ kind: 'keyRelease', key: 'a', at: 0 }]);
  });
});

/** The cat walks to the dog, then back away. */
const meetAndPart = [
  walkTogether(0),
  cmd(2, 1, { object: cat, kind: 'translate', by: { x: -3, y: 0, z: 0 }, space: 'scene' }),
];

describe('collisions ending', () => {
  it('fire once, as two objects stop touching', async () => {
    const { stage, heard } = await listening();
    stage.schedule(meetAndPart);
    for (const t of [0.5, 1, 2, 2.5, 3, 4]) stage.seek(micros(t));
    expect(heard.map((e) => e.kind)).toEqual(['collisionStart', 'collisionEnd']);
    expect(heard[1]).toMatchObject({ a: cat, b: dog });
  });
});

describe('proximity', () => {
  it('fires only for what is watched, on the way in and the way out', async () => {
    const { stage, heard } = await listening();
    stage.schedule(meetAndPart);
    stage.watch([{ kind: 'proximity', a: [cat], b: [dog], distance: 1 }]);
    for (const t of [0.3, 0.6, 1, 2, 2.5, 3, 4]) stage.seek(micros(t));
    const near = heard.filter((e) => e.kind.startsWith('proximity'));
    expect(near.map((e) => e.kind)).toEqual(['proximityEnter', 'proximityExit']);
    expect(near[0]).toMatchObject({ a: cat, b: dog, distance: 1 });
  });

  it('does not fire for a pair already near when watching starts', async () => {
    const { stage, heard } = await listening();
    stage.watch([{ kind: 'proximity', a: [cat], b: [dog], distance: 5 }]);
    stage.seek(micros(1));
    expect(heard).toEqual([]);
  });

  it('refuses to watch something that is not there, or a negative distance', async () => {
    const { stage } = await listening();
    expect(() => stage.watch([{ kind: 'view', objects: [objectId('ghost')] }])).toThrow(/ghost/);
    expect(() => stage.watch([{ kind: 'proximity', a: [cat], b: [dog], distance: -1 }])).toThrow(
      /zero or more/,
    );
  });
});

describe('view', () => {
  it('fires as a watched object comes into the picture and leaves it', async () => {
    const { stage, heard } = await listening(inShot);
    stage.watch([{ kind: 'view', objects: [dog] }]);
    stage.schedule([
      cmd(0, 1, { object: dog, kind: 'translate', by: { x: -50, y: 0, z: 0 }, space: 'scene' }),
      cmd(1, 1, { object: dog, kind: 'translate', by: { x: 0, y: 0, z: -40 }, space: 'scene' }),
    ]);
    for (const t of [0.2, 0.5, 1, 1.5, 2]) stage.seek(micros(t));
    const views = heard.filter((e) => e.kind.startsWith('view'));
    expect(views.map((e) => e.kind)).toEqual(['viewEnter', 'viewExit']);
    expect(views[0]).toMatchObject({ object: dog });
  });

  it('counts something that has faded away as out of sight', async () => {
    const { stage, heard } = await listening(inShot);
    stage.watch([{ kind: 'view', objects: [cat] }]);
    stage.schedule([cmd(0, 1, { object: cat, kind: 'opacity', to: 0 })]);
    stage.seek(micros(1));
    expect(heard).toEqual([{ kind: 'viewExit', object: cat, at: micros(1) }]);
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
