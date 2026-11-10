/**
 * Saving an exported film: the MP4 and its two caption files, named after the title (spec 08
 * section 4; decision 0028). The host's picker saves one `.storystage` file at a time, so a way to
 * save the three together is asked of S8 (`saveFilm`). Until the host has it, the browser's
 * downloads save them.
 */
import type { FilePicker, HostInterface } from '@storystage/host';
import type { FilmExport } from '@storystage/export';

export interface FilmFile {
  readonly file: string;
  readonly bytes: Uint8Array;
}

/** What the host will offer: the system's save dialog for the film, with its captions beside it. */
type FilmPicker = FilePicker & {
  saveFilm?(name: string, files: readonly FilmFile[]): Promise<void>;
};

const utf8 = new TextEncoder();

/** The three files of an exported film. */
export function filmFiles(film: FilmExport): FilmFile[] {
  return [
    { file: `${film.name}.mp4`, bytes: new Uint8Array(film.mp4) },
    { file: `${film.name}.vtt`, bytes: utf8.encode(film.vtt) },
    { file: `${film.name}.srt`, bytes: utf8.encode(film.srt) },
  ];
}

const TYPES: Readonly<Record<string, string>> = {
  mp4: 'video/mp4',
  vtt: 'text/vtt',
  srt: 'application/x-subrip',
};

/** The browser's download, for each file. */
function download(files: readonly FilmFile[]): void {
  for (const { file, bytes } of files) {
    const type = TYPES[file.slice(file.lastIndexOf('.') + 1)] ?? 'application/octet-stream';
    const url = URL.createObjectURL(new Blob([bytes as Uint8Array<ArrayBuffer>], { type }));
    const a = document.createElement('a');
    a.href = url;
    a.download = file;
    a.click();
    // Long enough for the browser to start the download.
    setTimeout(() => URL.revokeObjectURL(url), 60_000);
  }
}

export async function saveFilm(host: HostInterface, film: FilmExport): Promise<void> {
  const files = filmFiles(film);
  const picker = host.picker as FilmPicker;
  if (picker.saveFilm) return picker.saveFilm(film.name, files);
  download(files);
}
