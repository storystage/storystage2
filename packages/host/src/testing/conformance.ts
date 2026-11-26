/**
 * The class folders contract's test suite (decision 0065, threat model PS1 and PS4). Every
 * implementation runs it: the memory one here, and the Tauri and browser ones in WP24.4.
 */
import { describe, expect, it } from 'vitest';
import {
  BACKUPS_KEPT,
  DEVICE_PUPIL,
  FileError,
  type ClassFolders,
  type KeptFile,
  type WriteOptions,
} from '../files.ts';

const bytes = (text: string) => new TextEncoder().encode(text);
const text = (data: Uint8Array) => new TextDecoder().decode(data);

/** A sound to keep, named as spec 03 1.4.1 names it: by its bytes' SHA-256. */
const sound = async (content: string, type = 'mp3'): Promise<KeptFile> => {
  const data = bytes(content);
  const digest = new Uint8Array(await globalThis.crypto.subtle.digest('SHA-256', data));
  const hex = [...digest.subarray(0, 16)].map((b) => b.toString(16).padStart(2, '0')).join('');
  return { name: `sound-${hex}.${type}`, bytes: data };
};

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
      const { kept, ...saved } = await folder.write(null, 'The Owl', bytes('first'));
      expect(saved).toMatchObject({ name: 'The Owl', bytes: 5, backups: 0, hasOriginal: false });
      expect(kept).toEqual([]);
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

    it('can undo removing a pupil, from the bin, with the same id', async () => {
      const { folders, folder, pupil } = await withPupil();
      const { key } = await folder.write(null, 'Film', bytes('x'));
      await folders.addPupil('Ben');
      await folders.removePupil(pupil.id);
      await failsWith('not_found', () => folders.restore(pupil.id, key));
      expect((await folders.binnedPupils()).map((entry) => entry.pupil)).toEqual([pupil]);

      expect(await folders.restorePupil(pupil.id)).toEqual(pupil);
      expect((await folders.pupils()).map((each) => each.id)).toContain(pupil.id);
      expect(await folders.binnedPupils()).toEqual([]);
      await folders.restore(pupil.id, key);
      expect(text(await (await folders.open(pupil.id)).read(key))).toBe('x');
      await failsWith('not_found', () => folders.restorePupil(pupil.id));
    });

    it('forgets removed pupils when the bin is emptied', async () => {
      const { folders, pupil } = await withPupil();
      await folders.removePupil(pupil.id);
      await folders.emptyBin();
      expect(await folders.binnedPupils()).toEqual([]);
      await failsWith('not_found', () => folders.restorePupil(pupil.id));
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

    it('keeps a folder for a device with no class list, outside the class list', async () => {
      const folders = await make();
      const device = await folders.openDevice();
      expect(device.pupil).toEqual(DEVICE_PUPIL);
      expect(folders.current()?.pupil.id).toBe('device');
      const { key } = await device.write(null, 'At home', bytes('x'));
      expect(await folders.pupils()).toEqual([]);
      await failsWith('not_found', () => folders.folder('device'));
      await failsWith('not_found', () => folders.open('device'));
      await failsWith('not_found', () => folders.removePupil('device'));

      const again = await folders.openDevice();
      expect(text(await again.read(key))).toBe('x');
      await again.remove(key);
      expect((await folders.bin()).map((entry) => entry.pupil)).toEqual(['device']);
      await folders.restore('device', key);
      expect((await again.list()).map((info) => info.key)).toEqual([key]);
    });

    it('keeps the device’s folder apart from every pupil’s', async () => {
      const folders = await make();
      await (await folders.openDevice()).write(null, 'At home', bytes('x'));
      const ava = await folders.addPupil('Ava');
      expect(await (await folders.open(ava.id)).list()).toEqual([]);
    });

    it('moves the device’s films into a pupil’s folder once there’s a class list', async () => {
      const folders = await make();
      const device = await folders.openDevice();
      const { key } = await device.write(null, 'At home', bytes('one'));
      await device.write(key, 'At home', bytes('two'));
      await device.write(null, 'Another', bytes('x'));
      await folders.close();
      const ava = await folders.addPupil('Ava');
      expect((await folders.deviceFilms()).map((info) => info.name).sort()).toEqual([
        'Another',
        'At home',
      ]);
      await failsWith('not_found', () => folders.moveDeviceFilms('nobody'));
      await failsWith('not_found', () => folders.moveDeviceFilms('device'));
      expect(await folders.moveDeviceFilms(ava.id)).toBe(2);
      expect(await folders.deviceFilms()).toEqual([]);
      const moved = await folders.open(ava.id);
      expect(text(await moved.read(key))).toBe('two');
      expect((await moved.backups(key)).length).toBe(1);
      expect(await folders.moveDeviceFilms(ava.id)).toBe(0);
    });

    it('won’t open the device’s folder once there’s a class list', async () => {
      const folders = await make();
      await folders.addPupil('Ava');
      await failsWith('invalid', () => folders.openDevice());
      expect(folders.current()).toBeNull();
    });

    it('closes a pupil’s folder when the pupil is removed', async () => {
      const { folders, pupil } = await withPupil();
      await folders.removePupil(pupil.id);
      expect(folders.current()).toBeNull();
    });
  });

  describe(`${name} keeps each sound once (spec 03 1.4.1)`, () => {
    const withFolder = async () => {
      const folders = await make();
      const pupil = await folders.addPupil('Ava');
      return { folders, pupil, folder: await folders.open(pupil.id) };
    };

    it('keeps a sound once, with every version pointing at it', async () => {
      const { folder } = await withFolder();
      const owl = await sound('hoot');
      const saved = await folder.write(null, 'Film', bytes('v1'), {
        kept: { uses: [owl.name], add: [owl] },
      });
      expect(saved.kept).toEqual([owl.name]);
      // The whole film: the version and its sound.
      expect(saved.bytes).toBe(2 + 4);
      expect(text(await folder.readKept(saved.key, owl.name))).toBe('hoot');

      // A later save only names it.
      const next = await folder.write(saved.key, 'Film', bytes('v22'), {
        kept: { uses: [owl.name] },
      });
      expect(next.kept).toEqual([owl.name]);
      expect(await folder.kept(saved.key)).toEqual([owl.name]);
      expect((await folder.list())[0]?.bytes).toBe(3 + 4);
      expect((await folder.backups(saved.key))[0]?.bytes).toBe(2 + 4);
      expect(text(await folder.read(saved.key))).toBe('v22');
    });

    it('skips an add it already keeps, and keeps what was added, whatever the caller does', async () => {
      const { folder } = await withFolder();
      const owl = await sound('hoot');
      const { key } = await folder.write(null, 'Film', bytes('v1'), {
        kept: { uses: [owl.name], add: [owl] },
      });
      owl.bytes[0] = 0;
      // Its bytes no longer match its name, but the folder has it already, so it isn't read.
      await folder.write(key, 'Film', bytes('v2'), { kept: { uses: [owl.name], add: [owl] } });
      const read = await folder.readKept(key, owl.name);
      expect(text(read)).toBe('hoot');
      read[0] = 0;
      expect(text(await folder.readKept(key, owl.name))).toBe('hoot');
    });

    it('refuses kept files that aren’t right, and writes nothing', async () => {
      const { folder } = await withFolder();
      const owl = await sound('hoot');
      const cat = await sound('miaow', 'wav');
      const { key } = await folder.write(null, 'Film', bytes('whole'), {
        kept: { uses: [owl.name], add: [owl] },
      });
      const tries: [string, WriteOptions['kept']][] = [
        ['invalid', { uses: ['sound-1234.mp3'] }],
        ['invalid', { uses: [owl.name.toUpperCase()] }],
        ['invalid', { uses: [owl.name.replace('.mp3', '.ogg')] }],
        ['invalid', { uses: [owl.name], add: [cat] }],
        ['invalid', { uses: [cat.name], add: [{ name: cat.name, bytes: bytes('purr') }] }],
        ['not_found', { uses: [owl.name, cat.name] }],
      ];
      for (const [code, kept] of tries) {
        await failsWith(code, () => folder.write(key, 'Film', bytes('half'), { kept }));
      }
      expect(text(await folder.read(key))).toBe('whole');
      expect(await folder.backups(key)).toEqual([]);
      expect(await folder.kept(key)).toEqual([owl.name]);
    });

    it('deletes a sound once no version uses it, so the next save must add it again', async () => {
      const { folder } = await withFolder();
      const owl = await sound('hoot');
      const { key } = await folder.write(null, 'Film', bytes('v1'), {
        kept: { uses: [owl.name], add: [owl] },
      });
      // An autosave drops the version it replaces, so nothing uses the sound now.
      const saved = await folder.write(key, 'Film', bytes('v2'), { backup: false });
      expect(saved.kept).toEqual([]);
      expect(await folder.kept(key)).toEqual([]);
      await failsWith('not_found', () => folder.readKept(key, owl.name));
      // An Undo brings the sound back: the saver's list says it's gone, so it adds it.
      await failsWith('not_found', () =>
        folder.write(key, 'Film', bytes('v3'), { kept: { uses: [owl.name] } }),
      );
      await folder.write(key, 'Film', bytes('v3'), { kept: { uses: [owl.name], add: [owl] } });
      expect(text(await folder.readKept(key, owl.name))).toBe('hoot');
    });

    it('keeps a sound while a backup still uses it', async () => {
      const { folder } = await withFolder();
      const owl = await sound('hoot');
      const { key } = await folder.write(null, 'Film', bytes('v1'), {
        kept: { uses: [owl.name], add: [owl] },
      });
      const saved = await folder.write(key, 'Film', bytes('v2'));
      expect(saved.kept).toEqual([owl.name]);
      expect(saved.bytes).toBe(2);
      expect((await folder.backups(key))[0]?.bytes).toBe(2 + 4);
      expect(text(await folder.readKept(key, owl.name))).toBe('hoot');
    });

    it('reads only a kept file a version uses, and only from its own production', async () => {
      const { folders, folder } = await withFolder();
      const owl = await sound('hoot');
      const { key } = await folder.write(null, 'Film', bytes('v1'), {
        kept: { uses: [owl.name], add: [owl] },
      });
      const other = await folder.write(null, 'Other', bytes('x'));
      await failsWith('invalid', () => folder.readKept(key, '../meta.json'));
      await failsWith('invalid', () => folder.readKept(key, 'meta.json'));
      await failsWith('not_found', () => folder.readKept(other.key, owl.name));
      await failsWith('not_found', () => folder.kept('missing'));
      const ben = await folders.open((await folders.addPupil('Ben')).id);
      await failsWith('not_found', () => ben.readKept(key, owl.name));
    });

    it('takes a production’s sounds with it to the bin, back, and to a pupil’s folder', async () => {
      const folders = await make();
      const device = await folders.openDevice();
      const owl = await sound('hoot');
      const { key } = await device.write(null, 'At home', bytes('v1'), {
        kept: { uses: [owl.name], add: [owl] },
      });
      await device.remove(key);
      expect((await folders.bin())[0]?.bytes).toBe(2 + 4);
      await folders.restore('device', key);
      expect(text(await device.readKept(key, owl.name))).toBe('hoot');

      await folders.close();
      const ava = await folders.addPupil('Ava');
      await folders.moveDeviceFilms(ava.id);
      const moved = await folders.open(ava.id);
      expect(await moved.kept(key)).toEqual([owl.name]);
      expect(text(await moved.readKept(key, owl.name))).toBe('hoot');
    });
  });

  describe(`${name} meets the study store contract (spec 14 section 6.7)`, () => {
    it('keeps the study’s files, and lists, moves and removes them', async () => {
      const study = (await make()).study();
      expect(await study.list([])).toEqual([]);
      await study.write(['sessions', 'abcd2345.json'], bytes('{"events":[]}'));
      await study.write(['taking-part.json'], bytes('[]'));
      expect(text((await study.read(['sessions', 'abcd2345.json']))!)).toBe('{"events":[]}');
      expect([...(await study.list([]))].sort()).toEqual(['sessions', 'taking-part.json']);
      await study.move(['sessions', 'abcd2345.json'], ['sessions', 'efgh6789.json']);
      expect(await study.list(['sessions'])).toEqual(['efgh6789.json']);
      await study.remove(['sessions', 'efgh6789.json']);
      expect(await study.read(['sessions', 'efgh6789.json'])).toBeNull();
    });

    it('is apart from every pupil’s folder: removing pupils and emptying the bin leave it', async () => {
      const folders = await make();
      const pupil = await folders.addPupil('Ava');
      const folder = await folders.open(pupil.id);
      const study = folders.study();
      await study.write(['taking-part.json'], bytes(JSON.stringify([pupil.id])));
      await folder.write(null, 'The Owl', bytes('film'));
      expect((await folder.list()).map((production) => production.name)).toEqual(['The Owl']);
      await folders.removePupil(pupil.id);
      await folders.emptyBin();
      expect(text((await study.read(['taking-part.json']))!)).toBe(JSON.stringify([pupil.id]));
    });

    it('refuses an unsafe path, and can’t remove or move the study folder itself', async () => {
      const study = (await make()).study();
      for (const path of [[], ['..'], ['Sessions'], ['a/b'], ['con'], ['sessions', '']]) {
        await failsWith('internal', () => study.write(path, bytes('x')));
      }
      await failsWith('internal', () => study.remove([]));
      await failsWith('internal', () => study.move([], ['elsewhere']));
      await failsWith('internal', () => study.list(['..']));
    });
  });

  describe(`${name} meets the class Backstage contract (decision 0066)`, () => {
    const model = (path = 'models/robot/model.glb', data = 'glb') => ({ path, bytes: bytes(data) });
    const robot = [model(), model('thumbnail.webp', 'webp'), model('sketches/front.svg', '<svg/>')];
    const record = { id: 'class/Cast/robot', name: 'Robot', origin: 'imported' };

    it('keeps an item’s record exactly, and each of its files', async () => {
      const backstage = (await make()).backstage();
      const added = await backstage.add('class', 'class/Cast/robot', record, robot);
      expect(added).toMatchObject({ id: 'class/Cast/robot', owner: 'class', record });
      expect(added.files).toEqual([
        { path: 'models/robot/model.glb', bytes: 3 },
        { path: 'thumbnail.webp', bytes: 4 },
        { path: 'sketches/front.svg', bytes: 6 },
      ]);
      expect(await backstage.list()).toEqual([added]);
      expect(text(await backstage.read('class/Cast/robot', 'sketches/front.svg'))).toBe('<svg/>');
      await failsWith('not_found', () => backstage.read('class/Cast/robot', 'other.glb'));
      await failsWith('not_found', () => backstage.read('class/Cast/nobody', 'thumbnail.webp'));
    });

    it('belongs to the class or one pupil, and the teacher can promote it', async () => {
      const folders = await make();
      const ava = await folders.addPupil('Ava');
      const backstage = folders.backstage();
      await backstage.add(ava.id, 'class/Cast/ava-robot', record, robot);
      expect((await backstage.list())[0]?.owner).toBe(ava.id);
      await backstage.promote('class/Cast/ava-robot');
      expect((await backstage.list())[0]?.owner).toBe('class');
      await failsWith('not_found', () =>
        backstage.add('pupil-nobody', 'class/Cast/x', record, robot),
      );
    });

    it('never uses an id twice, even after the bin is emptied', async () => {
      const backstage = (await make()).backstage();
      await backstage.add('class', 'class/Cast/robot', record, robot);
      await failsWith('invalid', () => backstage.add('class', 'class/Cast/robot', record, robot));
      await backstage.remove('class/Cast/robot');
      await failsWith('invalid', () => backstage.add('class', 'class/Cast/robot', record, robot));
      await backstage.emptyBin();
      await failsWith('invalid', () => backstage.add('class', 'class/Cast/robot', record, robot));
    });

    it('refuses paths that aren’t plain and relative, and a path twice, adding nothing', async () => {
      const backstage = (await make()).backstage();
      for (const path of [
        '../model.glb',
        '/model.glb',
        'models//model.glb',
        'a\\b.glb',
        '',
        './x',
      ]) {
        await failsWith('invalid', () =>
          backstage.add('class', 'class/Cast/x', record, [model(path)]),
        );
      }
      await failsWith('invalid', () =>
        backstage.add('class', 'class/Cast/x', record, [model('a.glb'), model('a.glb')]),
      );
      await failsWith('invalid', () => backstage.add('class', '', record, robot));
      expect(await backstage.list()).toEqual([]);
    });

    it('sends an item to the bin, and back, as a production goes', async () => {
      const backstage = (await make()).backstage();
      await backstage.add('class', 'class/Cast/robot', record, robot);
      await backstage.remove('class/Cast/robot');
      expect(await backstage.list()).toEqual([]);
      expect((await backstage.bin()).map((item) => item.id)).toEqual(['class/Cast/robot']);
      await backstage.restore('class/Cast/robot');
      expect(text(await backstage.read('class/Cast/robot', 'models/robot/model.glb'))).toBe('glb');
      expect(await backstage.bin()).toEqual([]);
    });

    it('sends a removed pupil’s own items to the bin, and brings them back as the class’s', async () => {
      const folders = await make();
      const ava = await folders.addPupil('Ava');
      const backstage = folders.backstage();
      await backstage.add(ava.id, 'class/Cast/ava-robot', record, robot);
      await backstage.add('class', 'class/Cast/robot', record, robot);
      await folders.removePupil(ava.id);
      expect((await backstage.list()).map((item) => item.id)).toEqual(['class/Cast/robot']);
      await backstage.restore('class/Cast/ava-robot');
      expect(
        (await backstage.list()).find((item) => item.id === 'class/Cast/ava-robot')?.owner,
      ).toBe('class');
    });

    it('refuses a record it can’t keep as JSON', async () => {
      const backstage = (await make()).backstage();
      const looped: Record<string, unknown> = {};
      looped.self = looped;
      await failsWith('invalid', () => backstage.add('class', 'class/Cast/x', looped, robot));
      await failsWith('invalid', () => backstage.add('class', 'class/Cast/y', undefined, robot));
    });
  });
}
