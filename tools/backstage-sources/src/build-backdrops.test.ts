import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import sharp from 'sharp';
import { WebIO } from '@gltf-transform/core';
import { ALL_EXTENSIONS } from '@gltf-transform/extensions';
import { validateManifest, type BackstageManifest } from '@storystage/backstage';
import { buildSources } from './build.ts';
import type { Fetcher } from './fetch.ts';
import { validateSources } from './sources.ts';

const COMMIT = 'c'.repeat(40);
const raw = (path: string) =>
  `https://raw.githubusercontent.com/storystage/backstage-assets/${COMMIT}/${path}`;

async function picture(width: number, height: number, rgb: (x: number, y: number) => number[]) {
  const data = Buffer.alloc(width * height * 3);
  for (let y = 0; y < height; y++)
    for (let x = 0; x < width; x++) data.set(rgb(x, y), (y * width + x) * 3);
  return new Uint8Array(
    await sharp(data, { raw: { width, height, channels: 3 } })
      .jpeg()
      .toBuffer(),
  );
}

const backdrop = (over: Record<string, unknown>): Record<string, unknown> => ({
  displayName: 'Grass',
  section: 'backdrops',
  themes: ['nature'],
  description: 'short green grass',
  licence: 'CC0-1.0',
  credit: 'Grass 001 by Lennart Demes, ambientCG (CC0)',
  page: 'https://ambientcg.com/view?id=Grass001',
  ...over,
});

const grass = backdrop({
  id: 'storystage/Ground/grass',
  class: 'Ground',
  backdrop: { kind: 'ground', tile: 2, look: '5f9e3a' },
  fetch: { github: 'storystage/backstage-assets', commit: COMMIT, path: 'originals/grass.jpg' },
});
const clearDay = backdrop({
  id: 'storystage/Sky/clearDay',
  class: 'Scene',
  displayName: 'Clear day',
  description: 'a clear blue sky with a few small clouds',
  backdrop: { kind: 'sky' },
  fetch: { github: 'storystage/backstage-assets', commit: COMMIT, path: 'originals/sky.jpg' },
});

describe('backdrop source items (spec 17 section 2)', () => {
  const ok = (item: Record<string, unknown>) =>
    validateSources({ source: 'backdrops', items: [item] });

  it('takes a ground or a sky under the stage’s ids, with its picture pinned', () => {
    expect(ok(grass).ok).toBe(true);
    expect(ok(clearDay).ok).toBe(true);
    expect(ok({ ...grass, id: 'storystage/Ground/darkGrass' }).ok).toBe(true);
  });

  it('refuses one the stage would never find, or that a model’s rules would need', () => {
    const errors = (item: Record<string, unknown>) => {
      const r = ok(item);
      return r.ok ? [] : r.errors.join('\n');
    };
    expect(errors({ ...grass, id: 'ambientcg/Ground/grass' })).toMatch(/storystage\/Ground/);
    expect(errors({ ...grass, id: 'storystage/Sky/grass' })).toMatch(/ground's id/);
    expect(errors({ ...grass, class: 'Prop' })).toMatch(/class must be Ground/);
    expect(errors({ ...clearDay, class: 'Ground' })).toMatch(/class must be Scene/);
    expect(errors({ ...grass, backdrop: undefined })).toMatch(/needs backdrop/);
    expect(errors({ ...grass, backdrop: { kind: 'ground', tile: 50, look: '5f9e3a' } })).toMatch(
      /tile/,
    );
    expect(errors({ ...grass, backdrop: { kind: 'ground', tile: 2, look: 'green' } })).toMatch(
      /look/,
    );
    expect(errors({ ...grass, height: 1 })).toMatch(/no height, turn or exclude/);
    expect(ok({ ...clearDay, backdrop: { kind: 'sky', exposure: 0.2 } }).ok).toBe(true);
    expect(errors({ ...clearDay, backdrop: { kind: 'sky', exposure: 2 } })).toMatch(/exposure/);
    expect(errors({ ...clearDay, backdrop: { kind: 'sky', tile: 2 } })).toMatch(
      /only kind, exposure, tint and ahead/,
    );
    expect(
      ok({ ...clearDay, backdrop: { kind: 'sky', exposure: 0.1, tint: '8ca5ff', ahead: 0.62 } }).ok,
    ).toBe(true);
    expect(errors({ ...clearDay, backdrop: { kind: 'sky', tint: 'blue' } })).toMatch(/tint/);
    expect(errors({ ...clearDay, backdrop: { kind: 'sky', ahead: 1.5 } })).toMatch(/ahead/);
    expect(
      errors({ ...grass, fetch: { ...(grass.fetch as object), path: 'originals/grass.glb' } }),
    ).toMatch(/picture/);
    expect(errors({ ...grass, fetch: { generated: 'grass.glb' } })).toMatch(/pinned/);
    // A model can't borrow a backdrop's recipe.
    expect(
      errors({
        id: 'pack/Prop/rock',
        displayName: 'Rock',
        class: 'Prop',
        section: 'props',
        themes: [],
        licence: 'CC0-1.0',
        credit: 'Rock (CC0)',
        page: 'https://example.org/rock',
        fetch: { github: 'pack/props', commit: COMMIT, path: 'rock.glb' },
        backdrop: { kind: 'sky' },
      }),
    ).toMatch(/backdrops section only/);
  });
});

describe('buildSources with backdrops', () => {
  let dir: string;
  const files = new Map<string, Uint8Array>();
  const fetcher: Fetcher = async (url) => {
    const f = files.get(url);
    if (!f) throw new Error(`404 ${url}`);
    return f;
  };

  beforeAll(async () => {
    // A grainy brown, nothing like grass, and a blue sky over green ground.
    files.set(
      raw('originals/grass.jpg'),
      await picture(256, 256, (x, y) => [100 + ((x * 7 + y * 13) % 40), 80, 50]),
    );
    files.set(
      raw('originals/sky.jpg'),
      await picture(256, 128, (_x, y) => (y < 64 ? [70, 130, 220] : [40, 90, 30])),
    );
    dir = await mkdtemp(join(tmpdir(), 'backstage-backdrops-'));
    await mkdir(join(dir, 'sources'));
    await writeFile(
      join(dir, 'sources/backdrops.json'),
      JSON.stringify({ source: 'backdrops', items: [grass, clearDay] }),
    );
    await buildSources(dir, { fetcher, today: '2026-11-10' });
  });
  afterAll(() => rm(dir, { recursive: true, force: true }));

  const manifest = async () =>
    JSON.parse(await readFile(join(dir, 'backstage.json'), 'utf8')) as BackstageManifest;

  it('writes them as ordinary items, under the stage’s ids', async () => {
    const m = await manifest();
    expect(validateManifest(m).ok).toBe(true);
    expect(m.items.map((i) => [i.id, i.section, i.class])).toEqual([
      ['storystage/Ground/grass', 'backdrops', 'Ground'],
      ['storystage/Sky/clearDay', 'backdrops', 'Scene'],
    ]);
  });

  it('ships a one-tile ground and a dome, each within the Backdrops budget', async () => {
    const io = new WebIO().registerExtensions(ALL_EXTENSIONS);
    const m = await manifest();
    for (const item of m.items) {
      const doc = await io.readBinary(new Uint8Array(await readFile(join(dir, item.files.model))));
      expect(doc.getRoot().listTextures()).toHaveLength(1);
      expect(item.budget.triangles).toBeLessThanOrEqual(4000);
      expect(item.budget.textureMaxPx).toBeLessThanOrEqual(2048);
    }
    expect(m.items[0]!.budget.triangles).toBe(2);
  });

  it('gives each a thumbnail of its own picture, and the backdrop sketch', async () => {
    for (const item of (await manifest()).items) {
      const meta = await sharp(await readFile(join(dir, item.files.thumbnail))).metadata();
      expect([meta.format, meta.width]).toEqual(['webp', 320]);
      expect(item.sketches.map((s) => s.file)).toEqual([`sketches/${item.id}/backdrop.svg`]);
    }
  });

  it('reports the colours: the ground matched to its look, the sky’s horizon and lighting', async () => {
    const report = await readFile(join(dir, 'sources-report.md'), 'utf8');
    expect(report).toMatch(
      /\| `storystage\/Ground\/grass` \| #5f9e3a \| #[0-9a-f]{6} \| #5f9e3a \|/,
    );
    expect(report).toMatch(
      /\| `storystage\/Sky\/clearDay` \| #[0-9a-f]{6} \| #[0-9a-f]{6} \| #[0-9a-f]{6} \|/,
    );
    const provenance = JSON.parse(await readFile(join(dir, 'provenance.json'), 'utf8'));
    expect(provenance['storystage/Ground/grass'].backdrop).toMatchObject({ look: '5f9e3a' });
    expect(provenance['storystage/Sky/clearDay'].backdrop.horizon).toMatch(/^[0-9a-f]{6}$/);
  });

  it("lists them in the Prompter's catalogue as backdrops, set rather than added", async () => {
    const catalogue = await readFile(join(dir, 'prompter-catalogue.txt'), 'utf8');
    expect(catalogue).toContain('storystage/Ground/grass: Grass, short green grass [nature]\n');
    expect(catalogue).toContain("set it as the scene's backdrop");
  });
});
