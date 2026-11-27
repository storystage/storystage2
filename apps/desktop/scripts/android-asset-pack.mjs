// Puts the shipped Backstage in a Play install-time asset pack (workplan 15.8; decision 0062,
// update of 23 Nov 2026; spec 05 section 7). Run after `tauri android init` and before
// `tauri android build --aab --config src-tauri/android-bundle.conf.json`, which leaves
// `.backstage/` out of the app's own assets.
//
// Play allows 500 MB for an app bundle's base module, and the Backstage alone is about 346 MB
// compressed. An install-time pack is installed with the app, so it still works offline from the
// first launch, and the app reads it through the same AssetManager, at the same `backstage/...`
// paths (src/android_assets.rs).
//
// It adds a `:backstage` module to the generated Gradle project, copies `.backstage/` into it, and
// lists it in the app module's `assetPacks`. Running it again gives the same project.
//
//   node apps/desktop/scripts/android-asset-pack.mjs [<gen/android folder> <.backstage folder>]
import { cpSync, existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

/** The pack's name in Play, and its Gradle module. */
export const PACK = 'backstage';

const PACK_GRADLE = `// Made by apps/desktop/scripts/android-asset-pack.mjs (workplan 15.8).
plugins {
    id("com.android.asset-pack")
}

assetPack {
    packName.set("${PACK}")
    dynamicDelivery {
        deliveryType.set("install-time")
    }
}
`;

function edit(file, change) {
  const before = readFileSync(file, 'utf8');
  const after = change(before);
  if (after !== before) writeFileSync(file, after);
}

/** Adds the pack to the Gradle project in `android`, with a copy of the Backstage in `backstage`. */
export function addAssetPack(android, backstage) {
  if (!existsSync(join(backstage, 'backstage.json')))
    throw new Error(`${backstage} has no backstage.json: run pnpm backstage:fetch first.`);

  const settings = join(android, 'settings.gradle.kts');
  edit(settings, (text) => {
    if (!text.includes('include(":app")'))
      throw new Error(`${settings} doesn't include :app, so it isn't Tauri's project.`);
    if (text.includes(`include(":${PACK}")`)) return text;
    return text.replace('include(":app")', () => `include(":app")\ninclude(":${PACK}")`);
  });

  const app = join(android, 'app', 'build.gradle.kts');
  edit(app, (text) => {
    if (text.includes(`assetPacks += listOf(":${PACK}")`)) return text;
    const block = /^android \{\r?\n/m;
    if (!block.test(text)) throw new Error(`${app} has no android { block.`);
    return text.replace(block, (line) => `${line}    assetPacks += listOf(":${PACK}")\n`);
  });

  const module = join(android, PACK);
  mkdirSync(module, { recursive: true });
  writeFileSync(join(module, 'build.gradle.kts'), PACK_GRADLE);
  const assets = join(module, 'src', 'main', 'assets', PACK);
  rmSync(assets, { recursive: true, force: true });
  cpSync(backstage, assets, { recursive: true });
  // A copy an earlier build put in the app's own assets would ship in the base module too.
  rmSync(join(android, 'app', 'src', 'main', 'assets', PACK), { recursive: true, force: true });
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const here = fileURLToPath(new URL('.', import.meta.url));
  const [android, backstage] = process.argv.slice(2);
  addAssetPack(
    android ?? join(here, '../src-tauri/gen/android'),
    backstage ?? join(here, '../../../.backstage'),
  );
  console.log(`The Backstage is in the "${PACK}" install-time asset pack.`);
}
