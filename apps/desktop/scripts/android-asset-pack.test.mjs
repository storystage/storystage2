import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, describe, expect, test } from 'vitest';
import { addAssetPack, PACK } from './android-asset-pack.mjs';
import { entryProblems, largest, PLAY_LIMITS, sizeLines } from './android-bundle-sizes.mjs';

const dirs = [];
afterEach(() => {
  for (const dir of dirs.splice(0)) rmSync(dir, { recursive: true, force: true });
});

/** A Gradle project shaped as `tauri android init` makes it, and a fetched Backstage. */
function project() {
  const root = mkdtempSync(join(tmpdir(), 'asset-pack-'));
  dirs.push(root);
  const android = join(root, 'gen', 'android');
  mkdirSync(join(android, 'app', 'src', 'main', 'assets'), { recursive: true });
  writeFileSync(
    join(android, 'settings.gradle'),
    "include ':app'\n\napply from: 'tauri.settings.gradle'\n",
  );
  writeFileSync(
    join(android, 'app', 'build.gradle.kts'),
    'plugins {\n    id("com.android.application")\n}\n\nandroid {\n    compileSdk = 36\n}\n',
  );
  const backstage = join(root, '.backstage');
  mkdirSync(join(backstage, 'models'), { recursive: true });
  writeFileSync(join(backstage, 'backstage.json'), '{}');
  writeFileSync(join(backstage, 'models', 'owl.glb'), 'owl');
  return { android, backstage };
}

const read = (...path) => readFileSync(join(...path), 'utf8');

describe('the Backstage in an install-time pack (15.8)', () => {
  test('adds the pack module, lists it in the app, and copies the Backstage into it', () => {
    const { android, backstage } = project();
    addAssetPack(android, backstage);
    expect(read(android, 'settings.gradle')).toBe(
      "include ':app'\ninclude ':backstage'\n\napply from: 'tauri.settings.gradle'\n",
    );
    expect(read(android, 'app', 'build.gradle.kts')).toContain(
      'android {\n    assetPacks += listOf(":backstage")\n    compileSdk = 36\n',
    );
    const gradle = read(android, PACK, 'build.gradle.kts');
    expect(gradle).toContain('id("com.android.asset-pack")');
    expect(gradle).toContain('packName.set("backstage")');
    expect(gradle).toContain('deliveryType.set("install-time")');
    const assets = join(android, PACK, 'src', 'main', 'assets', PACK);
    expect(read(assets, 'backstage.json')).toBe('{}');
    expect(read(assets, 'models', 'owl.glb')).toBe('owl');
  });

  test('running it again gives the same project, with the Backstage as it is now', () => {
    const { android, backstage } = project();
    addAssetPack(android, backstage);
    const assets = join(android, PACK, 'src', 'main', 'assets', PACK);
    writeFileSync(join(assets, 'gone.glb'), 'from an older Backstage');
    addAssetPack(android, backstage);
    expect(read(android, 'settings.gradle').match(/:backstage/g)).toHaveLength(1);
    expect(read(android, 'app', 'build.gradle.kts').match(/assetPacks/g)).toHaveLength(1);
    expect(existsSync(join(assets, 'gone.glb'))).toBe(false);
  });

  test("removes a copy an earlier build left in the app's own assets", () => {
    const { android, backstage } = project();
    const old = join(android, 'app', 'src', 'main', 'assets');
    mkdirSync(join(old, PACK), { recursive: true });
    writeFileSync(join(old, PACK, 'backstage.json'), '{}');
    writeFileSync(join(old, 'tauri.conf.json'), '{}');
    addAssetPack(android, backstage);
    expect(existsSync(join(old, PACK))).toBe(false);
    expect(existsSync(join(old, 'tauri.conf.json'))).toBe(true);
  });

  test("refuses a Backstage that wasn't fetched, or a project that isn't Tauri's", () => {
    const { android, backstage } = project();
    rmSync(join(backstage, 'backstage.json'));
    expect(() => addAssetPack(android, backstage)).toThrow(/backstage:fetch/);
    const other = project();
    writeFileSync(join(other.android, 'settings.gradle'), "include ':mobile'\n");
    expect(() => addAssetPack(other.android, other.backstage)).toThrow(/:app/);
    const notInit = project();
    rmSync(join(notInit.android, 'settings.gradle'));
    expect(() => addAssetPack(notInit.android, notInit.backstage)).toThrow(/android init/);
    const noBlock = project();
    writeFileSync(join(noBlock.android, 'app', 'build.gradle.kts'), 'plugins {}\n');
    expect(() => addAssetPack(noBlock.android, noBlock.backstage)).toThrow(/android \{/);
  });
});

describe("the bundle against Play's limits (15.8)", () => {
  const good = [
    'BundleConfig.pb',
    'BUNDLE-METADATA/com.android.tools.build.libraries/dependencies.pb',
    'base/manifest/AndroidManifest.xml',
    'base/assets/tauri.conf.json',
    'base/assets/speech/ggml-tiny.en-q5_1.bin',
    'base/lib/arm64-v8a/libstorystage2_lib.so',
    'backstage/manifest/AndroidManifest.xml',
    'backstage/assets/backstage/backstage.json',
    'backstage/assets/backstage/models/owl.glb',
    'META-INF/MANIFEST.MF',
  ];

  test('a bundle with the Backstage in its pack alone has no problems', () => {
    expect(entryProblems(good)).toEqual([]);
  });

  test('a Backstage in the base module, a missing pack, or another module is a problem', () => {
    expect(entryProblems([...good, 'base/assets/backstage/backstage.json'])).toEqual([
      "The base module has 1 of the Backstage's files too, such as base/assets/backstage/backstage.json.",
    ]);
    const noPack = good.filter((name) => !name.startsWith('backstage/'));
    expect(entryProblems(noPack)).toEqual([
      "The bundle's modules are base, not base, backstage.",
      'The backstage pack has no backstage/backstage.json.',
    ]);
    expect(entryProblems([...good, 'extra/manifest/AndroidManifest.xml'])).toEqual([
      "The bundle's modules are backstage, base, extra, not base, backstage.",
    ]);
  });

  test("reads bundletool's largest download size", () => {
    expect(largest('MIN,MAX\n120000000,180000000\n')).toBe(180_000_000);
    expect(() => largest('MIN,MAX\n,\n')).toThrow(/Not a size/);
    expect(() => largest('nothing')).toThrow(/Not a size/);
  });

  test('each part is checked against its limit, and the two together', () => {
    const fits = sizeLines({ base: 150e6, pack: 346e6 });
    expect(fits.ok).toBe(true);
    expect(fits.lines).toEqual([
      'PASS  The base module: 150.0 MB to download, of 500.0 MB',
      'PASS  The backstage pack: 346.0 MB to download, of 1500.0 MB',
      'PASS  Everything installed with the app: 496.0 MB to download, of 4000.0 MB',
    ]);
    expect(sizeLines({ base: PLAY_LIMITS.base + 1, pack: 1 }).ok).toBe(false);
    expect(sizeLines({ base: 1, pack: PLAY_LIMITS.pack + 1 }).ok).toBe(false);
    expect(sizeLines({ base: PLAY_LIMITS.base, pack: PLAY_LIMITS.pack }).ok).toBe(true);
  });
});
