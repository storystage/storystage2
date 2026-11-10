/**
 * Writing a model pack (spec 17, section 5; decision 0066): the class's own imported models in one
 * file, `<class name> models.storystage-models`, for another device. Kept apart from opening one
 * (`model-pack.ts`, which checks every model as an import, in the worker), so the studio can
 * write a pack on the page: this file loads only `@storystage/backstage`,
 * `@storystage/production` and `pack.ts`. It's exported from `@storystage/backstage-import/pack`.
 */
import { MANIFEST_VERSION, validateManifest, type BackstageItem } from '@storystage/backstage';
import { ZIP_LAYOUT, stableJson, writeArchive, type PackedModel } from '@storystage/production';
import type { ImportedFile } from './import.ts';
import { packFolder, type ClassModels } from './pack.ts';

/** A model pack's file extension. */
export const MODEL_PACK_EXTENSION = '.storystage-models';

/** The pack's own name and version, in `backstage.json`. */
export const MODEL_PACK_FORMAT = 'storystage-models';
export const MODEL_PACK_VERSION = '1.0.0';
/** The pack's manifest, the first entry. */
export const MODEL_PACK_MANIFEST = 'backstage.json';

/** `backstage.json` in a model pack. */
export interface ModelPackManifest {
  readonly format: typeof MODEL_PACK_FORMAT;
  readonly formatVersion: string;
  readonly models: readonly PackedModel[];
}

/** One model to pack: its record, and the files it names, at their paths. */
export interface PackModel {
  readonly item: BackstageItem;
  readonly files: readonly ImportedFile[];
}

/** The files a record names. */
const filesOf = (item: BackstageItem) => [
  item.files.model,
  item.files.thumbnail,
  ...item.sketches.map((s) => s.file),
];

/** A model pack's bytes. Every file each record names must be given. */
export function writeModelPack(models: readonly PackModel[]): Uint8Array {
  const folders = new Set<string>();
  const packed: PackedModel[] = [];
  const entries: { name: string; bytes: Uint8Array }[] = [];
  for (const { item, files } of models) {
    const folder = packFolder(item.id, folders);
    folders.add(folder);
    packed.push({ folder, item });
    for (const file of filesOf(item)) {
      const found = files.find((f) => f.path === file);
      if (!found) throw new Error(`${item.id} names ${file}, which wasn't given.`);
      entries.push({ name: ZIP_LAYOUT.model(folder, file), bytes: found.bytes });
    }
  }
  const manifest: ModelPackManifest = {
    format: MODEL_PACK_FORMAT,
    formatVersion: MODEL_PACK_VERSION,
    models: packed,
  };
  entries.sort((a, b) => (a.name < b.name ? -1 : a.name > b.name ? 1 : 0));
  return writeArchive([
    { name: MODEL_PACK_MANIFEST, bytes: new TextEncoder().encode(stableJson(manifest)) },
    ...entries,
  ]);
}

/**
 * The class's own models, packed: those that belong to the class, not a pupil's own imports
 * (decision 0066). A model whose files can't be read is left out and named in `leftOut`.
 */
export async function modelPackFromClass(
  classModels: ClassModels,
): Promise<{ readonly pack: Uint8Array; readonly leftOut: readonly string[] }> {
  const models: PackModel[] = [];
  const leftOut: string[] = [];
  for (const stored of await classModels.list()) {
    if (stored.owner !== undefined && stored.owner !== 'class') continue;
    const checked = validateManifest({ manifestVersion: MANIFEST_VERSION, items: [stored.record] });
    if (!checked.ok) {
      leftOut.push(stored.id);
      continue;
    }
    const item = checked.manifest.items[0]!;
    try {
      const files = await Promise.all(
        filesOf(item).map(async (path) => ({
          path,
          bytes: await classModels.read(stored.id, path),
        })),
      );
      models.push({ item, files });
    } catch {
      leftOut.push(stored.id);
    }
  }
  return { pack: writeModelPack(models), leftOut };
}
