import { FILE_LIMIT, KEPT_FILE, type FilePicker, type PupilFolder } from '@storystage/host';
import { memoryClassFolders, memoryFilePicker, memoryStore } from '@storystage/host/testing';
import {
  ARCHIVE_LIMITS,
  KEPT_SOUND_NAME,
  ProductionSaver,
  SOUND_TYPES,
  collectClass,
  exampleProduction,
  handBackClass,
  openFromFolder,
  openProduction,
  saveProduction,
  withSound,
  type CopyPicker,
  type SaveFolder,
} from '@storystage/production';
import { describe, expect, it } from 'vitest';

// Checks between the host and production that neither package can make alone (07-ux 9.7,
// S4's review of #242): the studio is where both meet.

/** A film with one imported sound, of bytes that don't compress, as a real sound's don't. */
function filmWithOwl() {
  let seed = 7;
  const owl = Uint8Array.from(
    { length: 50_000 },
    () => (seed = (seed * 1103515245 + 12345) % 2 ** 31) % 256,
  );
  owl.set([0xff, 0xfb, 0x90, 0x44]);
  const film = withSound(exampleProduction(), {
    id: 'sn1',
    file: 'sn1.mp3',
    label: 'Owl',
    length: 2,
    bytes: owl.length,
    trim: { start: 0, end: 2 },
    licence: 'not-sure' as const,
    credit: 'A sound, source not checked',
  });
  const files = {
    audio: new Map(),
    models: new Map(),
    sounds: new Map([['sounds/sn1.mp3', owl]]),
  };
  return { owl, film, files };
}

describe('the host and production agree', () => {
  it('a pupil’s folder is a save folder, and the picker a copy picker', () => {
    // Compile-time: these assignments fail the typecheck if either side changes shape.
    const folder = (f: PupilFolder): SaveFolder => f;
    const picker = (p: FilePicker): CopyPicker => p;
    expect([folder, picker]).toHaveLength(2);
  });

  it('the host’s file limit is the archive reader’s', () => {
    expect(FILE_LIMIT).toBe(ARCHIVE_LIMITS.fileBytes);
  });

  it('the host keeps sounds under the names, and of the types, production gives them', () => {
    expect(KEPT_FILE.source).toBe(KEPT_SOUND_NAME.source);
    expect(KEPT_FILE.source).toContain(`(${Object.keys(SOUND_TYPES).join('|')})`);
  });

  it('a film’s sounds are kept once in the host’s folder, and come back whole (spec 03 1.4.1)', async () => {
    const classes = memoryClassFolders();
    const folder = await classes.folder((await classes.addPupil('Ava')).id);
    const { owl, film, files } = filmWithOwl();
    const saver = new ProductionSaver(folder, { key: null });
    for (const kind of ['auto', 'auto', 'asked'] as const)
      expect(await saver.save(film, files, kind)).toMatchObject({ ok: true });
    const key = saver.key!;
    expect(await folder.kept(key)).toHaveLength(1);
    // The version alone is small; the list shows the whole film's size.
    expect((await folder.read(key)).length).toBeLessThan(owl.length);
    expect((await folder.list())[0]?.bytes).toBeGreaterThan(owl.length);

    for (const backup of [undefined, 0]) {
      const opened = await openFromFolder(folder, key, { backup });
      expect(opened).toMatchObject({ status: 'ok', key });
      if (opened.status === 'ok') expect(opened.files.sounds).toEqual(files.sounds);
    }
    const picker = memoryFilePicker({ handBack: () => picker.collected });
    await collectClass(classes, picker);
    expect(picker.collected[0]?.bytes).toEqual(saveProduction(film, files));
  });

  it('a film whose kept sound has gone opens as damaged, not the folder as unavailable (#712)', async () => {
    // S8's review of #711: something outside StoryStage deletes the sound from the pupil's folder.
    const store = memoryStore();
    const classes = memoryClassFolders(undefined, undefined, store);
    const folder = await classes.folder((await classes.addPupil('Ava')).id);
    const { film, files } = filmWithOwl();
    const saver = new ProductionSaver(folder, { key: null });
    expect(await saver.save(film, files, 'asked')).toMatchObject({ ok: true });
    const key = saver.key!;
    const kept = [...store.files.keys()].filter((name) => KEPT_FILE.test(name.split('/').at(-1)!));
    expect(kept).toHaveLength(1);
    await store.remove(kept[0]!.split('/'));
    expect(await folder.kept(key)).toEqual([]);
    expect(await openFromFolder(folder, key)).toMatchObject({
      status: 'broken',
      message: expect.stringMatching(/damaged/),
      key,
    });
  });

  it('Collect then Hand back returns every file to its pupil, with names that differ only by case', async () => {
    const classes = memoryClassFolders();
    const upper = await classes.addPupil('Sam');
    const lower = await classes.addPupil('sam');
    // As long as the Storyboard lets a title be (LIMITS.title).
    const long = 'An owl finds a key '.repeat(5).slice(0, 80).trim();
    const titles = { [upper.id]: ['Pip', 'pip', long], [lower.id]: ['Pip'] };
    const NO_FILES = { audio: new Map(), models: new Map() };
    for (const [id, list] of Object.entries(titles)) {
      const folder = await classes.folder(id);
      for (const title of list) {
        const p = exampleProduction();
        const saved = await new ProductionSaver(folder, { key: null }).save(
          { ...p, manifest: { ...p.manifest, title } },
          NO_FILES,
          'asked',
        );
        expect(saved.ok ? 'ok' : `${title}: ${saved.problem.code}`).toBe('ok');
      }
    }

    const picker = memoryFilePicker({ handBack: () => picker.collected });
    const collected = await collectClass(classes, picker);
    expect(collected).toEqual({ ok: true, count: 4 });

    const report = await handBackClass(classes, picker);
    expect(report).toMatchObject({ written: 4, skipped: [] });
    for (const [id, list] of Object.entries(titles)) {
      const folder = await classes.folder(id);
      const back = await Promise.all(
        (await folder.list())
          .filter((f) => f.name.endsWith('(handed back)'))
          .map(async (f) => {
            const opened = openProduction(await folder.read(f.key));
            return opened.status === 'ok' ? opened.production.manifest.title : null;
          }),
      );
      expect(back.sort()).toEqual([...list].sort());
    }
  });
});
