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

/** A sound to keep, named by its bytes' SHA-256 (spec 03 1.4.1). */
const sound = async (content: string) => {
  const data = bytes(content);
  const digest = new Uint8Array(await globalThis.crypto.subtle.digest('SHA-256', data));
  const hex = [...digest.subarray(0, 16)].map((b) => b.toString(16).padStart(2, '0')).join('');
  return { name: `sound-${hex}.mp3`, bytes: data };
};

describe('sounds kept once, on disk (spec 03 1.4.1, spec 05 sections 6.2 and 6.3)', () => {
  it('writes the version file first, then each sound, then meta.json', async () => {
    const store = memoryStore();
    const writes: string[] = [];
    const counting: FileStore = {
      ...store,
      write: (path, data) => (writes.push(path[path.length - 1] ?? ''), store.write(path, data)),
    };
    const folders = storedClassFolders(counting);
    const folder = await folders.open((await folders.addPupil('Ava')).id);
    const owl = await sound('hoot');
    const cat = await sound('miaow');
    writes.length = 0;
    await folder.write(null, 'Film', bytes('v1'), {
      kept: { uses: [owl.name, cat.name], add: [owl, cat] },
    });
    expect(writes).toEqual([expect.stringMatching(/^v-/), owl.name, cat.name, 'meta.json']);
  });

  it('a first save that crashes among its sounds is swept away with them, a minute on', async () => {
    let time = Date.parse('2026-11-26T10:00:00Z');
    const store = failingStore();
    const folders = storedClassFolders(store, { clock: () => new Date(time) });
    const pupil = await folders.addPupil('Ava');
    const folder = await folders.open(pupil.id);
    const owl = await sound('hoot');
    const cat = await sound('miaow');
    // class.json, the version file and the first sound: the second sound fails.
    store.failAt = 4;
    await expect(
      folder.write(null, 'Film', bytes('v1'), {
        kept: { uses: [owl.name, cat.name], add: [owl, cat] },
      }),
    ).rejects.toMatchObject({ code: 'full' });
    store.failAt = Infinity;
    const left = () => [...store.files.keys()].filter((name) => name.startsWith('pupils/'));
    expect(left()).toHaveLength(2);
    time += 10_000;
    await folders.open(pupil.id);
    expect(left()).toHaveLength(2);
    time += 61_000;
    await folders.open(pupil.id);
    expect(left()).toEqual([]);
  });

  it('a folder of sounds alone, which StoryStage never leaves, isn’t swept', async () => {
    const store = memoryStore();
    const folders = storedClassFolders(store, { clock: () => new Date(Date.now() + 3_600_000) });
    const pupil = await folders.addPupil('Ava');
    const owl = await sound('hoot');
    await store.write(['pupils', pupil.id, 'production-strayed', owl.name], owl.bytes);
    await folders.open(pupil.id);
    expect(await store.read(['pupils', pupil.id, 'production-strayed', owl.name])).not.toBeNull();
  });

  it('lists each version’s sounds and their sizes in meta.json, at layout 2', async () => {
    const store = memoryStore();
    const folders = storedClassFolders(store);
    const pupil = await folders.addPupil('Ava');
    const folder = await folders.open(pupil.id);
    const owl = await sound('hoot');
    const { key } = await folder.write(null, 'Film', bytes('v1'), {
      kept: { uses: [owl.name], add: [owl] },
    });
    await folder.write(key, 'Film', bytes('v2'));
    const meta = JSON.parse(
      text((await store.read(['pupils', pupil.id, key, 'meta.json'])) ?? bytes('')),
    );
    expect(meta.layout).toBe(2);
    expect(meta.current.kept).toEqual([]);
    expect(meta.backups[0].kept).toEqual([{ file: owl.name, bytes: 4 }]);
    const names = [...store.files.keys()].filter((name) => name.includes(key));
    expect(names).toHaveLength(4);
    expect(names.every((name) => name.split('/').every(isSafePart))).toBe(true);
  });

  it('reads a folder from before layout 2, whose versions keep no sounds', async () => {
    const store = memoryStore();
    const folders = storedClassFolders(store);
    const pupil = await folders.addPupil('Ava');
    const folder = await folders.open(pupil.id);
    const { key } = await folder.write(null, 'Film', bytes('old'));
    const path = ['pupils', pupil.id, key, 'meta.json'];
    const meta = JSON.parse(text((await store.read(path)) ?? bytes('')));
    delete meta.layout;
    meta.current = { file: meta.current.file, savedAt: meta.current.savedAt, bytes: 3 };
    await store.write(path, bytes(JSON.stringify(meta)));
    expect(await folder.kept(key)).toEqual([]);
    expect((await folder.list())[0]?.bytes).toBe(3);
    await folder.write(key, 'Film', bytes('new'));
    expect(text(await folder.readBackup(key, 0))).toBe('old');
  });

  it('lists a production in a layout it doesn’t know, but never reads or writes it', async () => {
    const store = memoryStore();
    const folders = storedClassFolders(store);
    const pupil = await folders.addPupil('Ava');
    const folder = await folders.open(pupil.id);
    const owl = await sound('hoot');
    const { key } = await folder.write(null, 'Film', bytes('v1'), {
      kept: { uses: [owl.name], add: [owl] },
    });
    const path = ['pupils', pupil.id, key, 'meta.json'];
    const meta = JSON.parse(text((await store.read(path)) ?? bytes('')));
    await store.write(path, bytes(JSON.stringify({ ...meta, layout: 3, future: true })));
    expect((await folder.list()).map((info) => info.key)).toEqual([key]);
    for (const action of [
      () => folder.read(key),
      () => folder.readBackup(key, 0),
      () => folder.kept(key),
      () => folder.readKept(key, owl.name),
      () => folder.readOriginal(key),
      () => folder.keepOriginal(key, bytes('x')),
      () => folder.write(key, 'Film', bytes('v2')),
    ]) {
      await expect(action()).rejects.toMatchObject({ code: 'unreadable' });
    }
    // Nothing was tidied away, and the bin and back keep what this build doesn't know.
    expect(await store.read(['pupils', pupil.id, key, owl.name])).not.toBeNull();
    await folder.remove(key);
    await folders.restore(pupil.id, key);
    const restored = JSON.parse(text((await store.read(path)) ?? bytes('')));
    expect(restored).toMatchObject({ layout: 3, future: true });
    expect(restored.binnedAt).toBeUndefined();
  });

  it('refuses a sound larger than the limit, writing nothing', async () => {
    const store = memoryStore();
    const folders = storedClassFolders(store, { limit: 4 });
    const folder = await folders.open((await folders.addPupil('Ava')).id);
    const big = await sound('miaow');
    await expect(
      folder.write(null, 'Film', bytes('v1'), { kept: { uses: [big.name], add: [big] } }),
    ).rejects.toMatchObject({ code: 'too_big' });
    expect([...store.files.keys()].filter((name) => name.startsWith('pupils/'))).toEqual([]);
  });
});

describe('two windows saving the same production (spec 05 section 6.3, step 3)', () => {
  it('a save’s tidying keeps what another window’s save, made meanwhile, lists', async () => {
    const store = memoryStore();
    const first = storedClassFolders(store);
    const pupil = await first.addPupil('Ava');
    const mine = await first.open(pupil.id);
    const owl = await sound('hoot');
    const { key } = await mine.write(null, 'Film', bytes('v1'));

    // The other window saves between this window's steps 2 and 3.
    const other = await storedClassFolders(store).open(pupil.id);
    let raced = false;
    const racing: FileStore = {
      ...store,
      async write(path, data) {
        await store.write(path, data);
        if (!raced && path[path.length - 1] === 'meta.json' && path.includes(key)) {
          raced = true;
          await other.write(key, 'Film', bytes('theirs'), {
            kept: { uses: [owl.name], add: [owl] },
          });
        }
      },
    };
    const racer = await storedClassFolders(racing).open(pupil.id);
    await racer.write(key, 'Film', bytes('mine'), { backup: false });
    expect(raced).toBe(true);
    // The other window's save is the last, and nothing it lists was tidied away.
    expect(text(await mine.read(key))).toBe('theirs');
    expect(text(await mine.readKept(key, owl.name))).toBe('hoot');
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

  it('adds a pasted class list in one save of the list, or not at all', async () => {
    const store = memoryStore();
    const writes: string[] = [];
    const counting: FileStore = {
      ...store,
      write: (path, data) => (writes.push(path.join('/')), store.write(path, data)),
    };
    const folders = storedClassFolders(counting);
    await folders.addPupil('Ava');
    writes.length = 0;
    const added = await folders.addPupils(['Ben', 'Cai', 'Dee']);
    expect(added.map((p) => p.name)).toEqual(['Ben', 'Cai', 'Dee']);
    expect(writes).toEqual(['class.json']);
    expect((await folders.pupils()).map((p) => p.name)).toEqual(['Ava', 'Ben', 'Cai', 'Dee']);
    // One name refused: none of them added.
    await expect(folders.addPupils(['Eve', ''])).rejects.toBeInstanceOf(FileError);
    expect((await folders.pupils()).map((p) => p.name)).toEqual(['Ava', 'Ben', 'Cai', 'Dee']);
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
