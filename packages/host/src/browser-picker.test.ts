import { describe, expect, it } from 'vitest';
import {
  browserPicker,
  type PickedFile,
  type PickedFileHandle,
  type PickedFolderHandle,
  type PickedInFolder,
  type PickerPage,
} from './browser-picker.ts';
import type { CollectedFile } from './files.ts';

const bytes = (text: string) => new TextEncoder().encode(text);
const text = (data: Uint8Array) => new TextDecoder().decode(data);
const domError = (name: string) => Object.assign(new Error(name), { name });

const picked = (name: string, data: Uint8Array, size = data.length): PickedFile => ({
  name,
  size,
  arrayBuffer: async () => data.slice().buffer,
});

/** A folder the person might pick: files are bytes, folders are nested objects. */
type Tree = { [name: string]: Uint8Array | Tree };

/** A stand-in for a picked folder's handle, over a tree it writes into. */
function folderHandle(name: string, tree: Tree): PickedFolderHandle {
  const fileHandle = (file: string): PickedFileHandle => ({
    kind: 'file',
    name: file,
    getFile: async () => picked(file, tree[file] as Uint8Array),
    createWritable: async () => {
      let pending = new Uint8Array();
      return {
        write: async (data: Uint8Array) => {
          pending = new Uint8Array(data);
        },
        close: async () => {
          tree[file] = pending;
        },
        abort: async () => {},
      };
    },
  });
  return {
    kind: 'directory',
    name,
    async getDirectoryHandle(child: string, options: { create?: boolean } = {}) {
      if (!(child in tree)) {
        if (!options.create) throw domError('NotFoundError');
        tree[child] = {};
      }
      return folderHandle(child, tree[child] as Tree);
    },
    async getFileHandle(child: string, options: { create?: boolean } = {}) {
      if (!(child in tree) && !options.create) throw domError('NotFoundError');
      return fileHandle(child);
    },
    async *values() {
      for (const [child, value] of Object.entries(tree)) {
        yield value instanceof Uint8Array ? fileHandle(child) : folderHandle(child, value);
      }
    },
  };
}

/** A page with the Chromium pickers, answering with `tree` and recording what was saved. */
function chromium(tree: Tree = {}, saved: Tree = {}) {
  const page: PickerPage = {
    showSaveFilePicker: async (options) =>
      folderHandle('saved', saved).getFileHandle(
        (options as { suggestedName: string }).suggestedName,
        {
          create: true,
        },
      ),
    showOpenFilePicker: async () => [
      await folderHandle('chosen', tree).getFileHandle('film.storystage'),
    ],
    showDirectoryPicker: async () => folderHandle('chosen', tree),
    download: () => {
      throw new Error('no download where there are pickers');
    },
    chooseFile: async () => null,
    chooseFolder: async () => null,
  };
  return { page, tree, saved };
}

/** A page without them: downloads, a file input and a folder input. */
function elsewhere(
  answers: { file?: PickedFile | null; folder?: readonly PickedInFolder[] | null } = {},
) {
  const downloads: { name: string; bytes: Uint8Array }[] = [];
  const page: PickerPage = {
    download: (name, data) => downloads.push({ name, bytes: data }),
    chooseFile: async () => answers.file ?? null,
    chooseFolder: async () => answers.folder ?? null,
  };
  return { page, downloads };
}

const inFolder = (path: string, data: Uint8Array): PickedInFolder => ({
  ...picked(path.split('/').at(-1) ?? '', data),
  webkitRelativePath: path,
});

const film = (folder: string, file = 'Film.storystage', data = 'x'): CollectedFile => ({
  folder,
  file,
  bytes: bytes(data),
});

describe('the browser picker, with the system pickers (Chromium)', () => {
  it('saves a copy where the person picks', async () => {
    const { page, saved } = chromium();
    await browserPicker(() => page).saveCopy('The Owl.storystage', bytes('owl'));
    expect(text(saved['The Owl.storystage'] as Uint8Array)).toBe('owl');
  });

  it('opens the file the person picks, and refuses one over the limit unread', async () => {
    const { page } = chromium({ 'film.storystage': bytes('a film') });
    expect(await browserPicker(() => page).open()).toEqual({
      name: 'film.storystage',
      bytes: bytes('a film'),
    });
    await expect(browserPicker(() => page, 3).open()).rejects.toMatchObject({ code: 'too_big' });
  });

  it('says cancelled when the person closes the picker, or refuses it', async () => {
    for (const name of ['AbortError', 'NotAllowedError']) {
      const page: PickerPage = {
        ...chromium().page,
        showOpenFilePicker: () => Promise.reject(domError(name)),
        showDirectoryPicker: () => Promise.reject(domError(name)),
      };
      await expect(browserPicker(() => page).open()).rejects.toMatchObject({ code: 'cancelled' });
      await expect(browserPicker(() => page).handBack()).rejects.toMatchObject({
        code: 'cancelled',
      });
    }
  });

  it('collects into one folder per pupil, and hands back what is one level down', async () => {
    const { page, tree } = chromium();
    const picker = browserPicker(() => page);
    expect(
      await picker.collect([film('Ava'), film('Ben'), film('Ben', 'Film (2).storystage')]),
    ).toBe(3);
    expect(Object.keys(tree).sort()).toEqual(['Ava', 'Ben']);
    tree['loose.storystage'] = bytes('not in a pupil folder');
    (tree.Ava as Tree)['notes.txt'] = bytes('not a production');
    const back = await picker.handBack();
    expect(back.map((file) => `${file.folder}/${file.file}`).sort()).toEqual([
      'Ava/Film.storystage',
      'Ben/Film (2).storystage',
      'Ben/Film.storystage',
    ]);
  });

  it('refuses to collect a clash, an unsafe name or one over the limit, writing nothing', async () => {
    const { page, tree } = chromium();
    const picker = browserPicker(() => page, 3);
    for (const files of [
      [film('Ava'), film('Ava')],
      [film('../Ava')],
      [film('Ava', 'Film.txt')],
      [film('Ava', 'a/b.storystage')],
    ]) {
      await expect(picker.collect(files)).rejects.toMatchObject({ code: 'invalid' });
    }
    await expect(picker.collect([film('Ava', 'Film.storystage', 'long')])).rejects.toMatchObject({
      code: 'too_big',
    });
    expect(tree).toEqual({});
  });

  it('hands back nothing if any file is over the limit', async () => {
    const { page } = chromium({ Ava: { 'Film.storystage': bytes('long film') } });
    await expect(browserPicker(() => page, 3).handBack()).rejects.toMatchObject({
      code: 'too_big',
    });
  });
});

describe('the browser picker, without them (Safari, Firefox)', () => {
  it('downloads a copy, and each collected file named for its pupil', async () => {
    const { page, downloads } = elsewhere();
    const picker = browserPicker(() => page);
    await picker.saveCopy('The Owl.storystage', bytes('owl'));
    expect(await picker.collect([film('Ava'), film('Ben')])).toBe(2);
    expect(downloads.map((download) => download.name)).toEqual([
      'The Owl.storystage',
      'Ava - Film.storystage',
      'Ben - Film.storystage',
    ]);
  });

  it('opens a file from a file input, and says cancelled when it is closed', async () => {
    const opened = elsewhere({ file: picked('film.storystage', bytes('a film')) });
    expect((await browserPicker(() => opened.page).open()).name).toBe('film.storystage');
    await expect(browserPicker(() => elsewhere().page).open()).rejects.toMatchObject({
      code: 'cancelled',
    });
  });

  it('refuses a file over the limit before reading it', async () => {
    let read = false;
    const huge: PickedFile = {
      name: 'huge.storystage',
      size: 600 * 1024 * 1024,
      arrayBuffer: async () => {
        read = true;
        return new ArrayBuffer(0);
      },
    };
    await expect(browserPicker(() => elsewhere({ file: huge }).page).open()).rejects.toMatchObject({
      code: 'too_big',
    });
    expect(read).toBe(false);
  });

  it('hands back from a folder input, one level down only', async () => {
    const { page } = elsewhere({
      folder: [
        inFolder('Class/Ava/Film.storystage', bytes('a')),
        inFolder('Class/Ben/Owl.storystage', bytes('b')),
        inFolder('Class/loose.storystage', bytes('c')),
        inFolder('Class/Ben/old/Older.storystage', bytes('d')),
        inFolder('Class/Ben/notes.txt', bytes('e')),
      ],
    });
    const back = await browserPicker(() => page).handBack();
    expect(back.map((file) => `${file.folder}/${file.file}=${text(file.bytes)}`)).toEqual([
      'Ava/Film.storystage=a',
      'Ben/Owl.storystage=b',
    ]);
  });
});
