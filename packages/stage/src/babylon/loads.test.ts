/**
 * Loads that overlap, as the studio's set-up load and Rehearse's can (found by S2: Rehearse stuck
 * at starting). The newest call wins, whichever finishes building first; an older one drops only
 * its own scene and settles; and no load waits for ever on a scene a newer one dropped.
 */
import { Scene } from '@babylonjs/core/scene.js';
import { backstageId, objectId, type BackstageId, type SceneSetup } from '@storystage/story-api';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { SETUP } from '../testing/conformance.ts';
import { headlessEngine } from './headless.ts';
import type { ModelFile } from './models.ts';
import { BabylonStage } from './stage.ts';

/** A scene with one object, `id`, whose model the test lets the stage find when it says. */
const withOne = (id: string): SceneSetup => ({
  ...SETUP,
  objects: [{ ...SETUP.objects[0]!, id: objectId(id), model: backstageId(`test/Prop/${id}`) }],
});

/** A stage whose models arrive only when the test opens each one's gate, and is never ready. */
function gatedStage() {
  const gates = new Map<string, () => void>();
  const stage = new BabylonStage(headlessEngine(), {
    models: {
      find: (id: BackstageId) =>
        new Promise<ModelFile | null>((found) => gates.set(id, () => found(null))),
    },
  });
  let ready = false;
  vi.spyOn(Scene.prototype, 'isReady').mockImplementation(() => ready);
  /** Lets the stage find a model, once it has asked for it. */
  const open = async (id: string) => {
    const key = `test/Prop/${id}`;
    for (let i = 0; i < 200 && !gates.has(key); i++) await new Promise((r) => setTimeout(r, 0));
    gates.get(key)!();
  };
  return { stage, open, readyNow: () => (ready = true) };
}

/** Whether a promise has settled, after everything already queued has run. */
async function settled(p: Promise<unknown>): Promise<boolean> {
  let done = false;
  void p.then(
    () => (done = true),
    () => (done = true),
  );
  for (let i = 0; i < 50; i++) await new Promise((r) => setTimeout(r, 0));
  return done;
}

afterEach(() => vi.restoreAllMocks());

describe('loads that overlap', () => {
  it('lets the newer load win when it finishes building first, and never drops its scene', async () => {
    const { stage, open, readyNow } = gatedStage();
    const older = stage.load(withOne('setup'));
    const newer = stage.load(withOne('rehearse'));
    await open('rehearse');
    expect(await settled(older)).toBe(false);
    await open('setup');
    // The older one is overtaken: it settles, and drops only its own scene.
    expect(await settled(older)).toBe(true);
    expect(stage.objects()).toContain(objectId('rehearse'));
    readyNow();
    expect(await settled(newer)).toBe(true);
    expect(stage.objects()).not.toContain(objectId('setup'));
  });

  it('lets the newer load win when the older finishes first, and the older one settles', async () => {
    const { stage, open, readyNow } = gatedStage();
    const older = stage.load(withOne('setup'));
    const newer = stage.load(withOne('rehearse'));
    await open('setup');
    // The older one isn't the newest, so it never takes over, even finishing first.
    expect(await settled(older)).toBe(true);
    await open('rehearse');
    readyNow();
    expect(await settled(newer)).toBe(true);
    expect(stage.objects()).toContain(objectId('rehearse'));
    expect(stage.objects()).not.toContain(objectId('setup'));
  });

  it('stops waiting on a scene a newer load drops before it is ready', async () => {
    const { stage, open, readyNow } = gatedStage();
    const older = stage.load(withOne('setup'));
    await open('setup');
    // Built and shown, waiting for its scene to be ready.
    expect(await settled(older)).toBe(false);
    expect(stage.objects()).toContain(objectId('setup'));
    const newer = stage.load(withOne('rehearse'));
    await open('rehearse');
    expect(await settled(older)).toBe(true);
    readyNow();
    expect(await settled(newer)).toBe(true);
    expect(stage.objects()).toContain(objectId('rehearse'));
  });

  it('drops a load still building when the stage is disposed', async () => {
    const { stage, open } = gatedStage();
    const loading = stage.load(withOne('setup'));
    stage.dispose();
    await open('setup');
    expect(await settled(loading)).toBe(true);
  });
});
