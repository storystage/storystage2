/**
 * Class folders, a file store and a file picker held in memory, for tests. The folders are the
 * same rules every host uses (`storedClassFolders`), over a store in memory, so
 * `packages/production` and the studio can be tested against them without a device.
 */
import { storedClassFolders } from '../class-folders.ts';
import {
  collectedPath,
  FILE_LIMIT,
  FileError,
  type ClassFolders,
  type CollectedFile,
  type FilePicker,
} from '../files.ts';
import { checkPath, type FileStore, type StorePath } from '../store.ts';

const copy = (bytes: Uint8Array) => new Uint8Array(bytes);

/** Refuses anything over the limit before keeping it. `limit` is lowered in tests only. */
const within = (bytes: Uint8Array, limit: number) => {
  if (bytes.length > limit) throw new FileError('too_big');
  return bytes;
};

/** A file store in memory, with the same rules about paths as the real ones. */
export function memoryStore(): FileStore & { readonly files: ReadonlyMap<string, Uint8Array> } {
  const files = new Map<string, Uint8Array>();
  const key = (path: StorePath) => checkPath(path).join('/');
  const under = (path: StorePath) =>
    [...files.keys()].filter((name) => name.startsWith(`${key(path)}/`));

  return {
    files,
    async read(path) {
      const bytes = files.get(key(path));
      return bytes === undefined ? null : copy(bytes);
    },
    async write(path, bytes) {
      files.set(key(path), copy(bytes));
    },
    async remove(path) {
      files.delete(key(path));
      for (const name of under(path)) files.delete(name);
    },
    async list(path) {
      const prefix = `${key(path)}/`;
      const names = new Set<string>();
      for (const name of under(path)) names.add(name.slice(prefix.length).split('/')[0] ?? '');
      return [...names];
    },
    async move(from, to) {
      if (files.has(key(to)) || under(to).length > 0) throw new FileError('internal');
      const source = files.get(key(from));
      if (source !== undefined) {
        files.delete(key(from));
        files.set(key(to), source);
      }
      const prefix = key(from);
      for (const name of under(from)) {
        const bytes = files.get(name);
        files.delete(name);
        if (bytes !== undefined) files.set(`${key(to)}${name.slice(prefix.length)}`, bytes);
      }
    },
  };
}

/**
 * The class folders over a memory store. `clock` gives each save its time; `limit` stands in for
 * `FILE_LIMIT`, so a test can reach it without 512 MiB.
 */
export function memoryClassFolders(
  clock: () => Date = () => new Date(),
  limit = FILE_LIMIT,
): ClassFolders {
  return storedClassFolders(memoryStore(), { clock, limit });
}

/**
 * A file picker that plays scripted answers, for tests. `null` for an answer means the person
 * closed the picker. `limit` stands in for `FILE_LIMIT`, as for `memoryClassFolders`.
 */
export function memoryFilePicker(
  answers: {
    open?: () => { name: string; bytes: Uint8Array } | null;
    handBack?: () => readonly CollectedFile[] | null;
  } = {},
  limit = FILE_LIMIT,
): FilePicker & {
  readonly saved: { name: string; bytes: Uint8Array }[];
  readonly collected: CollectedFile[];
} {
  const saved: { name: string; bytes: Uint8Array }[] = [];
  const collected: CollectedFile[] = [];
  const answer = <T>(value: T | null | undefined): T => {
    if (value === null || value === undefined) throw new FileError('cancelled');
    return value;
  };
  return {
    saved,
    collected,
    async saveCopy(name, bytes) {
      saved.push({ name, bytes: copy(bytes) });
    },
    async open() {
      const file = answer(answers.open?.());
      within(file.bytes, limit);
      return file;
    },
    async collect(files) {
      const names = new Set(files.map(collectedPath));
      if (names.size !== files.length) throw new FileError('invalid');
      collected.push(...files.map((file) => ({ ...file, bytes: copy(file.bytes) })));
      return files.length;
    },
    async handBack() {
      const files = answer(answers.handBack?.());
      for (const file of files) within(file.bytes, limit);
      return files;
    },
  };
}
