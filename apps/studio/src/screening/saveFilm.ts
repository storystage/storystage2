/**
 * Saving an exported film: the MP4 and its two caption files, named after the title (spec 08
 * section 4; decision 0028). In the apps, the host saves the three together (`saveFilm`): one
 * system dialog, captions beside the film, or one zip on Android. The browser version, and iPad
 * for now, save them here instead: into a folder the learner picks, where the browser can
 * (Chrome, Edge), or else as one `.zip`, so a browser's "allow multiple downloads?" can never lose
 * the captions (S5's review).
 */
import { FileError, type FilmFile, type HostInterface } from '@storystage/host';
import type { FilmExport } from '@storystage/export';
import { writeArchive } from '@storystage/production';

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

/** The three files of an exported film: the video first, as the host's `saveFilm` asks. */
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

/** One download: the three files in a `.zip`, by the repo's one archive writer (spec 03 section 1). */
function asZip(name: string, files: readonly FilmFile[]): void {
  const zip = writeArchive(files.map((f) => ({ name: f.file, bytes: f.bytes })));
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
  host: Pick<HostInterface, 'picker'>,
  film: FilmExport,
  page: FolderPage = window as FolderPage,
): Promise<void> {
  const files = filmFiles(film);
  if (host.picker.saveFilm) return host.picker.saveFilm(film.name, files);
  if (page.showDirectoryPicker) return intoFolder(page as Required<FolderPage>, files);
  asZip(film.name, files);
}
