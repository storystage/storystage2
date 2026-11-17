/**
 * A small file store, under the pupil folders' rules (spec 05 section 6.1). Each host provides
 * one: the native layer in the Tauri apps, the Origin Private File System in the browser, and
 * memory in tests. `storedClassFolders` does everything else.
 */
import { FileError } from './files.ts';

/** A path inside the store, as safe parts. */
export type StorePath = readonly string[];

export interface FileStore {
  /** A file's bytes, or `null` if there's no such file. */
  read(path: StorePath): Promise<Uint8Array | null>;
  /** Writes a whole file or nothing, making folders as needed. */
  write(path: StorePath, bytes: Uint8Array): Promise<void>;
  /** Removes a file, or a folder and everything in it. Nothing there is fine. */
  remove(path: StorePath): Promise<void>;
  /** The names directly inside a folder, or none if there's no such folder. */
  list(path: StorePath): Promise<readonly string[]>;
  /** Moves a file or folder to a place where nothing is yet. */
  move(from: StorePath, to: StorePath): Promise<void>;
}

const SAFE_PART = /^[a-z0-9][a-z0-9._-]{0,63}$/;

/** Windows' device names, which open a device instead of a file whatever follows the dot. */
const DEVICE = /^(con|prn|aux|nul|com[1-9]|lpt[1-9])(\.|$)/;

/**
 * True for a part a store can use (spec 05 section 6.1). Never ending in a dot, which Windows
 * drops, and never a device name. The native side has the same rule (`is_safe_part`), and
 * `apps/desktop/src-tauri/classes/fixtures/parts.json` is tested from both.
 */
export function isSafePart(part: string): boolean {
  return SAFE_PART.test(part) && !part.endsWith('.') && !DEVICE.test(part);
}

/** Throws unless every part is safe, so no path can leave the store's folder (threat F1). */
export function checkPath(path: StorePath): StorePath {
  if (path.length === 0 || !path.every(isSafePart)) throw new FileError('internal');
  return path;
}

/**
 * A store inside another, in one folder of it: every path becomes `[folder, ...path]`, so
 * nothing through it can reach outside that folder. `list([])` lists the folder itself; every
 * other path needs at least one part, so the folder as a whole can't be removed or moved.
 */
export function storeWithin(store: FileStore, folder: string): FileStore {
  const inside = (path: StorePath) => checkPath([folder, ...checkPath(path)]);
  return {
    read: async (path) => store.read(inside(path)),
    write: async (path, bytes) => store.write(inside(path), bytes),
    remove: async (path) => store.remove(inside(path)),
    list: async (path) => store.list(path.length === 0 ? checkPath([folder]) : inside(path)),
    move: async (from, to) => store.move(inside(from), inside(to)),
  };
}
