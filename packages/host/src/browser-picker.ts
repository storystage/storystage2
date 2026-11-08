/**
 * The browser version's file picker (decision 0065, spec 05 section 6.5). Where the browser has
 * the File System Access pickers (Chrome, Edge and Chromebooks), the person picks a file or a
 * folder in the system's own dialog. Elsewhere a copy is downloaded, a file is chosen with a file
 * input, and Hand back chooses a folder with a folder input. StoryStage gets only what the person
 * picks, never a path.
 */
import type { WritableLike } from './browser-store.ts';
import {
  FILE_LIMIT,
  FileError,
  collectedPath,
  safeFileName,
  type CollectedFile,
  type FilePicker,
} from './files.ts';

const EXTENSION = '.storystage';
const TYPES = [
  {
    description: 'StoryStage production',
    accept: { 'application/x-storystage': [EXTENSION] },
  },
];

/** A file the person picked: what `File` gives, so a test can stand in for it. */
export interface PickedFile {
  readonly name: string;
  readonly size: number;
  arrayBuffer(): Promise<ArrayBuffer>;
}

/** A picked file, from a folder input: its path below the folder the person chose. */
export interface PickedInFolder extends PickedFile {
  /** `chosen/folder/file`, as `webkitRelativePath` gives it. */
  readonly webkitRelativePath: string;
}

export interface PickedFileHandle {
  readonly kind: 'file';
  readonly name: string;
  getFile(): Promise<PickedFile>;
  createWritable(): Promise<WritableLike>;
}

export interface PickedFolderHandle {
  readonly kind: 'directory';
  readonly name: string;
  getDirectoryHandle(name: string, options?: { create?: boolean }): Promise<PickedFolderHandle>;
  getFileHandle(name: string, options?: { create?: boolean }): Promise<PickedFileHandle>;
  values(): AsyncIterable<PickedFileHandle | PickedFolderHandle>;
}

/**
 * What the picker uses from the page. `browserPicker()` takes it from `window`; a test passes
 * stand-ins. The three `show...` pickers are missing outside Chromium.
 */
export interface PickerPage {
  showSaveFilePicker?(options: object): Promise<PickedFileHandle>;
  showOpenFilePicker?(options: object): Promise<PickedFileHandle[]>;
  showDirectoryPicker?(options: object): Promise<PickedFolderHandle>;
  /** Downloads `bytes` as `name`. The browser asks where, or puts it in Downloads. */
  download(name: string, bytes: Uint8Array): void;
  /** A file input. `null` if the person closed it. */
  chooseFile(accept: string): Promise<PickedFile | null>;
  /** A folder input. `null` if the person closed it. */
  chooseFolder(): Promise<readonly PickedInFolder[] | null>;
}

/** The person closing a system picker is `AbortError`; refusing permission is `NotAllowedError`. */
function asFileError(error: unknown): FileError {
  if (error instanceof FileError) return error;
  const name = error instanceof Error ? error.name : '';
  if (name === 'AbortError') return new FileError('cancelled');
  if (name === 'NotAllowedError' || name === 'SecurityError') return new FileError('cancelled');
  if (name === 'QuotaExceededError') return new FileError('full');
  if (name === 'NoModificationAllowedError') return new FileError('locked');
  return new FileError('unreadable');
}

const guarded = async <T>(work: () => Promise<T>): Promise<T> => {
  try {
    return await work();
  } catch (error) {
    throw asFileError(error);
  }
};

/** A name Collect may write: what `safeFileName` gives, and a production's file name. */
const isCollectName = (file: CollectedFile) =>
  file.folder === safeFileName(file.folder) &&
  file.file === safeFileName(file.file) &&
  file.file.endsWith(EXTENSION) &&
  file.file.length > EXTENSION.length;

function checkCollect(files: readonly CollectedFile[], limit: number) {
  const names = new Set(files.map(collectedPath));
  if (names.size !== files.length || !files.every(isCollectName)) throw new FileError('invalid');
  if (files.some((file) => file.bytes.length > limit)) throw new FileError('too_big');
}

/** Reads a picked file, refusing one over the limit before reading it. */
async function readPicked(file: PickedFile, limit: number): Promise<Uint8Array> {
  if (file.size > limit) throw new FileError('too_big');
  return new Uint8Array(await file.arrayBuffer());
}

async function writeTo(handle: PickedFileHandle, bytes: Uint8Array) {
  const writable = await handle.createWritable();
  try {
    await writable.write(bytes);
    await writable.close();
  } catch (error) {
    await writable.abort().catch(() => undefined);
    throw error;
  }
}

/** The page's own download, file input and folder input. */
export function pageFallbacks(
  doc: Document = document,
): Pick<PickerPage, 'download' | 'chooseFile' | 'chooseFolder'> {
  const choose = (configure: (input: HTMLInputElement) => void) =>
    new Promise<FileList | null>((resolve) => {
      const input = doc.createElement('input');
      input.type = 'file';
      configure(input);
      input.addEventListener('change', () => resolve(input.files), { once: true });
      input.addEventListener('cancel', () => resolve(null), { once: true });
      input.click();
    });
  return {
    download(name, bytes) {
      const url = URL.createObjectURL(new Blob([bytes.slice().buffer]));
      const link = doc.createElement('a');
      link.href = url;
      link.download = name;
      link.click();
      setTimeout(() => URL.revokeObjectURL(url), 60_000);
    },
    async chooseFile(accept) {
      const files = await choose((input) => {
        input.accept = accept;
      });
      return files?.[0] ?? null;
    },
    async chooseFolder() {
      const files = await choose((input) => {
        input.webkitdirectory = true;
      });
      return files ? [...files] : null;
    },
  };
}

function windowPage(): PickerPage {
  const found = window as unknown as Record<string, unknown>;
  // Bound to `window`, as the browser requires. Missing outside Chromium.
  const bound = (name: string) => {
    const picker = found[name];
    return typeof picker === 'function' ? picker.bind(window) : undefined;
  };
  return {
    showSaveFilePicker: bound('showSaveFilePicker') as PickerPage['showSaveFilePicker'],
    showOpenFilePicker: bound('showOpenFilePicker') as PickerPage['showOpenFilePicker'],
    showDirectoryPicker: bound('showDirectoryPicker') as PickerPage['showDirectoryPicker'],
    ...pageFallbacks(),
  };
}

/** `limit` stands in for `FILE_LIMIT` in tests only. */
export function browserPicker(page: () => PickerPage = windowPage, limit = FILE_LIMIT): FilePicker {
  return {
    saveCopy: (suggestedName, bytes) =>
      guarded(async () => {
        const on = page();
        if (!on.showSaveFilePicker) {
          on.download(suggestedName, bytes);
          return;
        }
        const handle = await on.showSaveFilePicker({ suggestedName, types: TYPES });
        await writeTo(handle, bytes);
      }),

    open: () =>
      guarded(async () => {
        const on = page();
        let file: PickedFile | null;
        if (on.showOpenFilePicker) {
          const [handle] = await on.showOpenFilePicker({ types: TYPES, multiple: false });
          file = handle ? await handle.getFile() : null;
        } else {
          file = await on.chooseFile(EXTENSION);
        }
        if (!file) throw new FileError('cancelled');
        return { name: file.name, bytes: await readPicked(file, limit) };
      }),

    collect: (files) =>
      guarded(async () => {
        checkCollect(files, limit);
        const on = page();
        if (!on.showDirectoryPicker) {
          // No folder picker: each file downloads on its own, named for its pupil.
          for (const file of files) on.download(`${file.folder} - ${file.file}`, file.bytes);
          return files.length;
        }
        const chosen = await on.showDirectoryPicker({ mode: 'readwrite' });
        for (const file of files) {
          const folder = await chosen.getDirectoryHandle(file.folder, { create: true });
          await writeTo(await folder.getFileHandle(file.file, { create: true }), file.bytes);
        }
        return files.length;
      }),

    handBack: () =>
      guarded(async () => {
        const on = page();
        const found: { folder: string; file: string; picked: PickedFile }[] = [];
        if (on.showDirectoryPicker) {
          const chosen = await on.showDirectoryPicker({ mode: 'read' });
          for await (const folder of chosen.values()) {
            if (folder.kind !== 'directory') continue;
            for await (const file of folder.values()) {
              if (file.kind === 'file' && file.name.endsWith(EXTENSION)) {
                found.push({ folder: folder.name, file: file.name, picked: await file.getFile() });
              }
            }
          }
        } else {
          const picked = await on.chooseFolder();
          if (!picked) throw new FileError('cancelled');
          for (const file of picked) {
            // `chosen/folder/file`: exactly one level down.
            const [, folder, name, ...deeper] = file.webkitRelativePath.split('/');
            if (folder && name?.endsWith(EXTENSION) && deeper.length === 0) {
              found.push({ folder, file: name, picked: file });
            }
          }
        }
        // Any over the limit, and nothing is read.
        if (found.some(({ picked }) => picked.size > limit)) throw new FileError('too_big');
        const files: CollectedFile[] = [];
        for (const { folder, file, picked } of found) {
          files.push({ folder, file, bytes: await readPicked(picked, limit) });
        }
        return files;
      }),
  };
}
