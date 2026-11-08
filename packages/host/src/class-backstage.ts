/**
 * The class Backstage's rules (decision 0066, spec 05 section 6.6), over the same `FileStore` as
 * the pupil folders, and through the same queue, so their changes run one at a time together.
 *
 * ```
 * backstage/items/<key>/item.json   { id, owner, record, addedAt, files: [{ path, bytes, file }] }
 * backstage/items/<key>/f-<time>-<n> each file, under a name made here
 * backstage/bin/<key>/...           the same, with "binnedAt"
 * backstage/retired.json            ids emptied from the bin, which are never used again
 * ```
 *
 * An add writes its files first and item.json last, so an item is listed only once it's whole.
 */
import {
  BACKSTAGE_RECORD_LIMIT,
  CLASS_BACKSTAGE_LIMIT,
  FileError,
  type BackstageOwner,
  type BinnedStoredModel,
  type ClassBackstage,
  type PupilId,
  type StoredModel,
} from './files.ts';
import { checkPath, isSafePart, type FileStore, type StorePath } from './store.ts';

const ITEM = 'item.json';
const ITEMS: StorePath = ['backstage', 'items'];
const BIN: StorePath = ['backstage', 'bin'];
const RETIRED: StorePath = ['backstage', 'retired.json'];
const ID_LIMIT = 200;
const PATH_LIMIT = 255;
const UNFINISHED_AFTER_MS = 60_000;
const DATA_FILE = /^f-([a-z0-9]{1,12})-\d+$/;

interface StoredFile {
  readonly path: string;
  readonly bytes: number;
  readonly file: string;
}

interface ItemFile {
  readonly id: string;
  readonly owner: BackstageOwner;
  readonly record: unknown;
  readonly addedAt: string;
  readonly files: readonly StoredFile[];
  readonly binnedAt?: string;
}

const encoder = new TextEncoder();
const decoder = new TextDecoder();
const toJson = (value: unknown) => encoder.encode(`${JSON.stringify(value, null, 1)}\n`);

const isObject = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null;

/** A plain relative path: `/` between non-empty parts, none of them `.` or `..`. */
export function isModelPath(path: string): boolean {
  return (
    path.length > 0 &&
    path.length <= PATH_LIMIT &&
    !path.includes('\\') &&
    !path.includes('\0') &&
    path.split('/').every((part) => part !== '' && part !== '.' && part !== '..')
  );
}

function isItemFile(value: unknown): value is ItemFile {
  return (
    isObject(value) &&
    typeof value.id === 'string' &&
    typeof value.owner === 'string' &&
    typeof value.addedAt === 'string' &&
    'record' in value &&
    Array.isArray(value.files) &&
    value.files.every(
      (file: unknown) =>
        isObject(file) &&
        typeof file.path === 'string' &&
        typeof file.bytes === 'number' &&
        typeof file.file === 'string' &&
        isSafePart(file.file),
    )
  );
}

const shown = ({ id, owner, record, addedAt, files }: ItemFile): StoredModel => ({
  id,
  owner,
  record,
  addedAt,
  files: files.map(({ path, bytes }) => ({ path, bytes })),
});

export interface ClassBackstageNeeds {
  readonly store: FileStore;
  /** The pupil folders' queue: every change runs through it. */
  readonly queue: <T>(work: () => Promise<T>) => Promise<T>;
  readonly clock: () => Date;
  readonly random: () => string;
  /** `FILE_LIMIT`, or a lower one in tests. */
  readonly limit: number;
  /** The most the class keeps: `CLASS_BACKSTAGE_LIMIT`, or a lower one in tests. */
  readonly classLimit?: number;
  readonly hasPupil: (id: PupilId) => Promise<boolean>;
}

export interface StoredClassBackstage extends ClassBackstage {
  /** For `removePupil`, inside its queued work: a pupil's own items go to the bin. */
  binOwnedBy(pupil: PupilId): Promise<void>;
}

export function storedClassBackstage(needs: ClassBackstageNeeds): StoredClassBackstage {
  const { store, queue, clock, random, limit } = needs;
  const classLimit = needs.classLimit ?? CLASS_BACKSTAGE_LIMIT;
  const now = () => clock().toISOString();

  const readJson = async (path: StorePath): Promise<unknown> => {
    const bytes = await store.read(checkPath(path));
    if (bytes === null) return null;
    try {
      return JSON.parse(decoder.decode(bytes));
    } catch {
      throw new FileError('unreadable');
    }
  };

  /** Every whole item in an area, with its folder's key. */
  const items = async (area: StorePath) => {
    const found: { key: string; item: ItemFile }[] = [];
    for (const key of (await store.list(area)).filter(isSafePart)) {
      try {
        const item = await readJson([...area, key, ITEM]);
        if (isItemFile(item)) found.push({ key, item });
      } catch {
        // An item without a whole item.json is an add that never finished.
      }
    }
    return found.sort((a, b) => a.item.id.localeCompare(b.item.id));
  };

  const retired = async (): Promise<readonly string[]> => {
    const value = await readJson(RETIRED);
    if (value === null) return [];
    if (!Array.isArray(value) || !value.every((id) => typeof id === 'string')) {
      throw new FileError('unreadable');
    }
    return value;
  };

  const find = async (area: StorePath, id: string) => {
    const found = (await items(area)).find(({ item }) => item.id === id);
    if (!found) throw new FileError('not_found');
    return found;
  };

  /** Removes item folders that an add left without an item.json, once a minute old. */
  const sweep = async () => {
    const cutoff = clock().getTime() - UNFINISHED_AFTER_MS;
    for (const key of (await store.list(ITEMS)).filter(isSafePart)) {
      const names = await store.list(checkPath([...ITEMS, key]));
      if (names.includes(ITEM)) continue;
      const old = names.every((name) => {
        const time = DATA_FILE.exec(name)?.[1];
        return time !== undefined && Number.parseInt(time, 36) < cutoff;
      });
      if (old) await store.remove(checkPath([...ITEMS, key]));
    }
  };

  const move = async (from: StorePath, to: StorePath, item: ItemFile) => {
    await store.write(checkPath([...from, ITEM]), toJson(item));
    await store.move(from, to);
  };

  const binItem = async (key: string, item: ItemFile) => {
    const binned = checkPath([...BIN, key]);
    await store.remove(binned);
    await move(checkPath([...ITEMS, key]), binned, { ...item, binnedAt: now() });
  };

  return {
    async list() {
      return (await items(ITEMS)).map(({ item }) => shown(item));
    },

    add(owner, id, record, files) {
      return queue(async () => {
        if (owner !== 'class' && !(isSafePart(owner) && (await needs.hasPupil(owner)))) {
          throw new FileError('not_found');
        }
        if (typeof id !== 'string' || id.length === 0 || id.length > ID_LIMIT) {
          throw new FileError('invalid');
        }
        const paths = files.map((file) => file.path);
        if (!paths.every(isModelPath) || new Set(paths).size !== paths.length) {
          throw new FileError('invalid');
        }
        let recordJson: string | undefined;
        try {
          recordJson = JSON.stringify(record);
        } catch {
          throw new FileError('invalid');
        }
        if (recordJson === undefined) throw new FileError('invalid');
        if (encoder.encode(recordJson).length > BACKSTAGE_RECORD_LIMIT) {
          throw new FileError('too_big');
        }
        if (files.some((file) => file.bytes.length > limit)) throw new FileError('too_big');

        await sweep();
        const live = await items(ITEMS);
        const binned = await items(BIN);
        const used = new Set([
          ...live.map(({ item }) => item.id),
          ...binned.map(({ item }) => item.id),
          ...(await retired()),
        ]);
        if (used.has(id)) throw new FileError('invalid');
        const total = [...live, ...binned].reduce(
          (sum, { item }) => sum + item.files.reduce((n, file) => n + file.bytes, 0),
          0,
        );
        const adding = files.reduce((sum, file) => sum + file.bytes.length, 0);
        if (total + adding > classLimit) throw new FileError('full');

        const folder = checkPath([...ITEMS, `model-${random()}`]);
        const time = clock().getTime().toString(36);
        const stored: StoredFile[] = [];
        for (const [index, file] of files.entries()) {
          const name = `f-${time}-${index}`;
          await store.write(checkPath([...folder, name]), file.bytes);
          stored.push({ path: file.path, bytes: file.bytes.length, file: name });
        }
        const item: ItemFile = {
          id,
          owner,
          record: JSON.parse(recordJson) as unknown,
          addedAt: now(),
          files: stored,
        };
        // Last, so the item is listed only once every file is there.
        await store.write(checkPath([...folder, ITEM]), toJson(item));
        return shown(item);
      });
    },

    read(id, path) {
      return queue(async () => {
        const { key, item } = await find(ITEMS, id);
        const file = item.files.find((each) => each.path === path);
        if (!file) throw new FileError('not_found');
        const bytes = await store.read(checkPath([...ITEMS, key, file.file]));
        if (bytes === null) throw new FileError('unreadable');
        return bytes;
      });
    },

    promote(id) {
      return queue(async () => {
        const { key, item } = await find(ITEMS, id);
        if (item.owner === 'class') return;
        await store.write(checkPath([...ITEMS, key, ITEM]), toJson({ ...item, owner: 'class' }));
      });
    },

    remove(id) {
      return queue(async () => {
        const { key, item } = await find(ITEMS, id);
        await binItem(key, item);
      });
    },

    async bin(): Promise<readonly BinnedStoredModel[]> {
      return (await items(BIN)).map(({ item }) => ({
        ...shown(item),
        binnedAt: item.binnedAt ?? item.addedAt,
      }));
    },

    restore(id) {
      return queue(async () => {
        const { key, item } = await find(BIN, id);
        const owner =
          item.owner === 'class' || (await needs.hasPupil(item.owner)) ? item.owner : 'class';
        const kept: ItemFile = {
          id: item.id,
          owner,
          record: item.record,
          addedAt: item.addedAt,
          files: item.files,
        };
        const back = checkPath([...ITEMS, key]);
        await store.remove(back);
        await move(checkPath([...BIN, key]), back, kept);
      });
    },

    emptyBin() {
      return queue(async () => {
        const ids = (await items(BIN)).map(({ item }) => item.id);
        // The ids first, so an emptied id can never come back, even after a crash.
        await store.write(RETIRED, toJson([...new Set([...(await retired()), ...ids])]));
        await store.remove(BIN);
      });
    },

    async binOwnedBy(pupil) {
      for (const { key, item } of await items(ITEMS)) {
        if (item.owner === pupil) await binItem(key, item);
      }
    },
  };
}
