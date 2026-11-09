import { afterEach, describe, expect, it } from 'vitest';
import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { MANIFEST_VERSION, catalogueText } from '@storystage/backstage';
import { checkBundle, servedPath, validateLock, type BackstageLock } from './bundle.ts';

const sha = (s: string) => createHash('sha256').update(s).digest('hex');

const manifest = {
  manifestVersion: MANIFEST_VERSION,
  items: [
    {
      id: 'kaykit/Biped/knight',
      section: 'cast',
      class: 'Biped',
      displayName: 'Knight',
      themes: ['fantasy'],
      files: {
        model: 'models/kaykit/Biped/knight.glb',
        thumbnail: 'thumbnails/kaykit/Biped/knight.webp',
      },
      joints: ['hips'],
      defaultSize: { height: 1.8 },
      budget: { triangles: 100, textureMaxPx: 0 },
      licence: 'CC0-1.0',
      credit: 'Knight by Kay Lousberg, KayKit (CC0)',
      source: { url: 'https://example.org' },
      origin: 'shipped',
      sketches: [{ facing: 'front', file: 'sketches/kaykit/Biped/knight/front.svg' }],
    },
  ],
};

let dir: string;
afterEach(async () => {
  if (dir) await rm(dir, { recursive: true, force: true });
});

/** A fetched folder and its lock, as `pnpm backstage:fetch` leaves them. */
async function bundle(): Promise<BackstageLock> {
  dir = await mkdtemp(join(tmpdir(), 'backstage-bundle-'));
  const text = `${JSON.stringify(manifest, null, 2)}\n`;
  const catalogue = catalogueText(manifest as never);
  const files: Record<string, string> = {
    'backstage.json': text,
    'prompter-catalogue.txt': catalogue,
    'models/kaykit/Biped/knight.glb': 'glTF',
    'thumbnails/kaykit/Biped/knight.webp': 'RIFF',
    'sketches/kaykit/Biped/knight/front.svg': '<svg/>',
  };
  for (const [name, body] of Object.entries(files)) {
    await mkdir(dirname(join(dir, name)), { recursive: true });
    await writeFile(join(dir, name), body);
  }
  return {
    repository: 'storystage/backstage-assets',
    commit: 'a'.repeat(40),
    manifestVersion: MANIFEST_VERSION,
    manifestSha256: sha(text),
    catalogueSha256: sha(catalogue),
  };
}

describe("servedPath (the apps' backstage protocol, S8)", () => {
  it('serves plain relative paths inside the Backstage, as is_served does', () => {
    for (const p of [
      'backstage.json',
      'models/kaykit/Biped/knight.glb',
      'thumbnails/osa_Biped_teddy.webp',
      'sketches/p01/front.svg',
      'prompter-catalogue.txt',
    ])
      expect(servedPath(p), p).toBe(true);
  });

  it('serves nothing that could leave it, or that the apps would refuse', () => {
    for (const p of [
      '',
      '/backstage.json',
      '../x',
      'models/../../x',
      'a//b',
      '.hidden',
      'models/.git/config',
      '%2e%2e/x',
      'a\b',
      'a b.glb',
      'C:/x',
      'models/x.glb?y',
      'models/(x).glb',
      'x'.repeat(256),
    ])
      expect(servedPath(p), p).toBe(false);
  });
});

describe('checkBundle', () => {
  it('passes a folder that matches its lock', async () => {
    const lock = await bundle();
    expect(await checkBundle(dir, lock)).toEqual([]);
  });

  it('refuses files that differ from the pinned hashes', async () => {
    const lock = await bundle();
    const problems = await checkBundle(dir, {
      ...lock,
      manifestSha256: 'b'.repeat(64),
      catalogueSha256: 'c'.repeat(64),
    });
    expect(problems.join('\n')).toMatch(/backstage\.json doesn't match/);
    expect(problems.join('\n')).toMatch(/prompter-catalogue\.txt doesn't match/);
  });

  it('refuses a folder missing a model, thumbnail or sketch', async () => {
    const lock = await bundle();
    await rm(join(dir, 'thumbnails'), { recursive: true });
    await rm(join(dir, 'sketches'), { recursive: true });
    const problems = await checkBundle(dir, lock);
    expect(problems).toEqual([
      'kaykit/Biped/knight: thumbnails/kaykit/Biped/knight.webp is missing.',
      'kaykit/Biped/knight: sketches/kaykit/Biped/knight/front.svg is missing.',
    ]);
  });

  it("refuses a Prompter catalogue that isn't what this code makes of the manifest", async () => {
    const lock = await bundle();
    const stale = 'An old catalogue\n';
    await writeFile(join(dir, 'prompter-catalogue.txt'), stale);
    const problems = await checkBundle(dir, { ...lock, catalogueSha256: sha(stale) });
    expect(problems).toEqual([
      "prompter-catalogue.txt isn't what this code makes of backstage.json. Rebuild the assets with this code, then update the lock.",
    ]);
  });

  it('refuses a lock pinning another manifest version', async () => {
    const lock = await bundle();
    const problems = await checkBundle(dir, { ...lock, manifestVersion: '2.0.0' });
    expect(problems.join('\n')).toMatch(/pins manifest 2\.0\.0/);
  });
});

describe('backstage.lock.json', () => {
  it('is valid and pins the manifest version this code reads', () => {
    const lock = JSON.parse(
      readFileSync(fileURLToPath(new URL('../../../backstage.lock.json', import.meta.url)), 'utf8'),
    );
    expect(validateLock(lock)).toEqual([]);
    expect(lock.manifestVersion).toBe(MANIFEST_VERSION);
  });
});
