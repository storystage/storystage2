/**
 * The pupil folders' rules, written once over a `FileStore` (spec 05 sections 6.2 and 6.3):
 * keys, atomic saves, backups, the original and the bin. Every host's folders are these, over
 * its own store, so `describeClassFoldersContract` covers what they mean on every device.
 */
import {
  BACKUPS_KEPT,
  DEVICE_PUPIL,
  FILE_LIMIT,
  FileError,
  KEPT_FILE,
  type BackupInfo,
  type BinnedProduction,
  type BinnedPupil,
  type ClassFolders,
  type ProductionInfo,
  type ProductionKey,
  type Pupil,
  type PupilFolder,
  type PupilId,
  type SavedProduction,
  type WriteOptions,
} from './files.ts';
import { storedClassBackstage } from './class-backstage.ts';
import { checkPath, isSafePart, type FileStore, type StorePath, storeWithin } from './store.ts';

const NAME_LIMIT = 80;
const CLASS_FILE: StorePath = ['class.json'];
/** Removed pupils, beside the bin rather than in it: a store lists the bin's folders, not files. */
const BINNED_PUPILS: StorePath = ['binned-pupils.json'];
/** The study's own folder (spec 14 section 6.7), beside the pupil folders. */
const STUDY = 'study';
const META = 'meta.json';
const ORIGINAL = 'original.storystage';
/** How old a first save's file must be before a folder with no meta.json is swept away. */
const UNFINISHED_AFTER_MS = 60_000;
/** A version file's name: when it was written, in base 36, then random letters and digits. */
const VERSION_FILE = /^v-([a-z0-9]{1,12})-[a-z0-9]+\.storystage$/;
/**
 * The folder's layout, in `meta.json`: 2 since sounds are kept once (spec 03 1.4.1). A missing
 * one is 1. A production in a layout this build doesn't know is `unreadable`: it's listed, but
 * never read or written, so a build that's been rolled back can't tidy away what it doesn't know.
 * `isMeta` checks the version entries' shape before the layout is looked at, so layout 3 must keep
 * that shape, or check `layout` first: otherwise its productions are dropped from the list as
 * unfinished saves, not listed as unreadable (S4's review of #701).
 */
const LAYOUT = 2;

/** A kept file a version uses, and its size. */
interface Kept {
  readonly file: string;
  readonly bytes: number;
}

interface Version {
  readonly file: string;
  readonly savedAt: string;
  /** The version file's own size. */
  readonly bytes: number;
  /** The kept files it uses. None if missing, as in folders from before layout 2. */
  readonly kept?: readonly Kept[];
}

interface Meta {
  readonly layout?: number;
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

const isSize = (value: unknown): value is number =>
  typeof value === 'number' && Number.isSafeInteger(value) && value >= 0;

function isKept(value: unknown): value is Kept {
  return (
    isObject(value) &&
    typeof value.file === 'string' &&
    KEPT_FILE.test(value.file) &&
    isSize(value.bytes)
  );
}

function isVersion(value: unknown): value is Version {
  return (
    isObject(value) &&
    typeof value.file === 'string' &&
    isSafePart(value.file) &&
    typeof value.savedAt === 'string' &&
    typeof value.bytes === 'number' &&
    (value.kept === undefined || (Array.isArray(value.kept) && value.kept.every(isKept)))
  );
}

function isMeta(value: unknown): value is Meta {
  return (
    isObject(value) &&
    (value.layout === undefined ||
      (typeof value.layout === 'number' &&
        Number.isSafeInteger(value.layout) &&
        value.layout >= 1)) &&
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

/** A version's size as a whole film: its own file and every kept file it uses. */
const wholeBytes = (version: Version) =>
  (version.kept ?? []).reduce((total, kept) => total + kept.bytes, version.bytes);

/** Every kept file a listed version uses, with its size. */
function keptIn(meta: Meta): Map<string, number> {
  const kept = new Map<string, number>();
  for (const version of [meta.current, ...meta.backups]) {
    for (const each of version.kept ?? []) kept.set(each.file, each.bytes);
  }
  return kept;
}

/** The first 32 hex digits of the bytes' SHA-256, as a kept file's name has them. */
async function hashOf(bytes: Uint8Array<ArrayBuffer>): Promise<string> {
  const digest = new Uint8Array(await globalThis.crypto.subtle.digest('SHA-256', bytes));
  return [...digest.subarray(0, 16)].map((byte) => byte.toString(16).padStart(2, '0')).join('');
}

/** A kept file's name holds its hash: `sound-<32 hex>.<type>`. */
const hashInName = (name: string) => name.slice('sound-'.length, 'sound-'.length + 32);

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

  const readBinnedPupils = async (): Promise<readonly BinnedPupil[]> => {
    const value = await readJson(BINNED_PUPILS);
    if (value === null) return [];
    if (
      !Array.isArray(value) ||
      !value.every(
        (entry) => isObject(entry) && isPupil(entry.pupil) && typeof entry.binnedAt === 'string',
      )
    ) {
      throw new FileError('unreadable');
    }
    return value as BinnedPupil[];
  };

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

  /** A production to read or write: one in a layout this build knows. */
  const readUsable = async (folder: StorePath): Promise<Meta> => {
    const meta = await readMeta(folder);
    if ((meta.layout ?? 1) > LAYOUT) throw new FileError('unreadable');
    return meta;
  };

  const info = (key: ProductionKey, meta: Meta): ProductionInfo => ({
    key,
    name: meta.name,
    savedAt: meta.current.savedAt,
    bytes: wholeBytes(meta.current),
    backups: meta.backups.length,
    hasOriginal: meta.original !== null,
  });

  const readFile = async (path: StorePath) => {
    const bytes = await store.read(checkPath(path));
    if (bytes === null) throw new FileError('unreadable');
    return bytes;
  };

  /** The files a meta lists: itself, each version, the kept files they use, the original. */
  const listed = (meta: Meta) => {
    const names = new Set([META, meta.current.file, ...meta.backups.map((v) => v.file)]);
    for (const name of keptIn(meta).keys()) names.add(name);
    if (meta.original !== null) names.add(meta.original);
    return names;
  };

  /**
   * Step 3 of spec 05 section 6.3: removes files the meta doesn't list. It reads `meta.json` again
   * first and keeps what that lists too, so a save another window made between this save's steps 2
   * and 3 keeps its version and its sounds. If it can't be read, nothing is removed: a stray is
   * harmless, and the next save tidies it.
   */
  const tidy = async (folder: StorePath, meta: Meta) => {
    let latest: Meta;
    try {
      latest = await readMeta(folder);
    } catch {
      return;
    }
    const keep = listed(meta);
    for (const name of listed(latest)) keep.add(name);
    for (const name of await store.list(folder)) {
      if (!keep.has(name)) await store.remove(checkPath([...folder, name]));
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
   * minute old (S4's review of #194). A save in progress in another window is newer than that. The
   * version file is written before any kept file (spec 03 1.4.1), so a folder is dated by its
   * version files, and the kept files go with them.
   */
  const sweep = async (pupil: PupilId) => {
    const cutoff = clock().getTime() - UNFINISHED_AFTER_MS;
    for (const key of (await store.list(checkPath(['pupils', pupil]))).filter(isSafePart)) {
      const folder = checkPath(['pupils', pupil, key]);
      const names = await store.list(folder);
      if (names.includes(META)) continue;
      // An empty folder goes too, as it always has. A folder of kept files alone, which no save
      // leaves, has nothing to date it by, so it stays.
      const versions = names.filter((name) => !KEPT_FILE.test(name));
      const old =
        (names.length === 0 || versions.length > 0) &&
        versions.every((name) => {
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

  const study = storeWithin(store, STUDY);

  /**
   * The kept files a listed version uses that the folder has (S4's review of #701). Another
   * window's tidy, or something outside StoryStage, can delete one: it's then left out, so a save
   * that names it is `not_found`, and the saver adds it again, which heals the current version.
   */
  const keptHere = async (folder: StorePath, meta: Meta): Promise<Map<string, number>> => {
    const here = new Set(await store.list(folder));
    return new Map([...keptIn(meta)].filter(([name]) => here.has(name)));
  };

  /**
   * Checks a save's kept files before anything is written (spec 03 1.4.1): every name a
   * `KEPT_FILE`, every add among the uses, within the limit and named by its hash, and every use
   * kept already or added. Gives the version's kept files, and the adds the folder lacks.
   */
  const checkKept = async (option: WriteOptions['kept'], already: ReadonlyMap<string, number>) => {
    const uses = [...new Set(option?.uses ?? [])];
    const adds = new Map((option?.add ?? []).map((add) => [add.name, add.bytes]));
    if (!uses.every((name) => KEPT_FILE.test(name))) throw new FileError('invalid');
    if (![...adds.keys()].every((name) => uses.includes(name))) throw new FileError('invalid');
    if ([...adds.values()].some((bytes) => bytes.length > limit)) throw new FileError('too_big');
    if (!uses.every((name) => already.has(name) || adds.has(name))) {
      throw new FileError('not_found');
    }
    // Copied first, so what's hashed is what's kept, whatever the caller does with its bytes.
    const missing = [...adds]
      .filter(([name]) => !already.has(name))
      .map(([name, bytes]) => [name, new Uint8Array(bytes)] as const);
    for (const [name, bytes] of missing) {
      if ((await hashOf(bytes)) !== hashInName(name)) throw new FileError('invalid');
    }
    const sizes = new Map([
      ...already,
      ...missing.map(([name, bytes]) => [name, bytes.length] as const),
    ]);
    return {
      kept: uses.map((file): Kept => ({ file, bytes: sizes.get(file) ?? 0 })),
      missing,
    };
  };

  const folderFor = (pupil: Pupil): PupilFolder => {
    const write = async (
      key: ProductionKey | null,
      name: string,
      bytes: Uint8Array,
      backup: boolean,
      keptOption: WriteOptions['kept'],
    ): Promise<SavedProduction> => {
      const title = checkName(name);
      if (bytes.length > limit) throw new FileError('too_big');
      // The device's folder is outside the class list, so it can't have been removed from it.
      if (pupil.id !== DEVICE_PUPIL.id) await pupilById(pupil.id);
      const made = key ?? `production-${random()}`;
      const folder = home('pupils', pupil.id, made);
      const previous = key === null ? null : await readUsable(folder);
      const { kept, missing } = await checkKept(
        keptOption,
        previous === null ? new Map() : await keptHere(folder, previous),
      );
      const version: Version = {
        file: `v-${clock().getTime().toString(36)}-${random()}.storystage`,
        savedAt: now(),
        bytes: bytes.length,
        kept,
      };

      // 1. The new version, in a file of its own: first, so a first save that crashes is dated
      // by it. Then each kept file the folder lacks, each atomically (spec 03 1.4.1).
      await store.write(checkPath([...folder, version.file]), bytes);
      for (const [file, keptBytes] of missing) {
        await store.write(checkPath([...folder, file]), keptBytes);
      }
      // 2. meta.json points at it, in one atomic write.
      const backups =
        previous === null
          ? []
          : backup
            ? [previous.current, ...previous.backups]
            : previous.backups;
      const meta: Meta = {
        layout: LAYOUT,
        name: title,
        current: version,
        backups: backups.slice(0, BACKUPS_KEPT),
        original: previous?.original ?? null,
      };
      await store.write(checkPath([...folder, META]), toJson(meta));
      // 3. Anything meta.json no longer lists.
      await tidy(folder, meta);
      return { ...info(made, meta), kept: [...(await keptHere(folder, meta)).keys()].sort() };
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
          const meta = await readUsable(folder);
          return readFile([...folder, meta.current.file]);
        });
      },
      write(key, name, bytes, options = {}) {
        return queue(() => write(key, name, bytes, options.backup !== false, options.kept));
      },
      async backups(key): Promise<readonly BackupInfo[]> {
        const meta = await readMeta(home('pupils', pupil.id, key));
        return meta.backups.map((version, index) => ({
          index,
          savedAt: version.savedAt,
          bytes: wholeBytes(version),
        }));
      },
      readBackup(key, index) {
        return queue(async () => {
          const folder = home('pupils', pupil.id, key);
          const version = (await readUsable(folder)).backups[index];
          if (!version) throw new FileError('not_found');
          return readFile([...folder, version.file]);
        });
      },
      kept(key) {
        return queue(async () => {
          const folder = home('pupils', pupil.id, key);
          return [...(await keptHere(folder, await readUsable(folder))).keys()].sort();
        });
      },
      readKept(key, name) {
        return queue(async () => {
          if (!KEPT_FILE.test(name)) throw new FileError('invalid');
          const folder = home('pupils', pupil.id, key);
          if (!keptIn(await readUsable(folder)).has(name)) throw new FileError('not_found');
          return readFile([...folder, name]);
        });
      },
      keepOriginal(key, bytes) {
        return queue(async () => {
          if (bytes.length > limit) throw new FileError('too_big');
          const folder = home('pupils', pupil.id, key);
          const meta = await readUsable(folder);
          if (meta.original !== null) return;
          await store.write(checkPath([...folder, ORIGINAL]), bytes);
          await store.write(checkPath([...folder, META]), toJson({ ...meta, original: ORIGINAL }));
        });
      },
      readOriginal(key) {
        return queue(async () => {
          const folder = home('pupils', pupil.id, key);
          const meta = await readUsable(folder);
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

    addPupils(names) {
      return queue(async () => {
        // Every name is checked before anything is written.
        const added = names.map((name): Pupil => ({
          id: `pupil-${random()}`,
          name: checkName(name),
          picture: null,
        }));
        if (added.length > 0) await writeClass([...(await readClass()), ...added]);
        return added;
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
        // Kept before the class list changes, so the pupil can always be put back.
        const removed = pupils.find((each) => each.id === id);
        const binned = (await readBinnedPupils()).filter((entry) => entry.pupil.id !== id);
        if (removed) {
          await store.write(
            BINNED_PUPILS,
            toJson([{ pupil: removed, binnedAt: now() }, ...binned]),
          );
        }
        await writeClass(pupils.filter((each) => each.id !== id));
        await store.remove(checkPath(['pupils', id]));
        if (current?.pupil.id === id) current = null;
      });
    },

    async open(id) {
      current = await folder(id);
      return current;
    },

    async deviceFilms() {
      return (await productions('pupils', DEVICE_PUPIL.id)).map(({ key, meta }) => info(key, meta));
    },

    moveDeviceFilms(to) {
      return queue(async () => {
        if (to === DEVICE_PUPIL.id) throw new FileError('not_found');
        await pupilById(to);
        let moved = 0;
        for (const { key } of await productions('pupils', DEVICE_PUPIL.id)) {
          // Keys are random, so a pupil's folder never already has one.
          await store.move(home('pupils', DEVICE_PUPIL.id, key), home('pupils', to, key));
          moved += 1;
        }
        return moved;
      });
    },

    async openDevice() {
      // Only on a device with no class list, so a pupil can't keep work where Collect never
      // reaches it, or use the Prompter outside their own count (S4's review of #248).
      if ((await readClass()).length > 0) throw new FileError('invalid');
      await queue(() => sweep(DEVICE_PUPIL.id)).catch(() => undefined);
      current = folderFor(DEVICE_PUPIL);
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
        if (pupil !== DEVICE_PUPIL.id) await pupilById(pupil);
        const binned = home('bin', pupil, key);
        // Everything but when it was binned, fields of a newer layout included.
        const restored: Record<string, unknown> = { ...(await readMeta(binned)) };
        delete restored.binnedAt;
        await store.write(checkPath([...binned, META]), toJson(restored));
        await store.move(binned, home('pupils', pupil, key));
      });
    },

    binnedPupils: readBinnedPupils,

    restorePupil(id) {
      return queue(async () => {
        const binned = await readBinnedPupils();
        const entry = binned.find((each) => each.pupil.id === id);
        if (!entry) throw new FileError('not_found');
        const pupils = await readClass();
        if (!pupils.some((each) => each.id === id)) await writeClass([...pupils, entry.pupil]);
        await store.write(BINNED_PUPILS, toJson(binned.filter((each) => each.pupil.id !== id)));
        return entry.pupil;
      });
    },

    emptyBin() {
      return queue(async () => {
        await store.remove(['bin']);
        await store.remove(BINNED_PUPILS);
      });
    },

    backstage: () => backstage,
    study: () => study,
  };
}
