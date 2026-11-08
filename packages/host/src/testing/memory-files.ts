/**
 * Class folders and a file picker held in memory, for tests. They behave as the real ones must
 * (`describeClassFoldersContract`), so `packages/production` and the studio can be tested
 * against them without a device.
 */
import {
  BACKUPS_KEPT,
  FILE_LIMIT,
  FileError,
  type BackupInfo,
  type BinnedProduction,
  type ClassFolders,
  type CollectedFile,
  type FilePicker,
  type ProductionInfo,
  type ProductionKey,
  type Pupil,
  type PupilFolder,
  type PupilId,
} from '../files.ts';

interface Version {
  readonly bytes: Uint8Array;
  readonly savedAt: string;
}

interface Stored {
  name: string;
  current: Version;
  backups: Version[];
  original: Uint8Array | null;
}

const NAME_LIMIT = 80;

function checkName(name: string): string {
  const trimmed = name.trim();
  if (trimmed === '' || trimmed.length > NAME_LIMIT) throw new FileError('invalid');
  return trimmed;
}

const copy = (bytes: Uint8Array) => new Uint8Array(bytes);

/** Refuses anything over the limit before keeping it. `limit` is lowered in tests only. */
const within = (bytes: Uint8Array, limit: number) => {
  if (bytes.length > limit) throw new FileError('too_big');
  return bytes;
};

/** `clock` gives each write its time, so tests can see the order. */
/** `limit` stands in for `FILE_LIMIT`, so a test can reach it without 512 MiB. */
export function memoryClassFolders(
  clock: () => Date = () => new Date(),
  limit = FILE_LIMIT,
): ClassFolders {
  const pupils = new Map<PupilId, Pupil>();
  const folders = new Map<PupilId, Map<ProductionKey, Stored>>();
  const binned: { pupil: PupilId; key: ProductionKey; stored: Stored; binnedAt: string }[] = [];
  let next = 0;
  let current: PupilFolder | null = null;
  let writing = Promise.resolve();
  const now = () => clock().toISOString();

  const info = (key: ProductionKey, stored: Stored): ProductionInfo => ({
    key,
    name: stored.name,
    savedAt: stored.current.savedAt,
    bytes: stored.current.bytes.length,
    backups: stored.backups.length,
    hasOriginal: stored.original !== null,
  });

  const folderOf = (id: PupilId) => {
    const folder = folders.get(id);
    if (!folder) throw new FileError('not_found');
    return folder;
  };

  const folderFor = (pupil: Pupil): PupilFolder => {
    const found = (key: ProductionKey) => {
      const stored = folderOf(pupil.id).get(key);
      if (!stored) throw new FileError('not_found');
      return stored;
    };
    return {
      pupil,
      async list() {
        return [...folderOf(pupil.id)].map(([key, stored]) => info(key, stored));
      },
      async read(key) {
        return copy(found(key).current.bytes);
      },
      write(key, name, bytes, options = {}) {
        const done = (async () => {
          const title = checkName(name);
          const version = { bytes: copy(within(bytes, limit)), savedAt: now() };
          const folder = folderOf(pupil.id);
          if (key === null) {
            next += 1;
            const made = `production-${next}`;
            const stored = { name: title, current: version, backups: [], original: null };
            folder.set(made, stored);
            return info(made, stored);
          }
          const stored = found(key);
          if (options.backup !== false) {
            stored.backups = [stored.current, ...stored.backups].slice(0, BACKUPS_KEPT);
          }
          stored.current = version;
          stored.name = title;
          return info(key, stored);
        })();
        writing = writing.then(() =>
          done.then(
            () => undefined,
            () => undefined,
          ),
        );
        return done;
      },
      async backups(key): Promise<readonly BackupInfo[]> {
        return found(key).backups.map((version, index) => ({
          index,
          savedAt: version.savedAt,
          bytes: version.bytes.length,
        }));
      },
      async readBackup(key, index) {
        const version = found(key).backups[index];
        if (!version) throw new FileError('not_found');
        return copy(version.bytes);
      },
      async keepOriginal(key, bytes) {
        const stored = found(key);
        if (stored.original === null) stored.original = copy(bytes);
      },
      async readOriginal(key) {
        const original = found(key).original;
        return original === null ? null : copy(original);
      },
      async remove(key) {
        const stored = found(key);
        folderOf(pupil.id).delete(key);
        binned.push({ pupil: pupil.id, key, stored, binnedAt: now() });
      },
    };
  };

  return {
    async pupils() {
      return [...pupils.values()];
    },
    async addPupil(name, picture = null) {
      next += 1;
      const pupil = { id: `pupil-${next}`, name: checkName(name), picture };
      pupils.set(pupil.id, pupil);
      folders.set(pupil.id, new Map());
      return pupil;
    },
    async renamePupil(id, name, picture) {
      const pupil = pupils.get(id);
      if (!pupil) throw new FileError('not_found');
      const renamed = {
        ...pupil,
        name: checkName(name),
        picture: picture === undefined ? pupil.picture : picture,
      };
      pupils.set(id, renamed);
      return renamed;
    },
    async removePupil(id) {
      const folder = folderOf(id);
      for (const [key, stored] of folder) binned.push({ pupil: id, key, stored, binnedAt: now() });
      folders.delete(id);
      pupils.delete(id);
      if (current?.pupil.id === id) current = null;
    },
    async open(id) {
      const pupil = pupils.get(id);
      if (!pupil) throw new FileError('not_found');
      current = folderFor(pupil);
      return current;
    },
    current: () => current,
    async close() {
      await writing;
      current = null;
    },
    async bin(): Promise<readonly BinnedProduction[]> {
      return binned.map(({ pupil, key, stored, binnedAt }) => ({
        ...info(key, stored),
        pupil,
        binnedAt,
      }));
    },
    async restore(pupil, key) {
      const at = binned.findIndex((entry) => entry.pupil === pupil && entry.key === key);
      const entry = binned[at];
      const folder = folders.get(pupil);
      if (!entry || !folder) throw new FileError('not_found');
      binned.splice(at, 1);
      folder.set(key, entry.stored);
    },
    async emptyBin() {
      binned.length = 0;
    },
  };
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
      const names = new Set(files.map((file) => `${file.folder}/${file.file}`));
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
