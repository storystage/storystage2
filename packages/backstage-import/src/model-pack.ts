/**
 * The model pack (spec 17, section 5; decision 0066): a class's imported models in one file, so a
 * teacher can take them to another device through the system's file picker.
 *
 * - **It's a zip,** read and written by the one archive reader and writer (`@storystage/production`,
 *   spec 15, section 3), with the layout of a production's packed models: `backstage.json` first,
 *   listing each model's folder and record, then each model's files under `models/<folder>/`.
 * - **Opening a pack checks every model as an import** (`buildModel`): the checks, reading,
 *   reduction (only for a model over its budget: one within budget isn't reduced again), the
 *   skeleton, and new sketches and a new thumbnail drawn from the model. The pack's own sketches
 *   and thumbnail are never used: a pack is a file anyone could have made, and the studio shows
 *   sketches. Each record keeps its id, name, section, class, licence, credit and source.
 * - **A model that fails is left out,** with the reason in plain words. So is one whose id the
 *   class Backstage already has: ids are never reused, and it's most likely the same model.
 */
import {
  LICENCES,
  MANIFEST_VERSION,
  validateManifest,
  type BackstageItem,
} from '@storystage/backstage';
import { SAFE_ID, ZIP_LAYOUT, readArchive, readJson } from '@storystage/production';
import type { ImportProblem } from './checks.ts';
import { buildModel, type ImportReport, type ImportTools, type ImportedFile } from './import.ts';
import {
  MODEL_PACK_FORMAT,
  MODEL_PACK_MANIFEST,
  MODEL_PACK_VERSION,
  type ModelPackManifest,
} from './model-pack-file.ts';

/** One model from an opened pack: ready to add to the class Backstage, with its report. */
export interface PackedImport {
  readonly item: BackstageItem;
  readonly files: readonly ImportedFile[];
  readonly report: ImportReport;
}

export type OpenedModelPack =
  | {
      readonly ok: true;
      readonly models: readonly PackedImport[];
      /** Models left out: the name the pack gives, and why, in plain words. */
      readonly leftOut: readonly { readonly name: string; readonly reason: string }[];
    }
  | { readonly ok: false; readonly problem: ImportProblem };

const NOT_A_PACK: ImportProblem = {
  code: 'notAModel',
  message: "This isn't a StoryStage model pack.",
};

const major = (version: string) => Number(version.split('.')[0]);

/** A pack's model folder entry: `models/<folder>/<path>`. */
const MODEL_ENTRY = /^models\/[a-z0-9][a-z0-9-]{0,31}\/[^\\]+$/;

/**
 * Opens a model pack: every model checked as an import. `taken` is the ids the class Backstage
 * has had (live and in the bin): a model with one of them is left out.
 */
export async function openModelPack(
  bytes: Uint8Array,
  tools: ImportTools,
  taken: ReadonlySet<string> = new Set(),
  options: {
    /**
     * Called as each model's checks begin, with its place (from 1) and how many the pack holds:
     * the worker reports it, for the time limit per model and the studio's "Checking model 3 of 12".
     */
    readonly onModel?: (n: number, total: number) => void;
  } = {},
): Promise<OpenedModelPack> {
  const read = readArchive(bytes, {
    wanted: (name) => name === MODEL_PACK_MANIFEST || MODEL_ENTRY.test(name),
  });
  if (!read.ok) return { ok: false, problem: { code: 'damaged', message: read.problem.message } };
  const manifestBytes = read.entries.get(MODEL_PACK_MANIFEST);
  if (!manifestBytes) return { ok: false, problem: NOT_A_PACK };
  const parsed = readJson(manifestBytes);
  if (!parsed.ok) return { ok: false, problem: NOT_A_PACK };
  const manifest = parsed.value as Partial<ModelPackManifest> | null;
  if (
    typeof manifest !== 'object' ||
    manifest === null ||
    manifest.format !== MODEL_PACK_FORMAT ||
    typeof manifest.formatVersion !== 'string' ||
    !Array.isArray(manifest.models)
  )
    return { ok: false, problem: NOT_A_PACK };
  if (!(major(manifest.formatVersion) <= major(MODEL_PACK_VERSION)))
    return {
      ok: false,
      problem: {
        code: 'notAModel',
        message: 'This model pack was made with a newer StoryStage. Update StoryStage to open it.',
      },
    };

  const models: PackedImport[] = [];
  const leftOut: { name: string; reason: string }[] = [];
  const seen = new Set<string>();
  const total = manifest.models.length;
  for (const [index, entry] of (manifest.models as readonly unknown[]).entries()) {
    options.onModel?.(index + 1, total);
    const folder = (entry as { folder?: unknown } | null)?.folder;
    const record = (entry as { item?: unknown } | null)?.item;
    const name =
      typeof (record as { displayName?: unknown } | null)?.displayName === 'string'
        ? (record as { displayName: string }).displayName.slice(0, 80)
        : 'A model';
    const leave = (reason: string) => leftOut.push({ name, reason });

    const checked = validateManifest({ manifestVersion: MANIFEST_VERSION, items: [record] });
    if (typeof folder !== 'string' || !SAFE_ID.test(folder) || !checked.ok) {
      leave('Its record in the pack is damaged.');
      continue;
    }
    const item = checked.manifest.items[0]!;
    if (
      item.origin !== 'imported' ||
      !item.id.startsWith('class/') ||
      item.licence === 'permission' ||
      !LICENCES.includes(item.licence)
    ) {
      leave("It isn't a class's imported model.");
      continue;
    }
    if (taken.has(item.id) || seen.has(item.id)) {
      leave("This class's Backstage already has it.");
      continue;
    }
    const model = read.entries.get(ZIP_LAYOUT.model(folder, item.files.model));
    if (!model || !item.files.model.endsWith('.glb')) {
      leave('Its model file is missing from the pack.');
      continue;
    }

    const built = await buildModel(
      new Map([['model.glb', model]]),
      {
        id: item.id,
        section: item.section,
        class: item.class,
        name: item.displayName,
        ...(item.description !== undefined ? { description: item.description } : {}),
        themes: item.themes,
        licence: {
          licence: item.licence,
          credit: item.credit,
          ...(item.source !== undefined ? { source: item.source } : {}),
        },
        reduce: 'overBudget',
      },
      tools,
    ).catch(() => null);
    if (!built || !built.ok) {
      leave(
        built && 'problems' in built
          ? built.problems.map((p) => p.message).join(' ')
          : "It couldn't be checked.",
      );
      continue;
    }
    seen.add(item.id);
    models.push({ item: built.item, files: built.files, report: built.report });
  }
  return { ok: true, models, leftOut };
}
