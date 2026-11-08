import { beforeEach, describe, expect, it } from 'vitest';
import {
  BackstageError,
  backstageFrom,
  combineBackstages,
  forgetOpenedBackstages,
  openBackstage,
} from './loader.ts';
import { MANIFEST_VERSION, type BackstageItem, type BackstageManifest } from './manifest.ts';

const item = (id: string, over: Record<string, unknown> = {}): BackstageItem =>
  ({
    id,
    section: 'cast',
    class: 'Biped',
    displayName: id.split('/').pop(),
    themes: [],
    files: { model: `models/${id}.glb`, thumbnail: `thumbnails/${id}.webp` },
    joints: ['hips', 'head'],
    defaultSize: { height: 1.6 },
    budget: { triangles: 100, textureMaxPx: 0 },
    licence: 'CC0-1.0',
    credit: `${id} (CC0)`,
    source: { url: 'https://example.org' },
    origin: 'shipped',
    sketches: [],
    ...over,
  }) as unknown as BackstageItem;

const manifest = (...items: BackstageItem[]): BackstageManifest => ({
  manifestVersion: MANIFEST_VERSION,
  items,
});

const shipped = manifest(
  item('kaykit/Biped/knight'),
  item('osa/Biped/rose', {
    files: { model: 'models/osa/Biped/rose.vrm', thumbnail: 'thumbnails/osa/Biped/rose.webp' },
    vrm: '0',
  }),
  item('kaykit/Prop/mug', { section: 'props', class: 'Prop', joints: 'prop-only' }),
);

/** A fake `fetch` over a map of addresses, counting what it is asked for. */
function fakeFetch(files: Record<string, string>) {
  const asked: string[] = [];
  const fetch = async (url: string) => {
    asked.push(url);
    const body = files[url];
    return body === undefined
      ? new Response('', { status: 404 })
      : new Response(body, { status: 200 });
  };
  return { fetch: fetch as typeof globalThis.fetch, asked };
}

beforeEach(() => forgetOpenedBackstages());

describe('backstageFrom', () => {
  const backstage = backstageFrom(shipped, 'https://app.storystage.org/backstage/');

  it("gives the stage a model's address and joints, as its ModelSource wants", () => {
    expect(backstage.find('kaykit/Biped/knight' as never)).toEqual({
      url: 'https://app.storystage.org/backstage/models/kaykit/Biped/knight.glb',
      joints: ['hips', 'head'],
    });
    expect(backstage.find('kaykit/Prop/mug' as never)?.joints).toBe('prop-only');
    expect(backstage.find('nobody/Biped/ghost' as never)).toBeNull();
  });

  it('says which VRM avatars face -Z, so the stage turns them', () => {
    expect(backstage.find('osa/Biped/rose' as never)).toMatchObject({
      url: 'https://app.storystage.org/backstage/models/osa/Biped/rose.vrm',
      vrm: '0',
    });
  });

  it('gives thumbnails, items, credits and the Prompter catalogue from the same manifest', () => {
    expect(backstage.thumbnail('kaykit/Prop/mug' as never)).toBe(
      'https://app.storystage.org/backstage/thumbnails/kaykit/Prop/mug.webp',
    );
    expect(backstage.thumbnail('nobody/Biped/ghost' as never)).toBeNull();
    expect(backstage.item('kaykit/Prop/mug' as never)?.section).toBe('props');
    expect(backstage.items).toHaveLength(3);
    expect(backstage.credits().map((s) => s.title)).toEqual(['Cast', 'Props']);
    expect(backstage.catalogue()).toContain('kaykit/Biped/knight: knight');
  });

  it('joins addresses with or without a slash, and keeps odd characters safe', () => {
    const plain = backstageFrom(manifest(item('a/Biped/b c')), 'backstage');
    expect(plain.find('a/Biped/b c' as never)?.url).toBe('backstage/models/a/Biped/b%20c.glb');
    const slashes = backstageFrom(manifest(item('a/Biped/b')), 'backstage///');
    expect(slashes.find('a/Biped/b' as never)?.url).toBe('backstage/models/a/Biped/b.glb');
  });

  it('trims a folder in linear time, however many slashes it has (CodeQL)', () => {
    const start = performance.now();
    const odd = backstageFrom(manifest(item('a/Biped/b')), `${'/'.repeat(200_000)}x`);
    expect(odd.find('a/Biped/b' as never)?.url).toMatch(/x\/models\/a\/Biped\/b\.glb$/);
    expect(performance.now() - start).toBeLessThan(1000);
  });

  it('refuses a manifest that is not valid, saying so in plain words', () => {
    expect(() => backstageFrom({ manifestVersion: '1.0.0', items: [] } as never, 'x')).toThrow(
      BackstageError,
    );
  });
});

describe('openBackstage', () => {
  const folder = 'https://app.storystage.org/backstage';

  it('reads and checks backstage.json from the folder', async () => {
    const { fetch } = fakeFetch({ [`${folder}/backstage.json`]: JSON.stringify(shipped) });
    const backstage = await openBackstage(folder, { fetch });
    expect(backstage.items).toHaveLength(3);
  });

  it('reads it once in a session, however many times it is opened', async () => {
    const { fetch, asked } = fakeFetch({ [`${folder}/backstage.json`]: JSON.stringify(shipped) });
    const [a, b] = await Promise.all([
      openBackstage(folder, { fetch }),
      openBackstage(`${folder}/`, { fetch }),
    ]);
    expect(a).toBe(b);
    await openBackstage(folder, { fetch });
    expect(asked).toHaveLength(1);
  });

  it('says plainly when it is missing, damaged or out of date, and tries again next time', async () => {
    const missing = fakeFetch({});
    await expect(openBackstage(folder, { fetch: missing.fetch })).rejects.toMatchObject({
      code: 'missing',
    });
    const damaged = fakeFetch({ [`${folder}/backstage.json`]: '{ not json' });
    await expect(openBackstage(folder, { fetch: damaged.fetch })).rejects.toMatchObject({
      code: 'damaged',
    });
    const old = fakeFetch({
      [`${folder}/backstage.json`]: JSON.stringify({ ...shipped, manifestVersion: '2.0.0' }),
    });
    const error = await openBackstage(folder, { fetch: old.fetch }).catch((e: unknown) => e);
    expect(error).toMatchObject({ code: 'damaged' });
    expect((error as BackstageError).message).toMatch(/^Backstage/);
    expect((error as BackstageError).details.join('\n')).toMatch(/manifestVersion/);
    // A failure isn't remembered: the next open tries again.
    const good = fakeFetch({ [`${folder}/backstage.json`]: JSON.stringify(shipped) });
    expect((await openBackstage(folder, { fetch: good.fetch })).items).toHaveLength(3);
  });
});

describe('combineBackstages', () => {
  const classes = backstageFrom(
    manifest(
      item('class/Biped/robot', { origin: 'imported', credit: 'Robot by Sam' }),
      item('kaykit/Biped/knight', { origin: 'imported', credit: 'Not the real knight' }),
    ),
    'production/models/class',
  );
  const both = combineBackstages(backstageFrom(shipped, 'backstage'), classes);

  it("finds a model in the shipped Backstage first, then the class's", () => {
    expect(both.find('class/Biped/robot' as never)?.url).toBe(
      'production/models/class/models/class/Biped/robot.glb',
    );
    expect(both.find('kaykit/Biped/knight' as never)?.url).toBe(
      'backstage/models/kaykit/Biped/knight.glb',
    );
    expect(both.thumbnail('class/Biped/robot' as never)).toMatch(/^production\//);
  });

  it('lists each id once, the first Backstage winning', () => {
    expect(both.items.map((i) => i.id)).toEqual([
      'kaykit/Biped/knight',
      'osa/Biped/rose',
      'kaykit/Prop/mug',
      'class/Biped/robot',
    ]);
    expect(both.item('kaykit/Biped/knight' as never)?.credit).toBe('kaykit/Biped/knight (CC0)');
  });

  it("keeps imported models out of the Prompter's catalogue, but credits them", () => {
    expect(both.catalogue()).not.toContain('robot');
    expect(both.credits()[0]!.lines.map((l) => l.text)).toContain('Robot by Sam');
  });
});
