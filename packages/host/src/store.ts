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

/** True for a part a store can use (spec 05 section 6.1). */
export function isSafePart(part: string): boolean {
  return SAFE_PART.test(part) && part !== '.' && part !== '..';
}

/** Throws unless every part is safe, so no path can leave the store's folder (threat F1). */
export function checkPath(path: StorePath): StorePath {
  if (path.length === 0 || !path.every(isSafePart)) throw new FileError('internal');
  return path;
}
