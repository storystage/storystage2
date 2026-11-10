/**
 * Saving an exported film: the MP4 and its two caption files, named after the title (spec 08
 * section 4; decision 0028). The host's picker saves one `.storystage` file at a time, so a way to
 * save the three together (`saveFilm`) is asked of S8. Until the host has it, the browser saves
 * them: into a folder the learner picks, where the browser can (Chrome, Edge), or else as one
 * `.zip`, so a browser's "allow multiple downloads?" can never lose the captions (S5's review).
 */
import { FileError, type FilePicker, type HostInterface } from '@storystage/host';
import type { FilmExport } from '@storystage/export';
import { zipSync } from 'fflate';

export interface FilmFile {
  readonly file: string;
  readonly bytes: Uint8Array;
}

/** What the host will offer: the system's save dialog for the film, with its captions beside it. */
type FilmPicker = FilePicker & {
  saveFilm?(name: string, files: readonly FilmFile[]): Promise<void>;
};

/** The parts of the browser's folder picker this uses. */
export interface FolderPage {
  showDirectoryPicker?(options: { mode: 'readwrite' }): Promise<{
    getFileHandle(
      name: string,
      options: { create: true },
    ): Promise<{
      createWritable(): Promise<{ write(data: Uint8Array): Promise<void>; close(): Promise<void> }>;
    }>;
  }>;
}

const utf8 = new TextEncoder();

/** The three files of an exported film. */
export function filmFiles(film: FilmExport): FilmFile[] {
  return [
    { file: `${film.name}.mp4`, bytes: new Uint8Array(film.mp4) },
    { file: `${film.name}.vtt`, bytes: utf8.encode(film.vtt) },
    { file: `${film.name}.srt`, bytes: utf8.encode(film.srt) },
  ];
}

/** The learner closed the picker: the job keeps the film, to save again. */
const isAbort = (e: unknown) => e instanceof DOMException && e.name === 'AbortError';

/** All three into a folder the learner picks. */
async function intoFolder(page: Required<FolderPage>, files: readonly FilmFile[]): Promise<void> {
  let folder;
  try {
    folder = await page.showDirectoryPicker({ mode: 'readwrite' });
  } catch (e) {
    throw isAbort(e) ? new FileError('cancelled') : e;
  }
  for (const { file, bytes } of files) {
    const handle = await folder.getFileHandle(file, { create: true });
    const writing = await handle.createWritable();
    await writing.write(bytes);
    await writing.close();
  }
}

/** One download: the three files in a `.zip`, stored as they are (an MP4 doesn't shrink). */
function asZip(name: string, files: readonly FilmFile[]): void {
  const zip = zipSync(Object.fromEntries(files.map((f) => [f.file, f.bytes])), { level: 0 });
  const url = URL.createObjectURL(
    new Blob([zip as Uint8Array<ArrayBuffer>], { type: 'application/zip' }),
  );
  const a = document.createElement('a');
  a.href = url;
  a.download = `${name}.zip`;
  a.click();
  // Long enough for the browser to start the download.
  setTimeout(() => URL.revokeObjectURL(url), 60_000);
}

export async function saveFilm(
  host: HostInterface,
  film: FilmExport,
  page: FolderPage = window as FolderPage,
): Promise<void> {
  const files = filmFiles(film);
  const picker = host.picker as FilmPicker;
  if (picker.saveFilm) return picker.saveFilm(film.name, files);
  if (page.showDirectoryPicker) return intoFolder(page as Required<FolderPage>, files);
  asZip(film.name, files);
}
