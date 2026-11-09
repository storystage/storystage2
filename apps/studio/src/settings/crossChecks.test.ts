import { FILE_LIMIT, type FilePicker, type PupilFolder } from '@storystage/host';
import { memoryClassFolders, memoryFilePicker } from '@storystage/host/testing';
import {
  ARCHIVE_LIMITS,
  ProductionSaver,
  collectClass,
  exampleProduction,
  handBackClass,
  openProduction,
  type CopyPicker,
  type SaveFolder,
} from '@storystage/production';
import { describe, expect, it } from 'vitest';

// Three checks between the host and production that neither package can make alone (07-ux 9.7,
// S4's review of #242): the studio is where both meet.

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

  // Fails today: Hand back names its copy '<title> (handed back)', which takes a title at the
  // Storyboard's limit past the host's 80-character name, so that film is skipped. S4 is fixing
  // handBackClass; when it lands this test passes, and `it.fails` goes back to `it`.
  it.fails(
    'Collect then Hand back returns every file to its pupil, with names that differ only by case',
    async () => {
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
    },
  );
});
