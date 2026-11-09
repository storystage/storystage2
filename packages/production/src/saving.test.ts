import { describe, expect, it } from 'vitest';
import { exampleProduction } from './example.ts';
import { saveProduction } from './file.ts';
import {
  ProductionSaver,
  copyName,
  fitName,
  openFromFolder,
  openFromPicker,
  saveCopy,
  type CopyPicker,
  type SaveFolder,
} from './saving.ts';
import { frameId, type Production } from './types.ts';

const p = exampleProduction();
const NO_FILES = { audio: new Map(), models: new Map() };

/** A pupil's folder as the host keeps it (contract #191): writes, backups when asked, the first original. */
function fakeFolder(options: { fail?: string; delay?: () => Promise<void> } = {}) {
  const saved = new Map<
    string,
    { name: string; versions: Uint8Array[]; backups: Uint8Array[]; original: Uint8Array | null }
  >();
  const writes: { key: string | null; backup: boolean | undefined }[] = [];
  let next = 1;
  const failing = () => {
    if (options.fail)
      throw Object.assign(new Error(`Files: ${options.fail}`), { code: options.fail });
  };
  const folder: SaveFolder = {
    async read(key) {
      failing();
      const got = saved.get(key);
      if (!got) throw Object.assign(new Error('Files: not_found'), { code: 'not_found' });
      return got.versions.at(-1)!;
    },
    async write(key, name, bytes, opts) {
      await options.delay?.();
      failing();
      // As the host's checkName: a name over 80 characters is refused.
      if (name.trim().length > 80)
        throw Object.assign(new Error('Files: invalid'), { code: 'invalid' });
      writes.push({ key, backup: opts?.backup });
      const k = key ?? `production-${next++}`;
      const got = saved.get(k) ?? { name, versions: [], backups: [], original: null };
      if (got.versions.length && opts?.backup !== false) got.backups.unshift(got.versions.at(-1)!);
      got.versions.push(bytes);
      got.name = name;
      saved.set(k, got);
      return { key: k, savedAt: `2026-11-08T12:00:0${got.versions.length}Z` };
    },
    async keepOriginal(key, bytes) {
      const got = saved.get(key)!;
      got.original ??= bytes;
    },
  };
  return { folder, saved, writes };
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
