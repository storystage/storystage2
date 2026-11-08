import { describe, expect, it } from 'vitest';
import { storedClassFolders } from './class-folders.ts';
import { FileError } from './files.ts';
import { checkPath, isSafePart, type FileStore } from './store.ts';
import { memoryStore } from './testing/memory-files.ts';

const bytes = (text: string) => new TextEncoder().encode(text);
const text = (data: Uint8Array) => new TextDecoder().decode(data);

/** A memory store whose writes fail from the `failAt`th one on, as a full disk or a crash would. */
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

describe('a save is atomic (spec 05 section 6.3)', () => {
  const setUp = async () => {
    const store = failingStore();
    const folders = storedClassFolders(store);
    const folder = await folders.open((await folders.addPupil('Ava')).id);
    const { key } = await folder.write(null, 'Film', bytes('whole'));
    return { store, folder, key, writesSoFar: store.files.size };
  };

  it.each([
    ['writing the new version', 1],
    ['writing meta.json', 2],
  ])('a failure while %s leaves the last whole version', async (_step, nth) => {
    const { store, folder, key } = await setUp();
    // class.json, the first version and its meta.json are the first three writes.
    store.failAt = 3 + nth;
    await expect(folder.write(key, 'Film', bytes('half'))).rejects.toMatchObject({ code: 'full' });
    expect(text(await folder.read(key))).toBe('whole');
    expect(await folder.backups(key)).toEqual([]);
  });

  it('the next save removes what a failed one left behind', async () => {
    const { store, folder, key } = await setUp();
    store.failAt = 5;
    await expect(folder.write(key, 'Film', bytes('half'))).rejects.toThrow();
    store.failAt = Infinity;
    await folder.write(key, 'Film', bytes('next'), { backup: false });
    const kept = [...store.files.keys()].filter((name) => name.includes(key));
    expect(kept.length).toBe(2);
    expect(text(await folder.read(key))).toBe('next');
  });

  it('a folder with no whole meta.json isn’t listed', async () => {
    const store = failingStore();
    const folders = storedClassFolders(store);
    const folder = await folders.open((await folders.addPupil('Ava')).id);
    store.failAt = 3;
    await expect(folder.write(null, 'Film', bytes('x'))).rejects.toThrow();
    expect(await folder.list()).toEqual([]);
  });
});

describe('first saves that never finished (S4’s review of #194)', () => {
  const setUp = async () => {
    let time = Date.parse('2026-11-08T10:00:00Z');
    const store = failingStore();
    const folders = storedClassFolders(store, { clock: () => new Date(time) });
    const pupil = await folders.addPupil('Ava');
    const folder = await folders.open(pupil.id);
    store.failAt = 3; // the meta.json of the first save
    await expect(folder.write(null, 'Film', bytes('x'))).rejects.toThrow();
    store.failAt = Infinity;
    const left = () => [...store.files.keys()].filter((name) => name.startsWith('pupils/'));
    return { folders, pupil, left, later: (ms: number) => (time += ms) };
  };

  it('are swept away when the pupil’s folder is next opened, a minute on', async () => {
    const { folders, pupil, left, later } = await setUp();
    expect(left()).toHaveLength(1);
    later(61_000);
    await folders.open(pupil.id);
    expect(left()).toEqual([]);
  });

  it('are left alone while they could still be another window’s save in progress', async () => {
    const { folders, pupil, left, later } = await setUp();
    later(10_000);
    await folders.open(pupil.id);
    expect(left()).toHaveLength(1);
  });

  it('leave whole productions, and files the folders didn’t write, alone', async () => {
    const store = memoryStore();
    const folders = storedClassFolders(store, { clock: () => new Date(0) });
    const pupil = await folders.addPupil('Ava');
    const { key } = await (await folders.open(pupil.id)).write(null, 'Film', bytes('x'));
    await store.write(['pupils', pupil.id, 'production-stranger', 'notes.txt'], bytes('?'));
    const later = storedClassFolders(store);
    expect(text(await (await later.open(pupil.id)).read(key))).toBe('x');
    expect(
      await store.read(['pupils', pupil.id, 'production-stranger', 'notes.txt']),
    ).not.toBeNull();
  });
});

describe('a read alongside a save (S4’s review of #194)', () => {
  it('waits for the save, so it never finds a file the save has just tidied away', async () => {
    const folders = storedClassFolders(memoryStore());
    const folder = await folders.open((await folders.addPupil('Ava')).id);
    const { key } = await folder.write(null, 'Film', bytes('one'));
    const saves = Array.from({ length: 5 }, (_, n) => folder.write(key, 'Film', bytes(`v${n}`)));
    const reads = Array.from({ length: 5 }, () => folder.read(key));
    await Promise.all(saves);
    for (const read of await Promise.all(reads)) expect(text(read)).toMatch(/^v\d$/);
  });
});

describe('what goes on disk (spec 05 section 6.2)', () => {
  it('keeps names out of every path, and ids random and safe', async () => {
    const store = memoryStore();
    const folders = storedClassFolders(store);
    const pupil = await folders.addPupil('Zoë O’Brien');
    const folder = await folders.open(pupil.id);
    await folder.write(null, 'The Owl & the Cat', bytes('x'));
    for (const path of store.files.keys()) {
      expect(path).not.toMatch(/Zo|Brien|Owl|Cat/);
      expect(path.split('/').every(isSafePart)).toBe(true);
    }
    expect(pupil.id).toMatch(/^pupil-[a-z0-9]{12}$/);
  });

  it('refuses to read a class list that isn’t one', async () => {
    const store = memoryStore();
    await store.write(['class.json'], bytes('{ "pupils": "nobody" }'));
    await expect(storedClassFolders(store).pupils()).rejects.toMatchObject({ code: 'unreadable' });
  });

  it('runs changes one at a time, so two at once both land', async () => {
    const folders = storedClassFolders(memoryStore());
    await Promise.all([folders.addPupil('Ava'), folders.addPupil('Ben'), folders.addPupil('Cai')]);
    expect((await folders.pupils()).map((pupil) => pupil.name).sort()).toEqual([
      'Ava',
      'Ben',
      'Cai',
    ]);
  });

  it('treats a key that isn’t a safe part as not there (threat PS1)', async () => {
    const folders = storedClassFolders(memoryStore());
    const folder = await folders.open((await folders.addPupil('Ava')).id);
    for (const key of ['..', '../pupil-x/production-y', 'A', '']) {
      await expect(folder.read(key)).rejects.toMatchObject({ code: 'not_found' });
    }
  });
});

describe('safe path parts (spec 05 section 6.1)', () => {
  it.each(['class.json', 'pupil-abc123', 'v-x1.storystage', '0'])('allows %j', (part) => {
    expect(isSafePart(part)).toBe(true);
  });

  it.each(['', '.', '..', '.hidden', '-x', 'A', 'a/b', 'a\\b', 'x'.repeat(65), 'zoë'])(
    'refuses %j',
    (part) => {
      expect(isSafePart(part)).toBe(false);
    },
  );

  it('refuses an empty path', () => {
    expect(() => checkPath([])).toThrow(FileError);
  });
});
