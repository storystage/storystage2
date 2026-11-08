import { describe, expect, it } from 'vitest';
import {
  collectClass,
  handBackClass,
  type CollectClass,
  type CollectFolder,
  type CollectPicker,
  type CollectedFile,
} from './collect.ts';
import { exampleProduction } from './example.ts';
import { saveProduction } from './file.ts';
import { plainName } from './saving.ts';
import type { Production } from './types.ts';

const NO_FILES = { audio: new Map(), models: new Map() };
const titled = (title: string): Production => {
  const p = exampleProduction();
  return { ...p, manifest: { ...p.manifest, title } };
};
const film = (title: string) => saveProduction(titled(title), NO_FILES);

/** A class as the host keeps it, with `folder(id)` that never changes the current pupil. */
function fakeClass(pupils: { id: string; name: string; films: string[] }[]) {
  const folders = new Map<string, Map<string, { name: string; bytes: Uint8Array }>>();
  let next = 1;
  for (const p of pupils)
    folders.set(p.id, new Map(p.films.map((t) => [`k${next++}`, { name: t, bytes: film(t) }])));
  const opened: string[] = [];
  const classes: CollectClass = {
    async pupils() {
      return pupils.map(({ id, name }) => ({ id, name }));
    },
    async folder(id) {
      opened.push(id);
      const store = folders.get(id);
      if (!store) throw Object.assign(new Error('Files: not_found'), { code: 'not_found' });
      const folder: CollectFolder = {
        async list() {
          return [...store].map(([key, { name }]) => ({ key, name }));
        },
        async read(key) {
          return store.get(key)!.bytes;
        },
        async write(key, name, bytes) {
          const k = key ?? `k${next++}`;
          store.set(k, { name, bytes });
          return { key: k, savedAt: '2026-11-08T12:00:00Z' };
        },
        async keepOriginal() {},
      };
      return folder;
    },
  };
  return { classes, folders, opened };
}

function fakePicker(handedBack: CollectedFile[] = []) {
  const collected: CollectedFile[] = [];
  const picker: CollectPicker = {
    async collect(files) {
      collected.push(...files);
      return files.length;
    },
    async handBack() {
      return handedBack;
    },
  };
  return { picker, collected };
}

describe('collectClass', () => {
  it("copies every pupil's productions as saved, one folder per pupil", async () => {
    const { classes } = fakeClass([
      { id: 'a', name: 'Amara', films: ['The Ice', 'Lost'] },
      { id: 'b', name: 'Kai', films: ['Space'] },
    ]);
    const { picker, collected } = fakePicker();
    expect(await collectClass(classes, picker)).toEqual({ ok: true, count: 3 });
    expect(collected.map((f) => `${f.folder}/${f.file}`)).toEqual([
      'Amara/The Ice.storystage',
      'Amara/Lost.storystage',
      'Kai/Space.storystage',
    ]);
    expect(collected[2]!.bytes).toEqual(film('Space'));
  });

  it('gives pupils and productions with the same name their own names, ignoring case', async () => {
    const { classes } = fakeClass([
      { id: 'a', name: 'Sam', films: ['Pip', 'pip', 'Pip'] },
      { id: 'b', name: 'sam', films: [] },
      { id: 'c', name: 'Sam', films: ['Pip'] },
    ]);
    const { picker, collected } = fakePicker();
    await collectClass(classes, picker);
    expect(collected.map((f) => `${f.folder}/${f.file}`)).toEqual([
      'Sam/Pip.storystage',
      'Sam/pip (2).storystage',
      'Sam/Pip (3).storystage',
      'Sam (3)/Pip.storystage',
    ]);
  });

  it('makes names safe for every system', async () => {
    const { classes } = fakeClass([{ id: 'a', name: 'CON', films: ['a/b: c?'] }]);
    const { picker, collected } = fakePicker();
    await collectClass(classes, picker);
    expect(`${collected[0]!.folder}/${collected[0]!.file}`).toBe('CON_/a b c.storystage');
  });

  // The host's Collect refuses a name `safeFileName` would cut at 80 characters (#211).
  it('keeps every name, with its "(2)" and its extension, within 80 characters', async () => {
    const long = 'A very long title about a penguin who drifts away on the ice and finds a fox';
    const { classes } = fakeClass([
      { id: 'a', name: 'x'.repeat(100), films: [long, long, `${'y'.repeat(79)} z`] },
      { id: 'b', name: 'x'.repeat(100), films: [] },
    ]);
    const { picker, collected } = fakePicker();
    await collectClass(classes, picker);
    const names = collected.flatMap((f) => [f.folder, f.file]);
    for (const name of names) {
      expect(name.length).toBeLessThanOrEqual(80);
      expect(plainName(name, 'x')).toBe(name); // what safeFileName would leave as it is
    }
    expect(collected[1]!.file).toMatch(/ \(2\)\.storystage$/);
    const handedBack = await handBackClass(
      classes,
      fakePicker([{ folder: collected[0]!.folder, file: collected[0]!.file, bytes: film('Back') }])
        .picker,
    );
    expect(handedBack).toMatchObject({ written: 1 });
  });

  it("gives the host's error code back", async () => {
    const { classes } = fakeClass([{ id: 'a', name: 'Amara', films: ['x'] }]);
    const picker: CollectPicker = {
      collect: () => Promise.reject(Object.assign(new Error('Files: full'), { code: 'full' })),
      handBack: async () => [],
    };
    expect(await collectClass(classes, picker)).toEqual({ ok: false, code: 'full' });
  });
});

describe('handBackClass', () => {
  it("writes each checked file into its pupil's folder as a new production", async () => {
    const { classes, folders } = fakeClass([
      { id: 'a', name: 'Sam', films: ['Pip'] },
      { id: 'b', name: 'Sam', films: [] },
    ]);
    const { picker } = fakePicker([
      { folder: 'Sam', file: 'Pip.storystage', bytes: film('Pip') },
      { folder: 'sam (2)', file: 'Marked.storystage', bytes: film('Marked') },
    ]);
    expect(await handBackClass(classes, picker)).toEqual({ written: 2, skipped: [] });
    // The pupil's own "Pip" is untouched; the marked one is beside it.
    expect([...folders.get('a')!.values()].map((v) => v.name)).toEqual([
      'Pip',
      'Pip (handed back)',
    ]);
    expect([...folders.get('b')!.values()].map((v) => v.name)).toEqual(['Marked (handed back)']);
  });

  it('skips files that fail the checks, or have no pupil, saying why', async () => {
    const { classes } = fakeClass([{ id: 'a', name: 'Amara', films: [] }]);
    const { picker } = fakePicker([
      { folder: 'Amara', file: 'Bad.storystage', bytes: new TextEncoder().encode('not a film') },
      { folder: 'Zed', file: 'Film.storystage', bytes: film('Film') },
    ]);
    const report = await handBackClass(classes, picker);
    expect(report).toMatchObject({ written: 0 });
    if ('skipped' in report)
      expect(report.skipped).toEqual([
        {
          folder: 'Amara',
          file: 'Bad.storystage',
          reason: "This isn't a file StoryStage can open.",
        },
        {
          folder: 'Zed',
          file: 'Film.storystage',
          reason: "There's no pupil called Zed in this class.",
        },
      ]);
  });

  it("returns the picker's code when the teacher closes it", async () => {
    const { classes } = fakeClass([]);
    const picker: CollectPicker = {
      collect: async () => 0,
      handBack: () =>
        Promise.reject(Object.assign(new Error('Files: cancelled'), { code: 'cancelled' })),
    };
    expect(await handBackClass(classes, picker)).toEqual({ ok: false, code: 'cancelled' });
  });
});

describe('plainName', () => {
  it('follows the host’s safeFileName rules', () => {
    expect(plainName('  Pip the penguin.  ', 'x')).toBe('Pip the penguin');
    expect(plainName('..', 'x')).toBe('x');
    expect(plainName('a .. b', 'x')).toBe('a b');
    // A device name before the first dot is still the device on Windows: the "_" goes after it.
    expect(plainName('aux.txt', 'x')).toBe('aux_.txt');
    expect(plainName('Con. notes', 'x')).toBe('Con_. notes');
    expect(plainName('nul.storystage', 'x')).toBe('nul_.storystage');
    expect(plainName('CON', 'x')).toBe('CON_');
    expect(plainName('console', 'x')).toBe('console');
    expect(plainName('x'.repeat(100), 'x')).toHaveLength(80);
    expect(plainName('tab\there', 'x')).toBe('tab here');
  });
});
