import { describe, expect, it } from 'vitest';
import { exampleProduction } from './example.ts';
import { readArchive } from './archive.ts';
import { KEPT_SOUNDS, packVersion, saveProduction } from './file.ts';
import {
  ProductionSaver,
  copyName,
  fitName,
  nameSounds,
  openFromFolder,
  openFromPicker,
  readWholeFilm,
  saveCopy,
  type CopyPicker,
  type SaveFolder,
} from './saving.ts';
import { soundHash, withSound } from './sound.ts';
import { frameId, type Production, type SoundClip } from './types.ts';

const p = exampleProduction();
const NO_FILES = { audio: new Map(), models: new Map() };

const fileError = (code: string) => Object.assign(new Error(`Files: ${code}`), { code });

/**
 * A pupil's folder as the host keeps it (contract #191, and #701 for kept sounds): writes, five
 * backups when asked, the first original, and each kept sound once, checked as the host checks
 * it, listed only while a version uses it and the folder has it.
 */
function fakeFolder(options: { fail?: string; delay?: () => Promise<void> } = {}) {
  interface Version {
    readonly bytes: Uint8Array;
    readonly kept: readonly string[];
  }
  const saved = new Map<
    string,
    {
      name: string;
      versions: Uint8Array[];
      current: Version;
      backups: Version[];
      original: Uint8Array | null;
      sounds: Map<string, Uint8Array>;
    }
  >();
  const writes: { key: string | null; backup: boolean | undefined }[] = [];
  /** Each write's kept sounds added, by name, refused ones included. */
  const added: string[][] = [];
  let keptAsked = 0;
  let next = 1;
  const failing = () => {
    if (options.fail) throw fileError(options.fail);
  };
  const got = (key: string) => {
    const production = saved.get(key);
    if (!production) throw fileError('not_found');
    return production;
  };
  const keptHere = (production: ReturnType<typeof got>) =>
    [...new Set([production.current, ...production.backups].flatMap((v) => v.kept))]
      .filter((name) => production.sounds.has(name))
      .sort();
  const folder: SaveFolder = {
    async read(key) {
      failing();
      return got(key).current.bytes;
    },
    async readBackup(key, index) {
      failing();
      const version = got(key).backups[index];
      if (!version) throw fileError('not_found');
      return version.bytes;
    },
    async kept(key) {
      failing();
      keptAsked++;
      return keptHere(got(key));
    },
    async readKept(key, name) {
      failing();
      const production = got(key);
      const bytes = keptHere(production).includes(name) ? production.sounds.get(name) : undefined;
      if (!bytes) throw fileError('not_found');
      return bytes;
    },
    async write(key, name, bytes, opts) {
      await options.delay?.();
      failing();
      // As the host's checkName: a name over 80 characters is refused.
      if (name.trim().length > 80) throw fileError('invalid');
      const production = key === null ? null : got(key);
      const uses = [...new Set(opts?.kept?.uses ?? [])];
      const add = opts?.kept?.add ?? [];
      added.push(add.map((a) => a.name));
      const have = production === null ? [] : keptHere(production);
      if (!uses.every((n) => /^sound-[0-9a-f]{32}\.(mp3|wav|m4a)$/.test(n)))
        throw fileError('invalid');
      if (!add.every((a) => uses.includes(a.name))) throw fileError('invalid');
      if (!uses.every((n) => have.includes(n) || add.some((a) => a.name === n)))
        throw fileError('not_found');
      for (const a of add)
        if (!have.includes(a.name) && `sound-${await soundHash(a.bytes)}` !== a.name.split('.')[0])
          throw fileError('invalid');
      writes.push({ key, backup: opts?.backup });
      const k = key ?? `production-${next++}`;
      const into: ReturnType<typeof got> = production ?? {
        name,
        versions: [],
        current: { bytes, kept: [] },
        backups: [],
        original: null,
        sounds: new Map(),
      };
      for (const a of add)
        if (!have.includes(a.name)) into.sounds.set(a.name, new Uint8Array(a.bytes));
      if (production !== null && opts?.backup !== false) into.backups.unshift(into.current);
      into.backups = into.backups.slice(0, 5);
      into.current = { bytes, kept: uses };
      into.versions.push(bytes);
      into.name = name;
      // Step 3: a kept sound no version uses goes.
      const used = new Set([into.current, ...into.backups].flatMap((v) => v.kept));
      for (const n of into.sounds.keys()) if (!used.has(n)) into.sounds.delete(n);
      saved.set(k, into);
      return {
        key: k,
        savedAt: `2026-11-08T12:00:0${into.versions.length}Z`,
        kept: keptHere(into),
      };
    },
    async keepOriginal(key, bytes) {
      const production = got(key);
      production.original ??= bytes;
    },
  };
  return { folder, saved, writes, added, keptAsked: () => keptAsked };
}

const titled = (title: string): Production => ({ ...p, manifest: { ...p.manifest, title } });

describe('fitName', () => {
  it('fits a title and its ending into 80 characters, as the host counts them', () => {
    expect(fitName('Pip', ' (handed back)')).toBe('Pip (handed back)');
    expect(fitName('x'.repeat(100))).toBe('x'.repeat(80));
    expect(fitName('x'.repeat(80), ' (2).storystage')).toHaveLength(80);
    expect(fitName('   ', '', 'My film')).toBe('My film');
  });

  it('never cuts through an emoji, and drops the spaces and dots it leaves at the end', () => {
    expect(fitName(`${'a'.repeat(78)}🐧🐧`)).toBe(`${'a'.repeat(78)}🐧`);
    const name = fitName(`${'a'.repeat(79)}🐧🐧`);
    expect(name).toBe('a'.repeat(79));
    expect(fitName(`${'a'.repeat(70)}         xyz`, ' (handed back)')).toBe(
      `${'a'.repeat(66)} (handed back)`,
    );
  });
});

describe('ProductionSaver', () => {
  it('saves a film whose title is longer than the host keeps, under a name that fits', async () => {
    const { folder, saved } = fakeFolder();
    const outcome = await new ProductionSaver(folder, { key: null }).save(
      titled('T'.repeat(120)),
      NO_FILES,
      'auto',
    );
    expect(outcome).toMatchObject({ ok: true });
    expect(saved.get('production-1')!.name).toBe('T'.repeat(80));
  });

  it('saves a new production, giving it a key, under its title', async () => {
    const { folder, saved } = fakeFolder();
    const saver = new ProductionSaver(folder, { key: null });
    const outcome = await saver.save(p, NO_FILES, 'auto');
    expect(outcome).toMatchObject({ ok: true, key: 'production-1' });
    expect(saver.key).toBe('production-1');
    expect(saved.get('production-1')!.name).toBe('The Lost Penguin');
    expect(saved.get('production-1')!.versions[0]).toEqual(saveProduction(p));
  });

  it('keeps a backup on the first save of a session and on saves asked for, not on autosaves', async () => {
    const { folder, writes } = fakeFolder();
    const saver = new ProductionSaver(folder, { key: null });
    await saver.save(p, NO_FILES, 'auto');
    await saver.save(titled('Two'), NO_FILES, 'auto');
    await saver.save(titled('Three'), NO_FILES, 'asked');
    await saver.save(titled('Four'), NO_FILES, 'auto');
    expect(writes.map((w) => w.backup)).toEqual([true, false, true, false]);

    // Opening it again starts a new session: its first save keeps a backup.
    const again = new ProductionSaver(folder, { key: 'production-1' });
    await again.save(titled('Five'), NO_FILES, 'auto');
    expect(writes.at(-1)).toEqual({ key: 'production-1', backup: true });
  });

  it("keeps a migrated production's original before its first save, once", async () => {
    const { folder, saved } = fakeFolder();
    const first = await new ProductionSaver(folder, { key: null }).save(p, NO_FILES, 'auto');
    if (!first.ok) throw new Error('not saved');
    const original = new Uint8Array([9, 9, 9]);
    const saver = new ProductionSaver(folder, { key: first.key, original });
    await saver.save(titled('Migrated'), NO_FILES, 'auto');
    await saver.save(titled('Again'), NO_FILES, 'auto');
    expect(saved.get(first.key)!.original).toEqual(original);
  });

  it('never writes a read-only production', async () => {
    const { folder, writes } = fakeFolder();
    const saver = new ProductionSaver(folder, { key: 'production-1', readOnly: 'Newer.' });
    expect(await saver.save(p, NO_FILES, 'asked')).toMatchObject({
      ok: false,
      problem: { code: 'readOnly', message: expect.stringMatching(/Save a copy/) },
    });
    expect(writes).toEqual([]);
  });

  it("gives the host's errors back in plain words, and a broken production as refused", async () => {
    for (const code of ['full', 'locked', 'too_big', 'unreadable']) {
      const saver = new ProductionSaver(fakeFolder({ fail: code }).folder, { key: null });
      const outcome = await saver.save(p, NO_FILES, 'auto');
      expect(outcome).toMatchObject({ ok: false, problem: { code } });
      if (!outcome.ok) expect(outcome.problem.message).not.toMatch(/Files:|undefined/);
    }
    const broken = { ...p, script: p.script.map((l) => ({ ...l, pinnedFrame: frameId('gone') })) };
    const saver = new ProductionSaver(fakeFolder().folder, { key: null });
    expect(await saver.save(broken, NO_FILES, 'auto')).toMatchObject({
      ok: false,
      problem: { code: 'refused' },
    });
  });

  it('makes autosaves asked for at the same moment one write, of the latest', async () => {
    const { folder, saved } = fakeFolder();
    const saver = new ProductionSaver(folder, { key: null });
    const outcomes = await Promise.all(
      ['One', 'Two', 'Three'].map((t) => saver.save(titled(t), NO_FILES, 'auto')),
    );
    expect(outcomes.every((o) => o.ok)).toBe(true);
    expect(saved.get('production-1')!.versions.length).toBe(1);
    expect(saved.get('production-1')!.name).toBe('Three');
  });

  it('runs saves one at a time; autosaves waiting behind one become the latest', async () => {
    let release!: () => void;
    const gate = new Promise<void>((r) => (release = r));
    let running = 0;
    let most = 0;
    const { folder, saved } = fakeFolder({
      delay: async () => {
        most = Math.max(most, ++running);
        await gate;
        running--;
      },
    });
    const saver = new ProductionSaver(folder, { key: null });
    const first = saver.save(titled('One'), NO_FILES, 'auto');
    await new Promise((r) => setTimeout(r, 0)); // "One" is now writing
    const second = saver.save(titled('Two'), NO_FILES, 'auto');
    const third = saver.save(titled('Three'), NO_FILES, 'auto');
    const asked = saver.save(titled('Asked'), NO_FILES, 'asked');
    release();
    const outcomes = await Promise.all([first, second, third, asked]);
    expect(outcomes.every((o) => o.ok)).toBe(true);
    expect(most).toBe(1);
    // "One", then "Three" (which replaced "Two" while it waited), then the save asked for.
    expect(saved.get('production-1')!.versions.length).toBe(3);
    expect(saved.get('production-1')!.name).toBe('Asked');
  });
});

describe('openFromFolder', () => {
  it('reads a saved production and checks it', async () => {
    const { folder } = fakeFolder();
    const saved = await new ProductionSaver(folder, { key: null }).save(p, NO_FILES, 'auto');
    if (!saved.ok) throw new Error('not saved');
    const opened = await openFromFolder(folder, saved.key);
    expect(opened).toMatchObject({ status: 'ok', key: saved.key });
    if (opened.status === 'ok') expect(opened.production).toEqual(p);
  });

  it("says plainly when the folder can't give it", async () => {
    expect(await openFromFolder(fakeFolder().folder, 'nothing')).toMatchObject({
      status: 'unavailable',
      problem: { code: 'not_found' },
    });
  });
});

describe('sounds kept once in the folder (spec 03, section 1.4.1)', () => {
  /** An MP3's first bytes, then `fill`, so each sound's bytes are its own. */
  const mp3 = (fill: number, size = 64) => {
    const bytes = new Uint8Array(size).fill(fill);
    bytes.set([0xff, 0xfb, 0x90, 0x44]);
    return bytes;
  };
  const clip = (id: string, bytes: Uint8Array): SoundClip => ({
    id,
    file: `${id}.mp3`,
    label: id,
    length: 2,
    bytes: bytes.length,
    trim: { start: 0, end: 2 },
    licence: 'not-sure' as const,
    credit: 'A sound, source not checked',
  });
  /** The example film with these sounds imported. */
  const withSounds = (sounds: Record<string, Uint8Array>) => {
    let production: Production = p;
    const files = new Map<string, Uint8Array>();
    for (const [id, bytes] of Object.entries(sounds)) {
      production = withSound(production, clip(id, bytes));
      files.set(`sounds/${id}.mp3`, bytes);
    }
    return { production, files: { ...NO_FILES, sounds: files } };
  };
  const entriesOf = (bytes: Uint8Array) => {
    const read = readArchive(bytes, { wanted: () => true });
    if (!read.ok) throw new Error(read.problem.message);
    return read;
  };

  it('writes the film without its sounds, and each sound once beside it', async () => {
    const owl = mp3(1);
    const film = withSounds({ sn1: owl, sn2: mp3(2), sn3: owl });
    const { folder, saved, added } = fakeFolder();
    const outcome = await new ProductionSaver(folder, { key: null }).save(
      film.production,
      film.files,
      'auto',
    );
    expect(outcome).toMatchObject({ ok: true, key: 'production-1' });
    const version = saved.get('production-1')!.current;
    const { names, entries } = entriesOf(version.bytes);
    expect(names.filter((n) => n.startsWith('sounds/'))).toEqual([]);
    const kept = JSON.parse(new TextDecoder().decode(entries.get(KEPT_SOUNDS)));
    const owlName = `sound-${await soundHash(owl)}.mp3`;
    expect(kept).toEqual({
      version: 1,
      sounds: { 'sn1.mp3': owlName, 'sn2.mp3': expect.any(String), 'sn3.mp3': owlName },
    });
    // Two clips with the same bytes are one kept sound.
    expect(added[0]).toHaveLength(2);
    expect(version.kept).toEqual([...added[0]!].sort());
  });

  it('opens a version with its sounds put back, through every check, giving their names', async () => {
    const film = withSounds({ sn1: mp3(1), sn2: mp3(2) });
    const { folder } = fakeFolder();
    await new ProductionSaver(folder, { key: null }).save(film.production, film.files, 'auto');
    const opened = await openFromFolder(folder, 'production-1');
    expect(opened).toMatchObject({ status: 'ok', key: 'production-1' });
    if (opened.status !== 'ok') return;
    expect(opened.production).toEqual(film.production);
    expect(opened.files.sounds).toEqual(film.files.sounds);
    expect([...opened.soundNames!.keys()]).toEqual(['sn1.mp3', 'sn2.mp3']);
  });

  it('writes only the sounds the folder lacks, asking for its list once', async () => {
    const film = withSounds({ sn1: mp3(1) });
    const { folder, added, keptAsked } = fakeFolder();
    const first = await new ProductionSaver(folder, { key: null }).save(
      film.production,
      film.files,
      'auto',
    );
    if (!first.ok) throw new Error('not saved');
    const opened = await openFromFolder(folder, first.key);
    if (opened.status !== 'ok') throw new Error('not opened');
    const saver = new ProductionSaver(folder, {
      key: first.key,
      soundNames: opened.soundNames,
    });
    const more = withSounds({ sn1: mp3(1), sn2: mp3(2) });
    for (const kind of ['auto', 'auto', 'asked'] as const)
      expect(await saver.save(more.production, more.files, kind)).toMatchObject({ ok: true });
    expect(added.slice(1).map((a) => a.length)).toEqual([1, 0, 0]);
    expect(keptAsked()).toBe(1);
  });

  it('adds a sound again once the folder has deleted it, as after an Undo', async () => {
    const film = withSounds({ sn1: mp3(1) });
    const { folder, added } = fakeFolder();
    const saver = new ProductionSaver(folder, { key: null });
    await saver.save(film.production, film.files, 'auto');
    // An autosave without the sound drops the version it replaces, so the folder deletes it.
    await saver.save(p, NO_FILES, 'auto');
    expect(await folder.kept('production-1')).toEqual([]);
    expect(await saver.save(film.production, film.files, 'auto')).toMatchObject({ ok: true });
    expect(added.map((a) => a.length)).toEqual([1, 0, 1]);
  });

  it("asks again and retries once when the folder lacks a sound the saver's list has", async () => {
    const film = withSounds({ sn1: mp3(1) });
    const { folder, saved, writes } = fakeFolder();
    const saver = new ProductionSaver(folder, { key: null });
    await saver.save(film.production, film.files, 'auto');
    // Another window's tidy, or something outside StoryStage, deletes it.
    saved.get('production-1')!.sounds.clear();
    expect(await saver.save(film.production, film.files, 'auto')).toMatchObject({ ok: true });
    expect(writes).toHaveLength(2);
    expect((await openFromFolder(folder, 'production-1')).status).toBe('ok');
  });

  it('opens a backup the same way, from its own list', async () => {
    const one = withSounds({ sn1: mp3(1) });
    const two = withSounds({ sn2: mp3(2) });
    const { folder } = fakeFolder();
    const saver = new ProductionSaver(folder, { key: null });
    await saver.save(one.production, one.files, 'asked');
    await saver.save(two.production, two.files, 'asked');
    const backup = await openFromFolder(folder, 'production-1', { backup: 0 });
    expect(backup).toMatchObject({ status: 'ok', key: 'production-1' });
    if (backup.status === 'ok') expect(backup.files.sounds).toEqual(one.files.sounds);
    expect(await openFromFolder(folder, 'production-1', { backup: 1 })).toMatchObject({
      status: 'unavailable',
      problem: { code: 'not_found' },
    });
  });

  it('opens a version whose kept sound is missing or changed as damaged', async () => {
    const film = withSounds({ sn1: mp3(1) });
    const { folder, saved } = fakeFolder();
    await new ProductionSaver(folder, { key: null }).save(film.production, film.files, 'auto');
    const sounds = saved.get('production-1')!.sounds;
    const [name] = [...sounds.keys()];
    sounds.set(name!, mp3(9));
    const changed = await openFromFolder(folder, 'production-1');
    expect(changed).toMatchObject({ status: 'broken', message: expect.stringMatching(/damaged/) });
    sounds.clear();
    expect(await openFromFolder(folder, 'production-1')).toMatchObject({ status: 'broken' });
  });

  it('opens a whole film saved in the folder before kept sounds, and packs it at its next save', async () => {
    const film = withSounds({ sn1: mp3(1) });
    const { folder, saved, added } = fakeFolder();
    const whole = saveProduction(film.production, film.files);
    const { key } = await folder.write(null, 'Old', whole);
    const opened = await openFromFolder(folder, key);
    expect(opened).toMatchObject({ status: 'ok' });
    if (opened.status !== 'ok') return;
    const saver = new ProductionSaver(folder, { key, soundNames: opened.soundNames });
    await saver.save(opened.production, opened.files, 'auto');
    expect(added.at(-1)).toHaveLength(1);
    expect(entriesOf(saved.get(key)!.current.bytes).names).toContain(KEPT_SOUNDS);
  });

  it('gives the whole film back: the same bytes saveProduction gives', async () => {
    const film = withSounds({ sn1: mp3(1), sn2: mp3(2) });
    const { folder } = fakeFolder();
    await new ProductionSaver(folder, { key: null }).save(film.production, film.files, 'auto');
    expect(await readWholeFilm(folder, 'production-1')).toEqual(
      saveProduction(film.production, film.files),
    );
    // A version with no sounds is the whole film already.
    await new ProductionSaver(folder, { key: null }).save(p, NO_FILES, 'auto');
    expect(await readWholeFilm(folder, 'production-2')).toEqual(saveProduction(p));
  });

  it('counts the whole film against the file limit', () => {
    const film = withSounds({ sn1: mp3(1, 5000), sn2: mp3(2, 7000) });
    const names = new Map([
      ['sn1.mp3', `sound-${'a'.repeat(32)}.mp3`],
      ['sn2.mp3', `sound-${'b'.repeat(32)}.mp3`],
    ]);
    const packed = packVersion(film.production, film.files, names);
    expect(packed.wholeBytes).toBeGreaterThanOrEqual(
      saveProduction(film.production, film.files).length,
    );
    expect(packed.bytes.length).toBeLessThan(5000);
  });

  it('keeps the original of a migrated film whole, its sounds put back', async () => {
    const film = withSounds({ sn1: mp3(1) });
    const older = {
      ...film.production,
      manifest: { ...film.production.manifest, formatVersion: '1.9.0' },
    };
    const names = new Map<string, string>();
    await nameSounds(older, film.files, names);
    const packed = packVersion(older, film.files, names);
    const { folder } = fakeFolder();
    const { key } = await folder.write(null, 'Older', packed.bytes, {
      kept: {
        uses: packed.uses,
        add: [...packed.sounds].map(([name, bytes]) => ({ name, bytes })),
      },
    });
    const opened = await openFromFolder(folder, key);
    expect(opened).toMatchObject({ status: 'migrated' });
    if (opened.status === 'migrated')
      expect(opened.original).toEqual(saveProduction(older, film.files));
  });
});

describe('Save a copy and Open', () => {
  const picker = (bytes?: Uint8Array) => {
    const copies: { name: string; bytes: Uint8Array }[] = [];
    const picked: CopyPicker = {
      async saveCopy(name, b) {
        copies.push({ name, bytes: b });
      },
      async open() {
        if (!bytes) throw Object.assign(new Error('Files: cancelled'), { code: 'cancelled' });
        return { name: 'film.storystage', bytes };
      },
    };
    return { picked, copies };
  };

  it('saves a copy under a safe name, and opens a picked file through the same checks', async () => {
    const { picked, copies } = picker();
    expect(await saveCopy(picked, titled('Pip: the "lost" penguin?'), NO_FILES)).toEqual({
      ok: true,
    });
    expect(copies[0]!.name).toBe('Pip the lost penguin.storystage');
    const opened = await openFromPicker(picker(copies[0]!.bytes).picked);
    expect(opened.status).toBe('ok');
  });

  it('refuses a picked file that fails the checks, and says so when the picker is closed', async () => {
    expect(
      await openFromPicker(picker(new TextEncoder().encode('not a film')).picked),
    ).toMatchObject({
      status: 'broken',
    });
    expect(await openFromPicker(picker().picked)).toMatchObject({
      status: 'unavailable',
      problem: { code: 'cancelled' },
    });
  });

  it('names a copy of an untitled film', () => {
    expect(copyName(titled('   '))).toBe('My film.storystage');
    expect(copyName(titled('a/b\\c.'))).toBe('a b c.storystage');
  });
});
