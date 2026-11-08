/**
 * The browser version's file store (spec 05 section 6.1): the Origin Private File System, in a
 * `classes` folder of the site's own storage. A write goes through `createWritable`, which only
 * replaces the file when it's closed, so a file is whole or untouched.
 */
import { FileError } from './files.ts';
import { checkPath, type FileStore, type StorePath } from './store.ts';

/** The parts of the File System Access API this store uses, so a test can stand in for them. */
export interface WritableLike {
  write(data: Uint8Array): Promise<void>;
  close(): Promise<void>;
  abort(): Promise<void>;
}

export interface FileHandleLike {
  readonly kind: 'file';
  getFile(): Promise<{ arrayBuffer(): Promise<ArrayBuffer> }>;
  createWritable(): Promise<WritableLike>;
}

export interface DirectoryHandleLike {
  readonly kind: 'directory';
  getDirectoryHandle(name: string, options?: { create?: boolean }): Promise<DirectoryHandleLike>;
  getFileHandle(name: string, options?: { create?: boolean }): Promise<FileHandleLike>;
  removeEntry(name: string, options?: { recursive?: boolean }): Promise<void>;
  entries(): AsyncIterable<[string, FileHandleLike | DirectoryHandleLike]>;
}

const errorName = (error: unknown) => (error instanceof Error ? error.name : '');

/** The browser's errors as `FileError` codes. */
function asFileError(error: unknown): FileError {
  if (error instanceof FileError) return error;
  switch (errorName(error)) {
    case 'QuotaExceededError':
      return new FileError('full');
    case 'NoModificationAllowedError':
      return new FileError('locked');
    default:
      return new FileError('unreadable');
  }
}

const missing = (error: unknown) =>
  errorName(error) === 'NotFoundError' || errorName(error) === 'TypeMismatchError';

/** The browser's own storage, from `navigator.storage.getDirectory()`. */
export function originPrivateRoot(): Promise<DirectoryHandleLike> {
  return navigator.storage.getDirectory() as unknown as Promise<DirectoryHandleLike>;
}

/** The parts of `navigator.storage` used to ask that the site's files are kept. */
export interface StorageManagerLike {
  persisted?(): Promise<boolean>;
  persist?(): Promise<boolean>;
}

const siteStorage = (): StorageManagerLike | undefined =>
  (globalThis as { navigator?: { storage?: StorageManagerLike } }).navigator?.storage;

/**
 * Asks the browser to keep the site's files under storage pressure and after a time unused (S4,
 * WP8.4). `true` if they're kept; a refusal, a missing API or an error is `false`, and nothing
 * is shown. Firefox may ask the person; Chromium decides by itself.
 */
export async function requestPersistence(
  storage: StorageManagerLike | undefined = siteStorage(),
): Promise<boolean> {
  try {
    if (!storage?.persist) return false;
    if (await storage.persisted?.()) return true;
    return (await storage.persist()) === true;
  } catch {
    return false;
  }
}

/** The browser store, and whether the browser agreed to keep its files. */
export interface BrowserStore extends FileStore {
  /** Asks once, the first time the store is used or this is called, and gives that answer after. */
  persistent(): Promise<boolean>;
}

/**
 * `root` is called the first time the store is used, so nothing is touched at start-up. That's
 * also when the browser is asked to keep the files, once.
 */
export function browserStore(
  root: () => Promise<DirectoryHandleLike> = originPrivateRoot,
  storage: () => StorageManagerLike | undefined = siteStorage,
): BrowserStore {
  let asked: Promise<boolean> | null = null;
  const persistent = () => (asked ??= requestPersistence(storage()));
  let classes: Promise<DirectoryHandleLike> | null = null;
  /** A browser without the storage, or one that refuses it, says `unreadable` and is asked again next time. */
  const base = () => {
    void persistent();
    return (classes ??= root()
      .then((handle) => handle.getDirectoryHandle('classes', { create: true }))
      .catch((error: unknown) => {
        classes = null;
        throw asFileError(error);
      }));
  };

  /** The folder holding a path's last part, or `null` if it isn't there and `create` is off. */
  const parentOf = async (path: StorePath, create: boolean) => {
    let folder = await base();
    for (const part of checkPath(path).slice(0, -1)) {
      try {
        folder = await folder.getDirectoryHandle(part, { create });
      } catch (error) {
        if (!create && missing(error)) return null;
        throw asFileError(error);
      }
    }
    return folder;
  };

  const last = (path: StorePath) => path[path.length - 1] ?? '';

  const folderAt = async (path: StorePath) => {
    const parent = await parentOf(path, false);
    if (!parent) return null;
    try {
      return await parent.getDirectoryHandle(last(path));
    } catch (error) {
      if (missing(error)) return null;
      throw asFileError(error);
    }
  };

  const read = async (path: StorePath) => {
    const parent = await parentOf(path, false);
    if (!parent) return null;
    try {
      const file = await (await parent.getFileHandle(last(path))).getFile();
      return new Uint8Array(await file.arrayBuffer());
    } catch (error) {
      if (missing(error)) return null;
      throw asFileError(error);
    }
  };

  const write = async (path: StorePath, bytes: Uint8Array) => {
    const parent = await parentOf(path, true);
    if (!parent) throw new FileError('internal');
    let writable: WritableLike | null = null;
    try {
      writable = await (await parent.getFileHandle(last(path), { create: true })).createWritable();
      await writable.write(bytes);
      await writable.close();
    } catch (error) {
      await writable?.abort().catch(() => undefined);
      throw asFileError(error);
    }
  };

  const remove = async (path: StorePath) => {
    const parent = await parentOf(path, false);
    if (!parent) return;
    try {
      await parent.removeEntry(last(path), { recursive: true });
    } catch (error) {
      if (!missing(error)) throw asFileError(error);
    }
  };

  const list = async (path: StorePath) => {
    const folder = await folderAt(path);
    if (!folder) return [];
    const names: string[] = [];
    for await (const [name] of folder.entries()) names.push(name);
    return names;
  };

  /** Copies a folder or file, then removes the original. Moves are into the bin and back. */
  const copyInto = async (from: StorePath, to: StorePath): Promise<boolean> => {
    const bytes = await read(from);
    if (bytes !== null) {
      await write(to, bytes);
      return true;
    }
    const folder = await folderAt(from);
    if (!folder) return false;
    for await (const [name] of folder.entries()) await copyInto([...from, name], [...to, name]);
    return true;
  };

  return {
    persistent,
    read,
    write,
    remove,
    list,
    async move(from, to) {
      if ((await read(to)) !== null || (await folderAt(to)) !== null)
        throw new FileError('internal');
      if (await copyInto(from, to)) await remove(from);
    },
  };
}
