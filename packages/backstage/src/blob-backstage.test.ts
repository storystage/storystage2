import { describe, expect, it } from 'vitest';
import {
  filmBackstage,
  openClassBackstage,
  type ClassModelStore,
  type ObjectUrls,
} from './blob-backstage.ts';
import { backstageFrom, combineBackstages } from './loader.ts';
import { MANIFEST_VERSION, type BackstageItem } from './manifest.ts';

const record = (id: string, extra: Partial<BackstageItem> = {}): BackstageItem =>
  ({
    id,
    section: 'props',
    class: 'Prop',
    displayName: id.split('/').pop()!,
    themes: [],
    files: { model: 'model.glb', thumbnail: 'thumbnail.webp' },
    joints: 'prop-only',
    defaultSize: { height: 1 },
    budget: { triangles: 12, textureMaxPx: 0 },
    licence: 'own-work',
    credit: `${id.split('/').pop()}, made by our class`,
    origin: 'imported',
    sketches: [],
    ...extra,
  }) as BackstageItem;

/** Stand-in object URLs: numbered, with what each was made from, and which were revoked. */
function fakeUrls() {
  const made: { url: string; type: string; size: number }[] = [];
  const revoked: string[] = [];
  const urls: ObjectUrls = {
    create(blob) {
      const url = `blob:test/${made.length + 1}`;
      made.push({ url, type: blob.type, size: blob.size });
      return url;
    },
    revoke: (url) => void revoked.push(url),
  };
  return { urls, made, revoked };
}

const bytes = (n: number) => new Uint8Array(n).fill(7);

describe('filmBackstage (decision 0049)', () => {
  const crate = record('class/Prop/crate');
  const files = new Map([
    ['models/prop-crate/model.glb', bytes(10)],
    ['models/prop-crate/thumbnail.webp', bytes(3)],
  ]);

  it('gives the stage blob: URLs for a film’s packed models, made once, on first use', () => {
    const { urls, made } = fakeUrls();
    const { backstage } = filmBackstage([{ folder: 'prop-crate', item: crate }], files, {
      checked: ['prop-crate'],
      urls,
    });
    expect(made).toEqual([]);
    expect(backstage.find(crate.id)).toEqual({ url: 'blob:test/1', joints: 'prop-only' });
    expect(backstage.find(crate.id)!.url).toBe('blob:test/1');
    expect(backstage.thumbnail(crate.id)).toBe('blob:test/2');
    expect(made.map((m) => [m.type, m.size])).toEqual([
      ['model/gltf-binary', 10],
      ['image/webp', 3],
    ]);
    expect(backstage.items.map((i) => i.id)).toEqual([crate.id]);
    expect(backstage.credits()[0]!.lines[0]!.text).toBe('crate, made by our class');
  });

  it('shows only the models that passed the check, as a film is untrusted (spec 03, 1.3)', () => {
    const { urls } = fakeUrls();
    const unchecked = filmBackstage([{ folder: 'prop-crate', item: crate }], files, {
      checked: [],
      urls,
    });
    expect(unchecked.backstage.items).toEqual([]);
    expect(unchecked.backstage.find(crate.id)).toBeNull();
  });

  it('revokes every URL it made, and finds nothing after', () => {
    const { urls, revoked } = fakeUrls();
    const film = filmBackstage([{ folder: 'prop-crate', item: crate }], files, {
      checked: ['prop-crate'],
      urls,
    });
    film.backstage.find(crate.id);
    film.backstage.thumbnail(crate.id);
    film.dispose();
    expect(revoked).toEqual(['blob:test/1', 'blob:test/2']);
    expect(film.backstage.find(crate.id)).toBeNull();
  });

  it('leaves out records that aren’t imported models, and finds none for a missing file', () => {
    const { urls } = fakeUrls();
    const { backstage } = filmBackstage(
      [
        { folder: 'a', item: { ...crate, origin: 'shipped' } },
        { folder: 'b', item: { not: 'a record' } },
        { folder: 'c', item: record('class/Prop/lost') },
      ],
      files,
      { checked: ['a', 'b', 'c'], urls },
    );
    expect(backstage.items.map((i) => i.id)).toEqual(['class/Prop/lost']);
    expect(backstage.find('class/Prop/lost' as BackstageItem['id'])).toBeNull();
  });
});

describe('openClassBackstage (decision 0066)', () => {
  function store(fail = new Set<string>()) {
    const reads: string[] = [];
    const s: ClassModelStore = {
      list: async () => [
        { id: 'class/Prop/crate', record: record('class/Prop/crate') },
        { id: 'class/Prop/duck', record: record('class/Prop/duck') },
        { id: 'class/Prop/odd', record: record('class/Prop/other') },
      ],
      read: async (id, path) => {
        reads.push(`${id} ${path}`);
        if (fail.has(id)) throw Object.assign(new Error('locked'), { code: 'locked' });
        return bytes(4);
      },
    };
    return { store: s, reads };
  }

  it('lists the records at once, and reads a model’s files only when it’s prepared', async () => {
    const { store: s, reads } = store();
    const { urls } = fakeUrls();
    const view = await openClassBackstage(s, urls);
    // A record whose id doesn't match its entry is left out.
    expect(view.backstage.items.map((i) => i.id)).toEqual(['class/Prop/crate', 'class/Prop/duck']);
    expect(view.backstage.find('class/Prop/crate' as BackstageItem['id'])).toBeNull();
    expect(reads).toEqual([]);
    await view.prepare(['class/Prop/crate', 'class/Prop/nowhere']);
    expect(reads.sort()).toEqual(['class/Prop/crate model.glb', 'class/Prop/crate thumbnail.webp']);
    expect(view.backstage.find('class/Prop/crate' as BackstageItem['id'])?.url).toMatch(/^blob:/);
    expect(view.backstage.find('class/Prop/duck' as BackstageItem['id'])).toBeNull();
    await view.prepare(['class/Prop/crate']);
    expect(reads).toHaveLength(2); // read once
  });

  it('reads a model once when two prepares overlap, as a load and a preload can (S2)', async () => {
    const { store: s, reads } = store();
    const view = await openClassBackstage(s, fakeUrls().urls);
    await Promise.all([view.prepare(['class/Prop/crate']), view.prepare(['class/Prop/crate'])]);
    expect(reads).toHaveLength(2); // the model and its thumbnail, once each
    expect(view.backstage.find('class/Prop/crate' as BackstageItem['id'])?.url).toMatch(/^blob:/);
  });

  it('reads nothing once disposed, and keeps nothing from a read under way', async () => {
    const { store: s, reads } = store();
    const view = await openClassBackstage(s, fakeUrls().urls);
    const under = view.prepare(['class/Prop/duck']);
    view.dispose();
    await under;
    await view.prepare(['class/Prop/crate']);
    expect(reads.filter((r) => r.startsWith('class/Prop/crate'))).toEqual([]);
    expect(view.backstage.find('class/Prop/duck' as BackstageItem['id'])).toBeNull();
  });

  it('finds a model imported since it was made, listing again only for a class id it doesn’t know', async () => {
    const stored = [{ id: 'class/Prop/crate', record: record('class/Prop/crate') }];
    let lists = 0;
    const s: ClassModelStore = {
      list: async () => {
        lists++;
        return [...stored];
      },
      read: async () => bytes(4),
    };
    const view = await openClassBackstage(s, fakeUrls().urls);
    await view.prepare(['class/Prop/crate']);
    const crateUrl = view.backstage.find('class/Prop/crate' as BackstageItem['id'])!.url;
    expect(lists).toBe(1);
    // A teacher imports a duck in Settings while the tab stays mounted.
    stored.push({ id: 'class/Prop/duck', record: record('class/Prop/duck') });
    await view.prepare(['kaykit/Prop/mug', 'class/Prop/crate']);
    expect(lists).toBe(1); // a shipped id, and known ones: no listing
    await view.prepare(['class/Prop/duck']);
    expect(lists).toBe(2);
    expect(view.backstage.items.map((i) => i.id)).toEqual(['class/Prop/crate', 'class/Prop/duck']);
    expect(view.backstage.find('class/Prop/duck' as BackstageItem['id'])?.url).toMatch(/^blob:/);
    // A class id the store doesn't have (a film's own packed model) lists once, not every time.
    await view.prepare(['class/Prop/only-in-a-film']);
    await view.prepare(['class/Prop/only-in-a-film']);
    expect(lists).toBe(3);
    // The URL already made is kept.
    expect(view.backstage.find('class/Prop/crate' as BackstageItem['id'])!.url).toBe(crateUrl);
  });

  it('leaves a model it can’t read not found, so it shows as a stand-in', async () => {
    const { store: s } = store(new Set(['class/Prop/duck']));
    const view = await openClassBackstage(s, fakeUrls().urls);
    await view.prepare(['class/Prop/duck']);
    expect(view.backstage.find('class/Prop/duck' as BackstageItem['id'])).toBeNull();
  });

  it('combines as shipped, film, class: the shipped one first, the film’s copy before the class’s', async () => {
    const shippedItem = {
      ...record('kaykit/Prop/crate'),
      origin: 'shipped',
      licence: 'CC0-1.0',
      credit: 'Crate by Kay (CC0)',
      source: { url: 'https://example.org' },
    } as BackstageItem;
    const shipped = backstageFrom(
      { manifestVersion: MANIFEST_VERSION, items: [shippedItem] },
      '/b/',
    );
    const film = filmBackstage(
      [{ folder: 'prop-crate', item: record('class/Prop/crate') }],
      new Map([['models/prop-crate/model.glb', bytes(2)]]),
      { checked: ['prop-crate'], urls: fakeUrls().urls },
    );
    const { store: s, reads } = store();
    const cls = await openClassBackstage(s, fakeUrls().urls);
    const all = combineBackstages(shipped, film.backstage, cls.backstage);
    expect(all.find('kaykit/Prop/crate' as BackstageItem['id'])?.url).toBe('/b/model.glb');
    // The film's copy answers, with no read from the class.
    expect(all.find('class/Prop/crate' as BackstageItem['id'])?.url).toBe('blob:test/1');
    expect(reads).toEqual([]);
    // A class model the film doesn't carry needs preparing.
    expect(all.find('class/Prop/duck' as BackstageItem['id'])).toBeNull();
    await cls.prepare(['class/Prop/duck']);
    expect(all.find('class/Prop/duck' as BackstageItem['id'])?.url).toMatch(/^blob:/);
  });
});
