import { describe, expect, it } from 'vitest';
import { isModelPath } from './class-backstage.ts';
import { storedClassFolders } from './class-folders.ts';
import { BACKSTAGE_RECORD_LIMIT, FileError } from './files.ts';
import type { FileStore } from './store.ts';
import { memoryStore } from './testing/memory-files.ts';

const files = (...sizes: number[]) =>
  sizes.map((size, index) => ({ path: `file-${index}.glb`, bytes: new Uint8Array(size) }));
const record = { name: 'Robot' };

/** A memory store whose writes fail from the `failAt`th one on. */
function failingStore(): FileStore & {
  failAt: number;
  readonly files: ReadonlyMap<string, Uint8Array>;
} {
  const inner = memoryStore();
  let writes = 0;
  const store = {
    ...inner,
    files: inner.files,
    failAt: Infinity,
    async write(path: readonly string[], data: Uint8Array) {
      writes += 1;
      if (writes >= store.failAt) throw new FileError('full');
      return inner.write(path, data);
    },
  };
  return store;
}

describe('the class Backstage’s limits (decision 0066)', () => {
  it('refuses a file over the limit, and a record over its own', async () => {
    const backstage = storedClassFolders(memoryStore(), { limit: 10 }).backstage();
    await expect(backstage.add('class', 'a', record, files(11))).rejects.toMatchObject({
      code: 'too_big',
    });
    const huge = { text: 'x'.repeat(BACKSTAGE_RECORD_LIMIT) };
    await expect(backstage.add('class', 'b', huge, files(1))).rejects.toMatchObject({
      code: 'too_big',
    });
    expect(await backstage.list()).toEqual([]);
  });

  it('is full past the class total, counting the bin too', async () => {
    const backstage = storedClassFolders(memoryStore(), { classLimit: 100 }).backstage();
    await backstage.add('class', 'a', record, files(60));
    await backstage.remove('a');
    await expect(backstage.add('class', 'b', record, files(50))).rejects.toMatchObject({
      code: 'full',
    });
    await backstage.emptyBin();
    await backstage.add('class', 'b', record, files(50, 40));
  });
});

describe('an add is all or nothing', () => {
  const setUp = async () => {
    let time = Date.parse('2026-11-08T10:00:00Z');
    const store = failingStore();
    const folders = storedClassFolders(store, { clock: () => new Date(time) });
    const backstage = folders.backstage();
    store.failAt = 3; // the third file of three, or item.json
    await expect(backstage.add('class', 'robot', record, files(1, 1, 1))).rejects.toThrow();
    store.failAt = Infinity;
    const left = () => [...store.files.keys()].filter((path) => path.startsWith('backstage/'));
    return { backstage, left, later: (ms: number) => (time += ms) };
  };

  it('lists nothing from a failed add, and lets its id be used', async () => {
    const { backstage, left } = await setUp();
    expect(left().length).toBeGreaterThan(0);
    expect(await backstage.list()).toEqual([]);
    await backstage.add('class', 'robot', record, files(1));
    expect((await backstage.list()).map((item) => item.id)).toEqual(['robot']);
  });

  /** The item folders on disk: `backstage/items/<folder>/...`. */
  const folders = (paths: string[]) => new Set(paths.map((path) => path.split('/')[2]));

  it('sweeps a failed add’s files away a minute on, at the next add', async () => {
    const { backstage, left, later } = await setUp();
    later(61_000);
    await backstage.add('class', 'other', record, files(1));
    expect(folders(left()).size).toBe(1);
  });

  it('leaves them while they could be another window’s add in progress', async () => {
    const { backstage, left, later } = await setUp();
    later(10_000);
    await backstage.add('class', 'other', record, files(1));
    expect(folders(left()).size).toBe(2);
  });
});

describe('model paths', () => {
  it.each(['model.glb', 'models/robot/model.glb', 'sketches/front.svg', 'Robot (2).glb'])(
    'allows %j',
    (path) => {
      expect(isModelPath(path)).toBe(true);
    },
  );

  it.each(['', '/model.glb', 'a//b', '../x', 'a/./b', 'a\\b', 'x'.repeat(256)])(
    'refuses %j',
    (path) => {
      expect(isModelPath(path)).toBe(false);
    },
  );
});

describe('ids', () => {
  it('can be any text the import makes, up to 200 characters', async () => {
    const backstage = storedClassFolders(memoryStore()).backstage();
    await backstage.add('class', 'class/Cast/Zoë’s robot', record, files(1));
    await expect(backstage.add('class', 'x'.repeat(201), record, files(1))).rejects.toMatchObject({
      code: 'invalid',
    });
    expect(text(await backstage.read('class/Cast/Zoë’s robot', 'file-0.glb'))).toHaveLength(1);
  });
});

const text = (data: Uint8Array) => new TextDecoder().decode(data);
