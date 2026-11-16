import type { FilmExport } from '@storystage/export';
import { FileError } from '@storystage/host';
import { memoryFilePicker } from '@storystage/host/testing';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { filmFiles, saveFilm, type FolderPage } from './saveFilm.ts';

const film: FilmExport = {
  mp4: new Uint8Array([1, 2, 3]).buffer,
  vtt: 'WEBVTT\n',
  srt: '1\n',
  name: 'The Owl',
  capped: false,
  seconds: 3,
  sound: null,
};

const text = (bytes: Uint8Array) => new TextDecoder().decode(bytes);

/** A browser page whose folder picker records what was written, or is closed. */
function folderPage(closed = false) {
  const written = new Map<string, Uint8Array>();
  const page: Required<FolderPage> = {
    showDirectoryPicker: async () => {
      if (closed) throw new DOMException('closed', 'AbortError');
      return {
        getFileHandle: async (name) => ({
          createWritable: async () => ({
            write: async (data) => void written.set(name, data),
            close: async () => undefined,
          }),
        }),
      };
    },
  };
  return { page, written };
}

/** The browser version's picker: no `saveFilm`. */
const browser = () => ({ picker: { ...memoryFilePicker(), saveFilm: undefined } });

afterEach(() => vi.restoreAllMocks());

describe('saveFilm', () => {
  it('names the three files after the title, the video first', () => {
    const files = filmFiles(film);
    expect(files.map((f) => f.file)).toEqual(['The Owl.mp4', 'The Owl.vtt', 'The Owl.srt']);
    expect([...files[0]!.bytes]).toEqual([1, 2, 3]);
    expect(text(files[1]!.bytes)).toBe('WEBVTT\n');
    expect(text(files[2]!.bytes)).toBe('1\n');
  });

  it('in the apps, saves the three together through the host’s picker', async () => {
    const picker = memoryFilePicker();
    const { page, written } = folderPage();
    await saveFilm({ picker }, film, page);
    expect(picker.films).toHaveLength(1);
    expect(picker.films[0]!.name).toBe('The Owl');
    expect(picker.films[0]!.files.map((f) => f.file)).toEqual([
      'The Owl.mp4',
      'The Owl.vtt',
      'The Owl.srt',
    ]);
    // The browser's own folder picker isn't asked.
    expect(written.size).toBe(0);
  });

  it('in the apps, closing the dialog is a cancel, so the film can be saved again', async () => {
    const picker = memoryFilePicker({ saveFilm: () => false });
    const saving = saveFilm({ picker }, film, folderPage().page);
    await expect(saving).rejects.toBeInstanceOf(FileError);
    await expect(saving).rejects.toMatchObject({ code: 'cancelled' });
    expect(picker.films).toEqual([]);
  });

  it('in a browser that can pick a folder, writes the three into it', async () => {
    const { page, written } = folderPage();
    await saveFilm(browser(), film, page);
    expect([...written.keys()]).toEqual(['The Owl.mp4', 'The Owl.vtt', 'The Owl.srt']);
    expect(text(written.get('The Owl.vtt')!)).toBe('WEBVTT\n');
  });

  it('in a browser, closing the folder picker is a cancel', async () => {
    await expect(saveFilm(browser(), film, folderPage(true).page)).rejects.toMatchObject({
      code: 'cancelled',
    });
  });

  it('in a browser that can’t pick a folder, downloads one zip named after the title', async () => {
    const blobs: Blob[] = [];
    vi.spyOn(URL, 'createObjectURL').mockImplementation((blob) => {
      blobs.push(blob as Blob);
      return 'blob:film';
    });
    vi.spyOn(URL, 'revokeObjectURL').mockImplementation(() => undefined);
    const clicked: string[] = [];
    vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(function (
      this: HTMLAnchorElement,
    ) {
      clicked.push(this.download);
    });
    await saveFilm(browser(), film, {});
    expect(clicked).toEqual(['The Owl.zip']);
    expect(blobs.map((b) => b.type)).toEqual(['application/zip']);
  });
});
