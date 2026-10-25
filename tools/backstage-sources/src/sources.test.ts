import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { createHash } from 'node:crypto';
import { existsSync } from 'node:fs';
import { mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { WebIO } from '@gltf-transform/core';
import { validateManifest } from '@storystage/backstage';
import {
  box,
  documentFromMesh,
  figure,
  glbFromMesh,
  vrmFromMesh,
} from '@storystage/sketches/testing';
import { buildSources } from './build.ts';
import { fetchModel, type Fetcher } from './fetch.ts';
import { validateSources } from './sources.ts';

const COMMIT = 'a'.repeat(40);
const RAW = `https://raw.githubusercontent.com/kaykit/pack/${COMMIT}/`;
const sha = (b: Uint8Array) => createHash('sha256').update(b).digest('hex');

const item = (over: Record<string, unknown>) => ({
  id: 'kaykit/Biped/knight',
  displayName: 'Knight',
  class: 'Biped',
  section: 'cast',
  themes: ['fantasy'],
  licence: 'CC0-1.0',
  credit: 'Knight by Kay Lousberg, KayKit (CC0)',
  page: 'https://github.com/kaykit/pack',
  fetch: { github: 'kaykit/pack', commit: COMMIT, path: 'chars/Knight.glb' },
  ...over,
});

let files: Map<string, Uint8Array>;
const fetcher: Fetcher = async (url) => {
  const f = files.get(url);
  if (!f) throw new Error(`404 ${url}`);
  return f;
};

beforeAll(async () => {
  files = new Map();
  files.set(`${RAW}chars/Knight.glb`, await glbFromMesh(figure()));
  // A .gltf with its buffer in a separate file, as many packs ship.
  const { json, resources } = await new WebIO().writeJSON(
    documentFromMesh(box([0, 0, 0], [1, 2, 1])),
  );
  const [binName, bin] = Object.entries(resources)[0]!;
  files.set(`${RAW}props/crate.gltf`, new TextEncoder().encode(JSON.stringify(json)));
  files.set(`${RAW}props/${binName}`, bin);
  files.set('https://arweave.net/robert', await vrmFromMesh(figure(), '0'));
});

describe('validateSources', () => {
  it('accepts a list of items with pinned sources', () => {
    expect(validateSources({ source: 'kaykit', items: [item({})] }).ok).toBe(true);
  });

  it('refuses licences the audit does not allow in the shipped catalogue, and unpinned sources', () => {
    const r = validateSources({
      source: 'x',
      items: [
        item({ licence: 'CC-BY-NC-4.0' }),
        item({ id: 'a/Prop/b', fetch: { github: 'a/b', commit: 'main', path: 'x.glb' } }),
        item({ id: 'a/Prop/c', fetch: { url: 'https://x.org/c.vrm', sha256: 'nope' } }),
        item({ id: 'a/Prop/d', credit: ' ' }),
      ],
    });
    expect(r.ok).toBe(false);
    if (r.ok) return;
    expect(r.errors.join('\n')).toMatch(/licence/);
    expect(r.errors.join('\n')).toMatch(/commit/);
    expect(r.errors.join('\n')).toMatch(/sha256/);
    expect(r.errors.join('\n')).toMatch(/credit/);
  });

  it('accepts parts to exclude for the list and for an item, as lists of name patterns', () => {
    const list = (exclude: unknown, itemExclude?: unknown) =>
      validateSources({
        source: 'k',
        exclude,
        items: [item(itemExclude === undefined ? {} : { exclude: itemExclude })],
      }).ok;
    expect(list({ nodes: ['*Sword*'], animations: ['*Attack*'] }, { nodes: ['Cape'] })).toBe(true);
    expect(list({ meshes: ['x'] })).toBe(false);
    expect(list({ nodes: 'Sword' })).toBe(false);
    expect(list(undefined, { animations: [''] })).toBe(false);
  });

  it('lets an Arweave address, which names fixed content, leave out the sha256', () => {
    const tx = 'gfVzs1oH_aPaHVxpQK86HT_rqzyrFPOUKUrDJ30yprs';
    const vrm = (url: string) =>
      validateSources({ source: 'osa', items: [item({ fetch: { url, ext: 'vrm' } })] }).ok;
    expect(vrm(`https://arweave.net/${tx}`)).toBe(true);
    expect(vrm('https://example.org/robert.vrm')).toBe(false);
  });
});

describe('fetchModel', () => {
  it('fetches a model from GitHub at a pinned commit, and records what it fetched', async () => {
    const got = await fetchModel(item({}) as never, fetcher);
    expect(got.ext).toBe('glb');
    expect(got.fetched).toEqual([
      { url: `${RAW}chars/Knight.glb`, sha256: sha(files.get(`${RAW}chars/Knight.glb`)!) },
    ]);
  });

  it('packs a .gltf and its files into one binary glTF', async () => {
    const got = await fetchModel(
      item({ fetch: { github: 'kaykit/pack', commit: COMMIT, path: 'props/crate.gltf' } }) as never,
      fetcher,
    );
    expect(got.ext).toBe('glb');
    expect(got.fetched).toHaveLength(2);
    expect(new TextDecoder().decode(got.bytes.slice(0, 4))).toBe('glTF');
  });

  it('checks a downloaded file against its sha256', async () => {
    const vrm = files.get('https://arweave.net/robert')!;
    const ok = item({ fetch: { url: 'https://arweave.net/robert', sha256: sha(vrm), ext: 'vrm' } });
    expect((await fetchModel(ok as never, fetcher)).ext).toBe('vrm');
    const bad = item({
      fetch: { url: 'https://arweave.net/robert', sha256: 'b'.repeat(64), ext: 'vrm' },
    });
    await expect(fetchModel(bad as never, fetcher)).rejects.toThrow(/sha256/);
  });
});

describe('buildSources', () => {
  let dir: string;
  beforeAll(async () => {
    dir = await mkdtemp(join(tmpdir(), 'backstage-sources-'));
    await mkdir(join(dir, 'sources'));
    const vrm = files.get('https://arweave.net/robert')!;
    await writeFile(
      join(dir, 'sources/test.json'),
      JSON.stringify({
        source: 'test',
        items: [
          item({}),
          item({
            id: 'kaykit/Prop/crate',
            displayName: 'Crate',
            class: 'Prop',
            section: 'props',
            credit: 'Crate by Kay Lousberg, KayKit (CC0)',
            fetch: { github: 'kaykit/pack', commit: COMMIT, path: 'props/crate.gltf' },
          }),
          item({
            id: 'osa/Biped/robert',
            displayName: 'Robert',
            credit: 'Robert by Polygonal Mind, 100Avatars (CC0)',
            page: 'https://arweave.net/robert',
            fetch: { url: 'https://arweave.net/robert', sha256: sha(vrm), ext: 'vrm' },
          }),
        ],
      }),
    );
  });
  afterAll(async () => {
    await rm(dir, { recursive: true, force: true });
  });

  it('writes the models, a manifest that validates, provenance and sketches', async () => {
    const report = await buildSources(dir, { fetcher, today: '2026-10-25' });
    expect(report.items).toBe(3);
    const manifest = JSON.parse(await readFile(join(dir, 'backstage.json'), 'utf8'));
    expect(validateManifest(manifest).ok).toBe(true);
    const byId = Object.fromEntries(manifest.items.map((i: { id: string }) => [i.id, i]));
    const knight = byId['kaykit/Biped/knight'];
    expect(knight.files.model).toBe('models/kaykit/Biped/knight.glb');
    expect(knight.joints).toContain('leftUpperArm');
    expect(knight.source).toEqual({
      url: 'https://github.com/kaykit/pack',
      retrieved: '2026-10-25',
    });
    expect(knight.defaultSize.height).toBeCloseTo(1.78, 1);
    expect(knight.sketches).toHaveLength(16);
    expect(byId['kaykit/Prop/crate'].joints).toBe('prop-only');
    expect(byId['kaykit/Prop/crate'].sketches).toHaveLength(4);
    // The VRM is kept byte for byte, and its VRM table maps its oddly named bones.
    expect(await readFile(join(dir, 'models/osa/Biped/robert.vrm'))).toEqual(
      Buffer.from(files.get('https://arweave.net/robert')!),
    );
    expect(byId['osa/Biped/robert'].joints).toContain('hips');
    expect(byId['osa/Biped/robert'].sketches).toHaveLength(16);

    const provenance = JSON.parse(await readFile(join(dir, 'provenance.json'), 'utf8'));
    expect(provenance['osa/Biped/robert']).toMatchObject({ vrm: '0', skeleton: 'mapped' });
    expect(provenance['kaykit/Prop/crate'].fetched).toHaveLength(2);
    expect(provenance['kaykit/Biped/knight'].excluded).toEqual({ nodes: [], animations: [] });
    const md = await readFile(join(dir, 'sources-report.md'), 'utf8');
    expect(md).toContain('| `osa/Biped/robert` | Robert | CC0-1.0 |');
    expect(existsSync(join(dir, 'sketches/osa/Biped/robert/side-walk.svg'))).toBe(true);
  });

  it('keeps items it did not build, and replaces those it rebuilt', async () => {
    const path = join(dir, 'backstage.json');
    const manifest = JSON.parse(await readFile(path, 'utf8'));
    const other = { ...manifest.items[1], id: 'other/Prop/thing', displayName: 'Thing' };
    manifest.items.push(other);
    await writeFile(path, JSON.stringify(manifest));
    const report = await buildSources(dir, { fetcher, today: '2026-10-26' });
    expect(report.items).toBe(3);
    const after = JSON.parse(await readFile(path, 'utf8'));
    expect(after.items.map((i: { id: string }) => i.id)).toContain('other/Prop/thing');
    expect(after.items.filter((i: { id: string }) => i.id === 'kaykit/Biped/knight')).toHaveLength(
      1,
    );
  });
});
