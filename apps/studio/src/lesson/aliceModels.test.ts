import { MANIFEST_VERSION } from '@storystage/backstage';
import { browserHost, type HostInterface } from '@storystage/host';
import { describe, expect, it, vi } from 'vitest';
import { aliceModelSource } from './aliceWorker.ts';

// The shipped Backstage's Alice models, for opening an Alice world (S6's aliceModelsFrom, #311).

// The Backstage loader's own test item (packages/backstage/src/loader.test.ts), with an id and height.
const item = (id: string, height: number) => ({
  id,
  section: 'cast',
  class: 'Biped',
  displayName: id.split('/').pop(),
  themes: [],
  files: { model: `models/${id}.glb`, thumbnail: `thumbnails/${id}.webp` },
  joints: ['hips', 'head'],
  defaultSize: { height },
  budget: { triangles: 100, textureMaxPx: 0 },
  licence: 'CC0-1.0',
  credit: `${id} (CC0)`,
  source: { url: 'https://example.org' },
  origin: 'shipped',
  sketches: [],
});

const host = (folder: string): HostInterface => ({ ...browserHost, backstageFolder: folder });

const serving = (items: unknown[]) =>
  vi.fn(async () => new Response(JSON.stringify({ manifestVersion: MANIFEST_VERSION, items })));

describe('aliceModelSource', () => {
  it('keys the shipped Backstage’s Alice models by gallery key, read once', async () => {
    const fetch = serving([
      item('Biped/Person/AliceLiddell', 1.2),
      item('kaykit/Biped/knight', 1.6),
    ]);
    const models = aliceModelSource(host('/backstage'), { fetch });
    const map = await models();
    expect([...map.keys()]).toEqual(['Biped/AliceLiddell']);
    expect(map.get('Biped/AliceLiddell')).toMatchObject({
      id: 'Biped/Person/AliceLiddell',
      height: 1.2,
    });
    await models();
    expect(fetch).toHaveBeenCalledTimes(1);
  });

  it('gives none when there’s no shipped Backstage, or it can’t be read', async () => {
    expect((await aliceModelSource(host(''))()).size).toBe(0);
    const failing = vi.fn(async () => new Response('missing', { status: 404 }));
    expect((await aliceModelSource(host('/missing-backstage'), { fetch: failing })()).size).toBe(0);
  });
});
