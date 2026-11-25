/**
 * WP3's done-when (spec 17, section 8): every shipped model loads in Babylon.js with its mapped
 * joints. It places each model of the Backstage that `backstage.lock.json` pins with the stage's
 * own loader. Backdrops aren't models, so they aren't here.
 *
 * It needs the fetched Backstage (`pnpm backstage:fetch`), which `BACKSTAGE_DIR` names: CI's
 * `check` sets it, and without it the test is skipped.
 */
import { Scene } from '@babylonjs/core/scene.js';
import { validateManifest, type BackstageItem } from '@storystage/backstage';
import { objectId } from '@storystage/story-api';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { headlessEngine } from './headless.ts';
import { ModelLibrary } from './models.ts';

/**
 * The lists must match exactly, reasons included, so a new fault fails the test, and so does a
 * fixed one still listed: take it out with the fix.
 */
const CANT_BE_PLACED: Readonly<Record<string, string>> = {};
/** Listed joints the stage doesn't find, and how many. */
const JOINTS_NOT_FOUND: Readonly<Record<string, number>> = {};

const folder = process.env.BACKSTAGE_DIR;

function shippedModels(dir: string): readonly BackstageItem[] {
  const checked = validateManifest(JSON.parse(readFileSync(join(dir, 'backstage.json'), 'utf8')));
  if (!checked.ok) throw new Error(`${dir}/backstage.json isn't a valid manifest.`);
  return checked.manifest.items.filter((item) => item.section !== 'backdrops');
}

describe.skipIf(!folder)('the shipped Backstage', () => {
  it('loads every model with its mapped joints', { timeout: 300_000 }, async () => {
    const items = shippedModels(folder!);
    expect(items.length).toBeGreaterThan(0);
    const engine = headlessEngine();
    const failed: Record<string, string> = {};
    const short: Record<string, number> = {};
    for (const item of items) {
      const scene = new Scene(engine);
      const model = readFileSync(join(folder!, item.files.model)).toString('base64');
      const library = new ModelLibrary(scene, {
        find: () => ({ url: `data:model/gltf-binary;base64,${model}`, joints: item.joints }),
      });
      try {
        const { shape } = await library.place(objectId('model'), item.id, item.class);
        if (item.joints !== 'prop-only') {
          const lacks = item.joints.filter((joint) => !shape.jointPlaces.has(joint)).length;
          if (lacks > 0) short[item.id] = lacks;
        }
      } catch (e) {
        failed[item.id] = e instanceof Error ? e.message : String(e);
      } finally {
        scene.dispose();
      }
    }
    engine.dispose();
    expect(failed).toEqual(CANT_BE_PLACED);
    expect(short).toEqual(JOINTS_NOT_FOUND);
  });
});
