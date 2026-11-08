/**
 * The pupil folders' rules, written once over a `FileStore` (spec 05 sections 6.2 and 6.3):
 * keys, atomic saves, backups, the original and the bin. Every host's folders are these, over
 * its own store, so `describeClassFoldersContract` covers what they mean on every device.
 */
import {
  BACKUPS_KEPT,
  FILE_LIMIT,
  FileError,
  type BackupInfo,
  type BinnedProduction,
  type ClassFolders,
  type ProductionInfo,
  type ProductionKey,
  type Pupil,
  type PupilFolder,
  type PupilId,
} from './files.ts';
import { storedClassBackstage } from './class-backstage.ts';
import { checkPath, isSafePart, type FileStore, type StorePath } from './store.ts';

const NAME_LIMIT = 80;
const CLASS_FILE: StorePath = ['class.json'];
const META = 'meta.json';
const ORIGINAL = 'original.storystage';
/** How old a first save's file must be before a folder with no meta.json is swept away. */
const UNFINISHED_AFTER_MS = 60_000;
/** A version file's name: when it was written, in base 36, then random letters and digits. */
const VERSION_FILE = /^v-([a-z0-9]{1,12})-[a-z0-9]+\.storystage$/;

interface Version {
  readonly file: string;
  readonly savedAt: string;
  readonly bytes: number;
}

interface Meta {
  readonly name: string;
  readonly current: Version;
  readonly backups: readonly Version[];
  readonly original: string | null;
  readonly binnedAt?: string;
}

interface ClassFile {
  readonly version: 1;
  readonly pupils: readonly Pupil[];
}

export interface StoredClassFoldersOptions {
  /** Gives each save its time. */
  readonly clock?: () => Date;
  /** Stands in for `FILE_LIMIT`, so a test can reach it. */
  readonly limit?: number;
  /** Random letters and digits for ids and file names. Replaced in tests only. */
  readonly random?: () => string;
  /** Stands in for `CLASS_BACKSTAGE_LIMIT`, so a test can reach it. */
  readonly classLimit?: number;
}

const encoder = new TextEncoder();
const decoder = new TextDecoder();

function randomPart(): string {
  const bytes = new Uint8Array(9);
  globalThis.crypto.getRandomValues(bytes);
  return (
    [...bytes].map((byte) => (byte % 36).toString(36)).join('') + Date.now().toString(36).slice(-3)
  );
}

function checkName(name: string): string {
  const trimmed = name.trim();
  if (trimmed === '' || trimmed.length > NAME_LIMIT) throw new FileError('invalid');
  return trimmed;
}

const isObject = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null;

function isVersion(value: unknown): value is Version {
  return (
    isObject(value) &&
    typeof value.file === 'string' &&
    isSafePart(value.file) &&
    typeof value.savedAt === 'string' &&
    typeof value.bytes === 'number'
  );
}

function isMeta(value: unknown): value is Meta {
  return (
    isObject(value) &&
    typeof value.name === 'string' &&
    isVersion(value.current) &&
    Array.isArray(value.backups) &&
    value.backups.every(isVersion) &&
    (value.original === null || (typeof value.original === 'string' && isSafePart(value.original)))
  );
}

function isPupil(value: unknown): value is Pupil {
  return (
    isObject(value) &&
    typeof value.id === 'string' &&
    isSafePart(value.id) &&
    typeof value.name === 'string' &&
    (value.picture === null || typeof value.picture === 'string')
  );
}

const toJson = (value: unknown) => encoder.encode(`${JSON.stringify(value, null, 1)}\n`);

/** The class folders, over a store. */
export function storedClassFolders(
  store: FileStore,
  options: StoredClassFoldersOptions = {},
): ClassFolders {
  const clock = options.clock ?? (() => new Date());
  const limit = options.limit ?? FILE_LIMIT;
  const random = options.random ?? randomPart;
  const now = () => clock().toISOString();
  let current: PupilFolder | null = null;
  let writing: Promise<unknown> = Promise.resolve();

  const readJson = async (path: StorePath): Promise<unknown> => {
    const bytes = await store.read(checkPath(path));
    if (bytes === null) return null;
    try {
      return JSON.parse(decoder.decode(bytes));
    } catch {
      throw new FileError('unreadable');
    }
  };

  const readClass = async (): Promise<readonly Pupil[]> => {
    const value = await readJson(CLASS_FILE);
    if (value === null) return [];
    if (!isObject(value) || !Array.isArray(value.pupils) || !value.pupils.every(isPupil)) {
      throw new FileError('unreadable');
    }
    return value.pupils;
  };

  const writeClass = (pupils: readonly Pupil[]) =>
    store.write(CLASS_FILE, toJson({ version: 1, pupils } satisfies ClassFile));

  const pupilById = async (id: PupilId) => {
    const pupil = (await readClass()).find((each) => each.id === id);
    if (!pupil) throw new FileError('not_found');
    return pupil;
  };

  /** A production's folder, or `not_found` for a key that isn't a safe part (threat PS1). */
  const home = (area: 'pupils' | 'bin', pupil: PupilId, key: ProductionKey): StorePath => {
    if (!isSafePart(key)) throw new FileError('not_found');
    return checkPath([area, pupil, key]);
  };

  const readMeta = async (folder: StorePath): Promise<Meta> => {
    const value = await readJson([...folder, META]);
    if (value === null) throw new FileError('not_found');
    if (!isMeta(value)) throw new FileError('unreadable');
    return value;
  };

  const info = (key: ProductionKey, meta: Meta): ProductionInfo => ({
    key,
    name: meta.name,
    savedAt: meta.current.savedAt,
    bytes: meta.current.bytes,
    backups: meta.backups.length,
    hasOriginal: meta.original !== null,
  });

  const readFile = async (path: StorePath) => {
    const bytes = await store.read(checkPath(path));
    if (bytes === null) throw new FileError('unreadable');
    return bytes;
  };

  /** Step 3 of spec 05 section 6.3: removes files the meta doesn't list. */
  const tidy = async (folder: StorePath, meta: Meta) => {
    const kept = new Set([META, meta.current.file, ...meta.backups.map((v) => v.file)]);
    if (meta.original !== null) kept.add(meta.original);
    for (const name of await store.list(folder)) {
      if (!kept.has(name)) await store.remove(checkPath([...folder, name]));
    }
  };

  /** Every production in an area, with its pupil. */
  const productions = async (area: 'pupils' | 'bin', pupil?: PupilId) => {
    const pupils = pupil === undefined ? await store.list([area]) : [pupil];
    const found: { pupil: PupilId; key: ProductionKey; meta: Meta }[] = [];
    for (const each of pupils.filter(isSafePart)) {
      for (const key of (await store.list(checkPath([area, each]))).filter(isSafePart)) {
        try {
          found.push({ pupil: each, key, meta: await readMeta([area, each, key]) });
        } catch {
          // A folder without a whole meta.json is a save that never finished: not a production.
        }
      }
    }
    return found;
  };

  /** Changes run one after another, so two can't read and rewrite the same file at once. */
  const queue = <T>(work: () => Promise<T>): Promise<T> => {
    const run = writing.then(work, work);
    writing = run.catch(() => undefined);
    return run;
  };

  /**
   * Removes production folders that a first save left without a meta.json, once their files are a
   * minute old (S4's review of #194). A save in progress in another window is newer than that.
   */
  const sweep = async (pupil: PupilId) => {
    const cutoff = clock().getTime() - UNFINISHED_AFTER_MS;
    for (const key of (await store.list(checkPath(['pupils', pupil]))).filter(isSafePart)) {
      const folder = checkPath(['pupils', pupil, key]);
      const names = await store.list(folder);
      if (names.includes(META)) continue;
      const old = names.every((name) => {
        const time = VERSION_FILE.exec(name)?.[1];
        return time !== undefined && Number.parseInt(time, 36) < cutoff;
      });
      if (old) await store.remove(folder);
    }
  };

  const backstage = storedClassBackstage({
    store,
    queue,
    clock,
    random,
    limit,
    classLimit: options.classLimit,
    hasPupil: async (id) => (await readClass()).some((pupil) => pupil.id === id),
  });

  const folderFor = (pupil: Pupil): PupilFolder => {
    const write = async (
      key: ProductionKey | null,
      name: string,
      bytes: Uint8Array,
      backup: boolean,
    ): Promise<ProductionInfo> => {
      const title = checkName(name);
      if (bytes.length > limit) throw new FileError('too_big');
      await pupilById(pupil.id);
      const made = key ?? `production-${random()}`;
      const folder = home('pupils', pupil.id, made);
      const previous = key === null ? null : await readMeta(folder);
      const version = {
        file: `v-${clock().getTime().toString(36)}-${random()}.storystage`,
        savedAt: now(),
        bytes: bytes.length,
      };

      // 1. The new version, in a file of its own.
      await store.write(checkPath([...folder, version.file]), bytes);
      // 2. meta.json points at it, in one atomic write.
      const backups =
        previous === null
          ? []
          : backup
            ? [previous.current, ...previous.backups]
            : previous.backups;
      const meta: Meta = {
        name: title,
        current: version,
        backups: backups.slice(0, BACKUPS_KEPT),
        original: previous?.original ?? null,
      };
      await store.write(checkPath([...folder, META]), toJson(meta));
      // 3. Anything meta.json no longer lists.
      await tidy(folder, meta);
      return info(made, meta);
    };

    return {
      pupil,
      async list() {
        return (await productions('pupils', pupil.id)).map(({ key, meta }) => info(key, meta));
      },
      // Reads go through the queue too, so a read never finds a file a save has just tidied away.
      read(key) {
        return queue(async () => {
          const folder = home('pupils', pupil.id, key);
          const meta = await readMeta(folder);
          return readFile([...folder, meta.current.file]);
        });
      },
      write(key, name, bytes, options = {}) {
        return queue(() => write(key, name, bytes, options.backup !== false));
      },
      async backups(key): Promise<readonly BackupInfo[]> {
        const meta = await readMeta(home('pupils', pupil.id, key));
        return meta.backups.map((version, index) => ({
          index,
          savedAt: version.savedAt,
          bytes: version.bytes,
        }));
      },
      readBackup(key, index) {
        return queue(async () => {
          const folder = home('pupils', pupil.id, key);
          const version = (await readMeta(folder)).backups[index];
          if (!version) throw new FileError('not_found');
          return readFile([...folder, version.file]);
        });
      },
      keepOriginal(key, bytes) {
        return queue(async () => {
          if (bytes.length > limit) throw new FileError('too_big');
          const folder = home('pupils', pupil.id, key);
          const meta = await readMeta(folder);
          if (meta.original !== null) return;
          await store.write(checkPath([...folder, ORIGINAL]), bytes);
          await store.write(checkPath([...folder, META]), toJson({ ...meta, original: ORIGINAL }));
        });
      },
      readOriginal(key) {
        return queue(async () => {
          const folder = home('pupils', pupil.id, key);
          const meta = await readMeta(folder);
          return meta.original === null ? null : readFile([...folder, meta.original]);
        });
      },
      remove(key) {
        return queue(async () => {
          const folder = home('pupils', pupil.id, key);
          const meta = await readMeta(folder);
          const binned = home('bin', pupil.id, key);
          await store.write(checkPath([...folder, META]), toJson({ ...meta, binnedAt: now() }));
          await store.remove(binned);
          await store.move(folder, binned);
        });
      },
    };
  };

  /** A pupil's folder, after sweeping away first saves that never finished. */
  const folder = async (id: PupilId) => {
    const pupil = await pupilById(id);
    await queue(() => sweep(pupil.id)).catch(() => undefined);
    return folderFor(pupil);
  };

  return {
    pupils: readClass,

    addPupil(name, picture = null) {
      return queue(async () => {
        const pupil: Pupil = { id: `pupil-${random()}`, name: checkName(name), picture };
        await writeClass([...(await readClass()), pupil]);
        return pupil;
      });
    },

    renamePupil(id, name, picture) {
      return queue(async () => {
        const pupils = await readClass();
        const pupil = pupils.find((each) => each.id === id);
        if (!pupil) throw new FileError('not_found');
        const renamed: Pupil = {
          ...pupil,
          name: checkName(name),
          picture: picture === undefined ? pupil.picture : picture,
        };
        await writeClass(pupils.map((each) => (each.id === id ? renamed : each)));
        return renamed;
      });
    },

    removePupil(id) {
      return queue(async () => {
        const pupils = await readClass();
        if (!pupils.some((each) => each.id === id)) throw new FileError('not_found');
        for (const { key, meta } of await productions('pupils', id)) {
          const folder = home('pupils', id, key);
          await store.write(checkPath([...folder, META]), toJson({ ...meta, binnedAt: now() }));
          await store.remove(home('bin', id, key));
          await store.move(folder, home('bin', id, key));
        }
        await backstage.binOwnedBy(id);
        await writeClass(pupils.filter((each) => each.id !== id));
        await store.remove(checkPath(['pupils', id]));
        if (current?.pupil.id === id) current = null;
      });
    },

    async open(id) {
      current = await folder(id);
      return current;
    },

    folder,

    current: () => current,

    async close() {
      await writing;
      current = null;
    },

    async bin(): Promise<readonly BinnedProduction[]> {
      return (await productions('bin')).map(({ pupil, key, meta }) => ({
        ...info(key, meta),
        pupil,
        binnedAt: meta.binnedAt ?? meta.current.savedAt,
      }));
    },

    restore(pupil, key) {
      return queue(async () => {
        await pupilById(pupil);
        const binned = home('bin', pupil, key);
        const meta = await readMeta(binned);
        const kept: Meta = {
          name: meta.name,
          current: meta.current,
          backups: meta.backups,
          original: meta.original,
        };
        await store.write(checkPath([...binned, META]), toJson(kept));
        await store.move(binned, home('pupils', pupil, key));
      });
    },

    emptyBin() {
      return queue(() => store.remove(['bin']));
    },

    backstage: () => backstage,
  };
}
