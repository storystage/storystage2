/**
 * Decision 0049 and spec 03, section 1.3: every class-imported model a production uses travels in
 * its file. `packModels` brings a production's packed models up to date before it's saved:
 * - a class model it has started using is packed, with its record and files, from the class
 *   Backstage;
 * - one it no longer uses is dropped, with its files;
 * - one already packed stays as it is, even if the class Backstage no longer has it, so a film
 *   opened on another device keeps its models.
 *
 * "Uses" means in a scene's set-up, in a scene card's cast, or in a frame's sketches. Shipped
 * models never go in the file.
 *
 * The class Backstage is the host's (`ClassFolders.backstage()`); `ClassModels` is what this needs
 * from it, which the host's `ClassBackstage` fits.
 */
import { validateManifest, MANIFEST_VERSION, type BackstageItem } from '@storystage/backstage';
import {
  SAFE_ID,
  ZIP_LAYOUT,
  type PackedModel,
  type Production,
  type ProductionFiles,
} from '@storystage/production';

/** What packing needs from the class Backstage. The host's `ClassBackstage` fits it. */
export interface ClassModels {
  list(): Promise<
    readonly { readonly id: string; readonly record: unknown; readonly owner?: string }[]
  >;
  read(id: string, path: string): Promise<Uint8Array>;
}

/** Every model id the production uses: set-ups, scene cards and frames' sketches. */
export function modelsUsed(p: Production): Set<string> {
  const used = new Set<string>();
  const add = (ref: unknown) => {
    if (typeof ref === 'string') used.add(ref);
  };
  for (const scene of p.scenes) for (const o of scene.setup.objects) add(o.model);
  for (const card of p.storyboard.cards) for (const m of card.cast) add(m);
  for (const frame of p.frames) for (const s of frame.sketches) add(s.item);
  return used;
}

/** The files a record names: its model, thumbnail and sketches. */
const filesOf = (item: BackstageItem) => [
  item.files.model,
  item.files.thumbnail,
  ...item.sketches.map((s) => s.file),
];

/** A folder under `models/` for an id: safe as a file name, and not one already used. */
export function packFolder(id: string, used: ReadonlySet<string>): string {
  const words = id
    .slice(0, 200)
    .toLowerCase()
    .split(/[^a-z0-9]+/)
    .filter((w) => w !== '' && w !== 'class');
  let base = words.join('-').slice(0, 28);
  while (base.endsWith('-')) base = base.slice(0, -1);
  if (base === '') base = 'model';
  if (!used.has(base)) return base;
  for (let n = 2; ; n++) {
    const folder = `${base}-${n}`;
    if (!used.has(folder)) return folder;
  }
}

export interface Packed {
  readonly production: Production;
  readonly files: ProductionFiles;
  /** Class models the production uses that couldn't be packed: not found, or unreadable. */
  readonly missing: readonly string[];
}

/** An imported model's record, if `record` is one. */
function importedRecord(record: unknown): BackstageItem | null {
  const checked = validateManifest({ manifestVersion: MANIFEST_VERSION, items: [record] });
  if (!checked.ok) return null;
  const item = checked.manifest.items[0]!;
  return item.origin === 'imported' ? item : null;
}

/**
 * The production with its packed models up to date, and the files to save with it. Run before
 * each save; the production it gives is for saving, and opening the file gives it back.
 */
export async function packModels(
  p: Production,
  files: ProductionFiles,
  classModels: ClassModels,
): Promise<Packed> {
  const used = modelsUsed(p);
  // Packed already and still used: kept, with their files.
  const kept = p.manifest.models.filter((m) => used.has(m.item.id));
  const keptIds = new Set<string>(kept.map((m) => m.item.id));
  const folders = new Set(kept.map((m) => m.folder));
  const modelFiles = new Map<string, Uint8Array>();
  for (const { folder, item } of kept)
    for (const file of filesOf(item)) {
      const path = ZIP_LAYOUT.model(folder, file);
      const bytes = files.models.get(path);
      if (bytes) modelFiles.set(path, bytes);
    }

  // Newly used class models: packed from the class Backstage.
  const wanted = [...used].filter((id) => !keptIds.has(id));
  const added: PackedModel[] = [];
  const missing: string[] = [];
  if (wanted.length > 0) {
    const list = await classModels.list();
    const byId = new Map(list.map((m) => [m.id, m.record]));
    for (const id of wanted) {
      if (!byId.has(id)) {
        // A shipped model, or a class one this device doesn't have.
        if (id.startsWith('class/')) missing.push(id);
        continue;
      }
      const item = importedRecord(byId.get(id));
      if (!item || item.id !== id) {
        missing.push(id);
        continue;
      }
      const folder = packFolder(id, folders);
      try {
        const read = await Promise.all(
          filesOf(item).map(async (file) => [file, await classModels.read(id, file)] as const),
        );
        for (const [file, bytes] of read) modelFiles.set(ZIP_LAYOUT.model(folder, file), bytes);
      } catch {
        missing.push(id);
        continue;
      }
      folders.add(folder);
      added.push({ folder, item });
    }
  }

  const models = [...kept, ...added].sort((a, b) => a.folder.localeCompare(b.folder, 'en'));
  if (!models.every((m) => SAFE_ID.test(m.folder))) throw new Error('A model folder is unsafe.');
  return {
    production: { ...p, manifest: { ...p.manifest, models } },
    files: { audio: files.audio, models: modelFiles },
    missing,
  };
}
