/**
 * WP3.7: builds a Backstage folder from its source lists (`sources/*.json`).
 *
 * For each item: fetch it, pinned (`fetch.ts`); write it to `models/<id>.<glb|vrm>`; measure it;
 * map its skeleton onto the joint map (WP3.3), using a VRM's own bone table where it has one;
 * and write its `backstage.json` item with the licence, credit line and source from the list.
 * Then draw every item's sketches (`@storystage/make-sketches`, WP10.5), and write
 * `provenance.json` (what was fetched, with SHA-256s) and `sources-report.md` for the reviewer.
 *
 * Every glTF model is reduced to its section's device budget on the way in (WP3.9,
 * `@storystage/backstage/optimize`), its textures shrunk to WebP with sharp. VRM files are kept
 * byte for byte, so they are measured but not reduced; the report flags any over budget.
 *
 * Items in `backstage.json` that no source list names are left alone.
 */
import { mkdir, readdir, readFile, writeFile } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { WebIO } from '@gltf-transform/core';
import { ALL_EXTENSIONS } from '@gltf-transform/extensions';
import {
  MANIFEST_VERSION,
  budgetFor,
  mapSkeleton,
  skeletonOf,
  validateManifest,
  type BackstageItem,
  type BackstageManifest,
  type Budget,
} from '@storystage/backstage';
import {
  countTriangles,
  largestTexture,
  reduceModel,
  type TextureEncoder,
} from '@storystage/backstage/optimize';
import { makeSketches, type MakeReport } from '@storystage/make-sketches';
import { meshFromModel, readModel } from '@storystage/sketches';
import { backstageId, type JointName } from '@storystage/story-api';
import { fetchModel, httpFetch, type Fetcher } from './fetch.ts';
import { applyExcludes, type Exclude } from './exclude.ts';
import { sharpEncoder } from './sharp-encoder.ts';
import { excludesFor, validateSources, type SourceItem } from './sources.ts';

export interface Provenance {
  readonly source: string;
  readonly fetched: readonly { readonly url: string; readonly sha256: string }[];
  readonly retrieved: string;
  /** VRM version for VRM files: 0.x avatars face -Z and must be turned on the stage. */
  readonly vrm: '0' | '1' | null;
  /** As shipped, after any reduction. */
  readonly triangles: number;
  readonly textureMaxPx: number;
  /** As fetched, before any reduction. */
  readonly fetchedSize: Budget;
  /** Whether it fits its section's budget (a VRM file may not: it isn't reduced). */
  readonly fitsBudget: boolean;
  readonly skeleton: 'mapped' | 'prop-only' | 'none';
  readonly missingJoints: readonly string[];
  /** What the list's `exclude` removed. */
  readonly excluded: { readonly nodes: readonly string[]; readonly animations: readonly string[] };
}

export interface BuildReport {
  readonly items: number;
  readonly sketches: MakeReport;
  readonly provenance: Readonly<Record<string, Provenance>>;
}

export async function buildSources(
  dir: string,
  options: {
    readonly fetcher?: Fetcher;
    readonly today?: string;
    readonly only?: string;
    readonly encodeTexture?: TextureEncoder;
  } = {},
): Promise<BuildReport> {
  const fetcher = options.fetcher ?? httpFetch;
  const encodeTexture = options.encodeTexture ?? sharpEncoder;
  const io = new WebIO().registerExtensions(ALL_EXTENSIONS);
  const today = options.today ?? new Date().toISOString().slice(0, 10);
  const lists = (await readdir(join(dir, 'sources'))).filter((f) => f.endsWith('.json')).sort();
  const items: { item: SourceItem; source: string; exclude: Exclude }[] = [];
  for (const file of lists) {
    const checked = validateSources(JSON.parse(await readFile(join(dir, 'sources', file), 'utf8')));
    if (!checked.ok) throw new Error(`sources/${file} is not valid:\n${checked.errors.join('\n')}`);
    if (options.only && checked.list.source !== options.only) continue;
    for (const item of checked.list.items)
      items.push({ item, source: checked.list.source, exclude: excludesFor(checked.list, item) });
  }

  const manifestPath = join(dir, 'backstage.json');
  const old: BackstageManifest = existsSync(manifestPath)
    ? JSON.parse(await readFile(manifestPath, 'utf8'))
    : { manifestVersion: MANIFEST_VERSION, items: [] };
  const provenancePath = join(dir, 'provenance.json');
  const provenance: Record<string, Provenance> = existsSync(provenancePath)
    ? JSON.parse(await readFile(provenancePath, 'utf8'))
    : {};
  const built = new Map<string, BackstageItem>();

  for (const { item, source, exclude } of items) {
    const got = await fetchModel(item, fetcher, dir);
    const { ext, fetched } = got;
    // VRM files are kept byte for byte; excludes apply to glTF models only.
    const trimmed =
      ext === 'glb'
        ? await applyExcludes(got.bytes, exclude)
        : { bytes: got.bytes, removed: { nodes: [], animations: [] } };
    const budget = budgetFor(item);
    let bytes = trimmed.bytes;
    let fetchedSize: Budget;
    if (ext === 'glb') {
      const doc = await io.readBinary(bytes);
      const reduced = await reduceModel(doc, budget, { encodeTexture });
      fetchedSize = reduced.before;
      bytes = await io.writeBinary(doc);
    } else {
      const { doc } = await readModel(bytes);
      fetchedSize = { triangles: countTriangles(doc), textureMaxPx: largestTexture(doc) };
    }
    const model = `models/${item.id}.${ext}`;
    await mkdir(dirname(join(dir, model)), { recursive: true });
    await writeFile(join(dir, model), bytes);

    const { doc, vrm } = await readModel(bytes);
    const mesh = await meshFromModel(bytes);
    const skeleton = skeletonOf(item.class);
    const boneNames = (mesh.joints ?? []).map((i) => mesh.nodes![i]!.name);
    const mapping = skeleton && boneNames.length ? mapSkeleton(boneNames, skeleton) : null;
    const triangles = countTriangles(doc);
    const textureMaxPx = largestTexture(doc);
    const fitsBudget = triangles <= budget.triangles && textureMaxPx <= budget.textureMaxPx;
    // A kept model (`fetch.ts`) is rebuilt from what we shipped: what was first fetched, when,
    // and how big it was then all stay as the first build recorded them.
    const first = fetched[0]?.url.startsWith('kept:') ? provenance[item.id] : undefined;
    const retrieved = first?.retrieved ?? today;

    built.set(item.id, {
      id: backstageId(item.id),
      section: item.section,
      class: item.class,
      displayName: item.displayName,
      themes: item.themes,
      files: { model, thumbnail: `sketches/${item.id}/front.svg` },
      ...(vrm ? { vrm } : {}),
      joints:
        mapping && mapping.status === 'mapped' ? (mapping.joints as JointName[]) : 'prop-only',
      defaultSize: { height: height(mesh.positions) },
      budget: { triangles, textureMaxPx },
      licence: item.licence,
      credit: item.credit,
      source: { url: item.page, retrieved },
      origin: 'shipped',
      sketches: [],
    });
    provenance[item.id] = {
      source,
      fetched: first?.fetched ?? fetched,
      retrieved,
      vrm,
      triangles,
      textureMaxPx,
      // Builds before budgets (WP3.9) didn't record it; then the kept model is as first fetched.
      fetchedSize: first?.fetchedSize ?? fetchedSize,
      fitsBudget,
      skeleton: mapping ? mapping.status : 'none',
      missingJoints: mapping ? mapping.missingRequired : [],
      excluded: first?.excluded ?? trimmed.removed,
    };
  }

  const kept = old.items.filter((i) => !built.has(i.id));
  const manifest: BackstageManifest = {
    manifestVersion: MANIFEST_VERSION,
    items: [...kept, ...built.values()].sort((a, b) => a.id.localeCompare(b.id, 'en')),
  };
  const checked = validateManifest(manifest);
  if (!checked.ok)
    throw new Error(`The built manifest is not valid:\n${checked.errors.join('\n')}`);
  await writeFile(manifestPath, `${JSON.stringify(manifest, null, 2)}\n`);
  const ordered = Object.fromEntries(
    Object.entries(provenance).sort(([a], [b]) => a.localeCompare(b, 'en')),
  );
  await writeFile(provenancePath, `${JSON.stringify(ordered, null, 2)}\n`);

  const sketches = await makeSketches(dir);
  await writeFile(join(dir, 'sources-report.md'), report(sketches.manifest.items, ordered, built));
  return { items: built.size, sketches, provenance: ordered };
}

const removedText = (p: Provenance) =>
  [
    p.excluded.nodes.length ? `${p.excluded.nodes.length} parts` : '',
    p.excluded.animations.length ? `${p.excluded.animations.length} clips` : '',
  ]
    .filter(Boolean)
    .join(', ') || '—';

/** "47216 → 19998" when the build changed it, else the one number; "" for nothing. */
const sizeText = (fetched: number, shipped: number) =>
  fetched === shipped ? (shipped ? `${shipped}` : '') : `${fetched} → ${shipped}`;

/** Height in metres at scale 1: the model's extent along Y. */
function height(positions: Float32Array): number {
  let lo = Infinity;
  let hi = -Infinity;
  for (let i = 1; i < positions.length; i += 3) {
    lo = Math.min(lo, positions[i]!);
    hi = Math.max(hi, positions[i]!);
  }
  return hi > lo ? Math.max(0.01, Math.round((hi - lo) * 100) / 100) : 1;
}

function report(
  items: readonly BackstageItem[],
  provenance: Readonly<Record<string, Provenance>>,
  built: ReadonlyMap<string, BackstageItem>,
): string {
  const rows = items
    .filter((i) => built.has(i.id))
    .map((i) => {
      const p = provenance[i.id]!;
      return `| \`${i.id}\` | ${i.displayName} | ${i.licence} | ${i.section} | ${sizeText(p.fetchedSize.triangles, p.triangles)} | ${sizeText(p.fetchedSize.textureMaxPx, p.textureMaxPx) || '—'} | ${p.fitsBudget ? 'yes' : '**no**'} | ${p.skeleton}${p.missingJoints.length ? ` (missing ${p.missingJoints.join(', ')})` : ''} | ${i.defaultSize.height} m | ${p.vrm ? `VRM ${p.vrm}` : 'glTF'} | ${removedText(p)} | ${i.sketches.length} |`;
    });
  return [
    '# Backstage sources: build report',
    '',
    "Written by `tools/backstage-sources` (WP3.7). Before merging, look at each item's sketches (`sketches/<id>/`) for respectful, age-appropriate representation (licence audit, section 1), and at `sketches/touch-up.md`.",
    '',
    '| Item | Name | Licence | Section | Triangles | Largest texture | Fits budget | Skeleton | Height | Format | Removed | Sketches |',
    '|---|---|---|---|---|---|---|---|---|---|---|---|',
    ...rows,
    '',
    "Triangles and textures show fetched → shipped where the build reduced them to the section's budget (`ITEM_BUDGETS`, provisional until the reference devices have run). VRM files are kept byte for byte, so they aren't reduced. VRM 0.x avatars face -Z and must be turned by the stage's loader.",
    '',
  ].join('\n');
}
