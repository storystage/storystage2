/**
 * Backstages whose files aren't in a folder the app can fetch from: a film's packed models
 * (decision 0049) and the class Backstage on this device (decision 0066). Each is a `Backstage`,
 * as `backstageFrom` makes for the shipped one, giving the stage `blob:` URLs for its model files
 * and thumbnails. `combineBackstages(shipped, film, classBackstage)` puts them together, shipped
 * first, for the one model source each App passes to every stage (S2, S3, S5). The film comes
 * before the class: an id is never reused, so the two copies are the same model, and the film's
 * is in memory already, so a film opened on another device reads nothing from the class.
 *
 * - **A film's models** are in memory already (the open production's `files.models`), so their
 *   URLs are made on first use, synchronously, and kept.
 * - **The class Backstage's** files are in the host's store, read asynchronously, and could be
 *   gigabytes in all. So its records are listed at once, but a model's files are read only when
 *   `prepare` is asked for its id: the stage's mount prepares the ids a film uses before it loads
 *   them. Until then, `find` and `thumbnail` give `null`, as for a model that isn't there.
 *
 * `dispose` revokes every URL made. Call it when the film closes, or the class Backstage changes.
 */
import { catalogueText } from './catalogue.ts';
import { creditsBySection } from './credits.ts';
import type { Backstage, BackstageModel } from './loader.ts';
import { MANIFEST_VERSION, validateManifest, type BackstageItem } from './manifest.ts';

type Id = BackstageItem['id'];

/** Making and revoking object URLs. The browser's `URL` by default; tests pass their own. */
export interface ObjectUrls {
  create(blob: Blob): string;
  revoke(url: string): void;
}

const browserUrls: ObjectUrls = {
  create: (blob) => URL.createObjectURL(blob),
  revoke: (url) => URL.revokeObjectURL(url),
};

/** A Backstage that makes `blob:` URLs, and gives them back. */
export interface DisposableBackstage {
  readonly backstage: Backstage;
  /** Revokes every URL this Backstage made. It still lists its items, but finds none. */
  dispose(): void;
}

const MIME: Readonly<Record<string, string>> = {
  glb: 'model/gltf-binary',
  vrm: 'model/gltf-binary',
  webp: 'image/webp',
  png: 'image/png',
  jpg: 'image/jpeg',
  jpeg: 'image/jpeg',
};
const mimeOf = (path: string) =>
  MIME[path.slice(path.lastIndexOf('.') + 1).toLowerCase()] ?? 'application/octet-stream';

/** A Backstage over records whose files come from `bytesOf`, which gives `undefined` for none. */
function overBytes(
  items: readonly BackstageItem[],
  bytesOf: (item: BackstageItem, path: string) => Uint8Array | undefined,
  urls: ObjectUrls,
): DisposableBackstage {
  const byId = new Map(items.map((i) => [i.id, i]));
  const made = new Map<string, string>();
  let disposed = false;
  const urlOf = (item: BackstageItem, path: string): string | null => {
    if (disposed) return null;
    const key = `${item.id}\n${path}`;
    const known = made.get(key);
    if (known) return known;
    const bytes = bytesOf(item, path);
    if (!bytes) return null;
    const url = urls.create(new Blob([bytes.slice()], { type: mimeOf(path) }));
    made.set(key, url);
    return url;
  };
  const list = [...byId.values()];
  const backstage: Backstage = {
    items: list,
    item: (id) => byId.get(id),
    find(id): BackstageModel | null {
      const i = byId.get(id);
      const url = i ? urlOf(i, i.files.model) : null;
      if (!i || !url) return null;
      return { url, joints: i.joints, ...(i.vrm ? { vrm: i.vrm } : {}) };
    },
    thumbnail(id) {
      const i = byId.get(id);
      return i ? urlOf(i, i.files.thumbnail) : null;
    },
    credits: () => creditsBySection(list),
    catalogue: () => catalogueText({ manifestVersion: MANIFEST_VERSION, items: list }),
  };
  return {
    backstage,
    dispose() {
      disposed = true;
      for (const url of made.values()) urls.revoke(url);
      made.clear();
    },
  };
}

/** A record if it's a valid imported model's. Anything else is left out. */
function importedRecord(record: unknown): BackstageItem | null {
  const checked = validateManifest({ manifestVersion: MANIFEST_VERSION, items: [record] });
  if (!checked.ok) return null;
  const item = checked.manifest.items[0]!;
  return item.origin === 'imported' ? item : null;
}

/** A film's packed model: its folder under `models/` and its record (`PackedModel`). */
export interface FilmModel {
  readonly folder: string;
  readonly item: unknown;
}

/**
 * A film's packed models (`manifest.models`) as a Backstage, from the open production's files
 * (`files.models`, keyed `models/<folder>/<path>`). A film from another device shows its imported
 * models even where this device's class Backstage lacks them.
 */
export function filmBackstage(
  models: readonly FilmModel[],
  files: ReadonlyMap<string, Uint8Array>,
  urls: ObjectUrls = browserUrls,
): DisposableBackstage {
  const folderOf = new Map<Id, string>();
  const items: BackstageItem[] = [];
  for (const m of models) {
    const item = importedRecord(m.item);
    if (!item || folderOf.has(item.id)) continue;
    folderOf.set(item.id, m.folder);
    items.push(item);
  }
  return overBytes(
    items,
    (item, path) => files.get(`models/${folderOf.get(item.id)}/${path}`),
    urls,
  );
}

/** What the class Backstage view needs from the host. `ClassFolders.backstage()` fits. */
export interface ClassModelStore {
  list(): Promise<readonly { readonly id: string; readonly record: unknown }[]>;
  read(id: string, path: string): Promise<Uint8Array>;
}

/** The class Backstage as a Backstage, whose models' files are read when they're prepared. */
export interface ClassBackstageView extends DisposableBackstage {
  /**
   * Reads these models' files (model and thumbnail), so `find` and `thumbnail` give their URLs.
   * Ids it doesn't have, and files it can't read, are left out: those models stay not found.
   */
  prepare(ids: readonly string[]): Promise<void>;
}

/**
 * The class Backstage on this device as a Backstage (decision 0066). Its records are listed at
 * once; each model's files are read when `prepare` asks for them.
 */
export async function openClassBackstage(
  store: ClassModelStore,
  urls: ObjectUrls = browserUrls,
): Promise<ClassBackstageView> {
  const items: BackstageItem[] = [];
  const seen = new Set<Id>();
  for (const stored of await store.list()) {
    const item = importedRecord(stored.record);
    if (!item || item.id !== stored.id || seen.has(item.id)) continue;
    seen.add(item.id);
    items.push(item);
  }
  const read = new Map<string, Uint8Array>();
  const view = overBytes(items, (item, path) => read.get(`${item.id}\n${path}`), urls);
  const byId = new Map(items.map((i) => [i.id, i]));
  return {
    ...view,
    async prepare(ids) {
      await Promise.all(
        ids.flatMap((id) => {
          const item = byId.get(id as Id);
          if (!item) return [];
          return [item.files.model, item.files.thumbnail].map(async (path) => {
            const key = `${item.id}\n${path}`;
            if (read.has(key)) return;
            try {
              read.set(key, await store.read(item.id, path));
            } catch {
              // Unreadable: the model stays not found, and shows as a stand-in.
            }
          });
        }),
      );
    },
  };
}
