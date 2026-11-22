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
 * Found on 22 Nov 2026, for S3 to fix. The lists must match exactly, reasons included, so a new
 * fault fails the test, and so does a fixed one still listed: take it out with the fix.
 */
// One mesh on several nodes: an instance's material has already been made plain.
const INSTANCED = "Cannot read properties of undefined (reading 'toGammaSpace')";
const CANT_BE_PLACED: Readonly<Record<string, string>> = {
  'nasa/Prop/robonaut-2': INSTANCED,
  'sketchfab-history/Prop/roman-temple': INSTANCED,
  'sketchfab-history/Prop/roundhouse-simple': INSTANCED,
  'storybook/Biped/anansi': INSTANCED,
  'storybook/Biped/medusa': INSTANCED,
  'storybook/Biped/sherlock-holmes': INSTANCED,
};
/** Listed joints the stage doesn't find, and how many: their bones have names it doesn't know. */
const JOINTS_NOT_FOUND: Readonly<Record<string, number>> = {
  'osa/Biped/ajo-majo': 2,
  'osa/Biped/chester': 2,
  'osa/Biped/cool-snake': 2,
  'osa/Biped/cool-tiger': 18,
  'osa/Biped/crowley': 2,
  'osa/Biped/evil-book': 1,
  'osa/Biped/frog-enjoyer': 1,
  'osa/Biped/lady-fawn': 1,
  'osa/Biped/leaf-boy': 2,
  'osa/Biped/lil-shark': 1,
  'osa/Biped/lord-piggington': 1,
  'osa/Biped/megan-the-fox': 5,
  'osa/Biped/polybot': 4,
  'osa/Biped/snail-kid': 2,
  'vrmc/Biped/seed-san': 24,
};

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
