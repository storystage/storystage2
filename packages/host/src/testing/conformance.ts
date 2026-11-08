/**
 * The class folders contract's test suite (decision 0065, threat model PS1 and PS4). Every
 * implementation runs it: the memory one here, and the Tauri and browser ones in WP24.4.
 */
import { describe, expect, it } from 'vitest';
import { BACKUPS_KEPT, FileError, type ClassFolders } from '../files.ts';

const bytes = (text: string) => new TextEncoder().encode(text);
const text = (data: Uint8Array) => new TextDecoder().decode(data);

const failsWith = async (code: string, action: () => Promise<unknown>) => {
  await expect(action()).rejects.toBeInstanceOf(FileError);
  await expect(action()).rejects.toMatchObject({ code });
};

export function describeClassFoldersContract(
  name: string,
  make: () => ClassFolders | Promise<ClassFolders>,
) {
  describe(`${name} meets the class folders contract`, () => {
    const withPupil = async (pupilName = 'Ava') => {
      const folders = await make();
      const pupil = await folders.addPupil(pupilName);
      return { folders, pupil, folder: await folders.open(pupil.id) };
    };

    it('keeps the class list, with names trimmed and pictures by name', async () => {
      const folders = await make();
      const ava = await folders.addPupil('  Ava ', 'owl');
      const ben = await folders.addPupil('Ben');
      expect(ava).toMatchObject({ name: 'Ava', picture: 'owl' });
      expect(ben.picture).toBeNull();
      expect(ava.id).not.toBe(ben.id);
      expect((await folders.pupils()).map((pupil) => pupil.name)).toEqual(['Ava', 'Ben']);

      const renamed = await folders.renamePupil(ben.id, 'Benji');
      expect(renamed).toMatchObject({ id: ben.id, name: 'Benji' });
      await folders.removePupil(ava.id);
      expect((await folders.pupils()).map((pupil) => pupil.name)).toEqual(['Benji']);
    });

    it('refuses an empty or very long name', async () => {
      const folders = await make();
      await failsWith('invalid', () => folders.addPupil('   '));
      await failsWith('invalid', () => folders.addPupil('x'.repeat(81)));
    });

    it('says when a pupil or production isn’t there', async () => {
      const { folders, folder } = await withPupil();
      await failsWith('not_found', () => folders.open('nobody'));
      await failsWith('not_found', () => folders.renamePupil('nobody', 'X'));
      await failsWith('not_found', () => folder.read('missing'));
      await failsWith('not_found', () => folder.write('missing', 'Film', bytes('x')));
    });

    it('saves a new production, gives it a key, and reads it back', async () => {
      const { folder } = await withPupil();
      expect(await folder.list()).toEqual([]);
      const saved = await folder.write(null, 'The Owl', bytes('first'));
      expect(saved).toMatchObject({ name: 'The Owl', bytes: 5, backups: 0, hasOriginal: false });
      expect(typeof saved.key).toBe('string');
      expect(Number.isNaN(Date.parse(saved.savedAt))).toBe(false);
      expect(text(await folder.read(saved.key))).toBe('first');
      expect(await folder.list()).toEqual([saved]);
    });

    it('keeps what was saved, even if the caller changes its bytes afterwards', async () => {
      const { folder } = await withPupil();
      const data = bytes('first');
      const saved = await folder.write(null, 'Film', data);
      data[0] = 0;
      const read = await folder.read(saved.key);
      expect(text(read)).toBe('first');
      read[0] = 0;
      expect(text(await folder.read(saved.key))).toBe('first');
    });

    it('keeps one pupil’s work out of another’s folder (threat PS1)', async () => {
      const folders = await make();
      const ava = await folders.open((await folders.addPupil('Ava')).id);
      const saved = await ava.write(null, 'Ava’s film', bytes('mine'));
      const ben = await folders.open((await folders.addPupil('Ben')).id);
      expect(await ben.list()).toEqual([]);
      await failsWith('not_found', () => ben.read(saved.key));
      await failsWith('not_found', () => ben.remove(saved.key));
    });

    it(`keeps the ${BACKUPS_KEPT} most recent earlier versions, newest first`, async () => {
      const { folder } = await withPupil();
      const { key } = await folder.write(null, 'Film', bytes('v1'));
      for (let version = 2; version <= BACKUPS_KEPT + 3; version += 1) {
        await folder.write(key, 'Film', bytes(`v${version}`));
      }
      const last = BACKUPS_KEPT + 3;
      expect(text(await folder.read(key))).toBe(`v${last}`);
      const backups = await folder.backups(key);
      expect(backups.map((backup) => backup.index)).toEqual([...Array(BACKUPS_KEPT).keys()]);
      expect(text(await folder.readBackup(key, 0))).toBe(`v${last - 1}`);
      expect(text(await folder.readBackup(key, BACKUPS_KEPT - 1))).toBe(`v${last - BACKUPS_KEPT}`);
      await failsWith('not_found', () => folder.readBackup(key, BACKUPS_KEPT));
      expect((await folder.list())[0]?.backups).toBe(BACKUPS_KEPT);
    });

    it('keeps no backup for an autosave, so backups are of sessions (S4, #191)', async () => {
      const { folder } = await withPupil();
      const { key } = await folder.write(null, 'Film', bytes('opened'));
      await folder.write(key, 'Film', bytes('autosave 1'), { backup: false });
      await folder.write(key, 'Film', bytes('autosave 2'), { backup: false });
      expect(await folder.backups(key)).toEqual([]);
      expect(text(await folder.read(key))).toBe('autosave 2');

      await folder.write(key, 'Film', bytes('next session'));
      expect((await folder.backups(key)).length).toBe(1);
      expect(text(await folder.readBackup(key, 0))).toBe('autosave 2');
    });

    it('finishes writes in progress before closing', async () => {
      const { folders, folder, pupil } = await withPupil();
      const pending = folder.write(null, 'Film', bytes('last words'));
      await folders.close();
      const { key } = await pending;
      const reopened = await folders.open(pupil.id);
      expect(text(await reopened.read(key))).toBe('last words');
    });

    it('takes a new name with a new version', async () => {
      const { folder } = await withPupil();
      const { key } = await folder.write(null, 'Draft', bytes('a'));
      await folder.write(key, 'The Owl and the Cat', bytes('b'));
      expect((await folder.list())[0]?.name).toBe('The Owl and the Cat');
    });

    it('keeps the first original beside a migrated production, untouched (spec 03 1.2)', async () => {
      const { folder } = await withPupil();
      const { key } = await folder.write(null, 'Film', bytes('migrated'));
      expect(await folder.readOriginal(key)).toBeNull();
      await folder.keepOriginal(key, bytes('original'));
      await folder.keepOriginal(key, bytes('another'));
      expect(text((await folder.readOriginal(key)) ?? new Uint8Array())).toBe('original');
      expect((await folder.list())[0]?.hasOriginal).toBe(true);
    });

    it('moves a deleted production to the bin with its backups, and can bring it back', async () => {
      const { folders, folder, pupil } = await withPupil();
      const { key } = await folder.write(null, 'Film', bytes('v1'));
      await folder.write(key, 'Film', bytes('v2'));
      await folder.keepOriginal(key, bytes('original'));
      await folder.remove(key);

      expect(await folder.list()).toEqual([]);
      await failsWith('not_found', () => folder.read(key));
      const [binned] = await folders.bin();
      expect(binned).toMatchObject({ key, pupil: pupil.id, backups: 1, hasOriginal: true });

      await folders.restore(pupil.id, key);
      expect(text(await folder.read(key))).toBe('v2');
      expect(text(await folder.readBackup(key, 0))).toBe('v1');
      expect(await folders.bin()).toEqual([]);
    });

    it('empties the bin for good', async () => {
      const { folders, folder, pupil } = await withPupil();
      const { key } = await folder.write(null, 'Film', bytes('x'));
      await folder.remove(key);
      await folders.emptyBin();
      expect(await folders.bin()).toEqual([]);
      await failsWith('not_found', () => folders.restore(pupil.id, key));
    });

    it('sends a removed pupil’s work to the bin, not away', async () => {
      const { folders, folder, pupil } = await withPupil();
      await folder.write(null, 'Film', bytes('x'));
      await folders.removePupil(pupil.id);
      expect(await folders.pupils()).toEqual([]);
      expect((await folders.bin()).map((entry) => entry.pupil)).toEqual([pupil.id]);
    });

    it('knows whose folder is open, for autosave', async () => {
      const folders = await make();
      expect(folders.current()).toBeNull();
      const pupil = await folders.addPupil('Ava');
      const opened = await folders.open(pupil.id);
      expect(folders.current()?.pupil.id).toBe(pupil.id);
      expect(opened.pupil.id).toBe(pupil.id);
      await folders.close();
      expect(folders.current()).toBeNull();
    });

    it('reaches a pupil’s folder without making it current, for Collect and Hand back', async () => {
      const folders = await make();
      const ava = await folders.open((await folders.addPupil('Ava')).id);
      const ben = await folders.addPupil('Ben');
      const reached = await folders.folder(ben.id);
      const { key } = await reached.write(null, 'Handed back', bytes('x'));
      expect(folders.current()?.pupil.id).toBe(ava.pupil.id);
      expect((await (await folders.open(ben.id)).list()).map((info) => info.key)).toEqual([key]);
      expect(await ava.list()).toEqual([]);
      await failsWith('not_found', () => folders.folder('nobody'));
    });

    it('won’t write into the folder of a pupil who has been removed', async () => {
      const { folders, folder, pupil } = await withPupil();
      await folders.removePupil(pupil.id);
      await failsWith('not_found', () => folder.write(null, 'Film', bytes('x')));
      expect(await folders.bin()).toEqual([]);
    });

    it('closes a pupil’s folder when the pupil is removed', async () => {
      const { folders, pupil } = await withPupil();
      await folders.removePupil(pupil.id);
      expect(folders.current()).toBeNull();
    });
  });
}
