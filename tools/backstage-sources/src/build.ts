/**
 * WP3.7: builds a Backstage folder from its source lists (`sources/*.json`).
 *
 * For each item: fetch it, pinned (`fetch.ts`); write it to `models/<id>.<glb|vrm>`; measure it;
 * map its skeleton onto the joint map (WP3.3), using a VRM's own bone table where it has one;
 * and write its `backstage.json` item with the licence, credit line and source from the list.
 * Then draw every item's sketches (`@storystage/make-sketches`, WP10.5), and write
 * `provenance.json` (what was fetched, with SHA-256s) and `sources-report.md` for the reviewer.
 *
 * Items in `backstage.json` that no source list names are left alone. Models are not simplified
 * here: that is WP3c (3.9).
 */
import { mkdir, readdir, readFile, writeFile } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { dirname, join } from 'node:path';
import {
  MANIFEST_VERSION,
  mapSkeleton,
  skeletonOf,
  validateManifest,
  type BackstageItem,
  type BackstageManifest,
} from '@storystage/backstage';
import { makeSketches, type MakeReport } from '@storystage/make-sketches';
import { meshFromModel, readModel } from '@storystage/sketches';
import { backstageId, type JointName } from '@storystage/story-api';
import { fetchModel, httpFetch, type Fetcher } from './fetch.ts';
import { validateSources, type SourceItem } from './sources.ts';

export interface Provenance {
  readonly source: string;
  readonly fetched: readonly { readonly url: string; readonly sha256: string }[];
  readonly retrieved: string;
  /** VRM version for VRM files: 0.x avatars face -Z and must be turned on the stage. */
  readonly vrm: '0' | '1' | null;
  readonly triangles: number;
  readonly textureMaxPx: number;
  readonly skeleton: 'mapped' | 'prop-only' | 'none';
  readonly missingJoints: readonly string[];
}

export interface BuildReport {
  readonly items: number;
  readonly sketches: MakeReport;
  readonly provenance: Readonly<Record<string, Provenance>>;
}

export async function buildSources(
  dir: string,
  options: { readonly fetcher?: Fetcher; readonly today?: string } = {},
): Promise<BuildReport> {
  const fetcher = options.fetcher ?? httpFetch;
  const today = options.today ?? new Date().toISOString().slice(0, 10);
  const lists = (await readdir(join(dir, 'sources'))).filter((f) => f.endsWith('.json')).sort();
  const items: { item: SourceItem; source: string }[] = [];
  for (const file of lists) {
    const checked = validateSources(JSON.parse(await readFile(join(dir, 'sources', file), 'utf8')));
    if (!checked.ok) throw new Error(`sources/${file} is not valid:\n${checked.errors.join('\n')}`);
    for (const item of checked.list.items) items.push({ item, source: checked.list.source });
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

  for (const { item, source } of items) {
    const { bytes, ext, fetched } = await fetchModel(item, fetcher);
    const model = `models/${item.id}.${ext}`;
    await mkdir(dirname(join(dir, model)), { recursive: true });
    await writeFile(join(dir, model), bytes);

    const { doc, vrm } = await readModel(bytes);
    const mesh = await meshFromModel(bytes);
    const skeleton = skeletonOf(item.class);
    const boneNames = (mesh.joints ?? []).map((i) => mesh.nodes![i]!.name);
    const mapping = skeleton && boneNames.length ? mapSkeleton(boneNames, skeleton) : null;
    let triangles = 0;
    for (const m of doc.getRoot().listMeshes())
      for (const p of m.listPrimitives())
        if (p.getMode() === 4)
          triangles += Math.floor(
            (p.getIndices()?.getCount() ?? p.getAttribute('POSITION')?.getCount() ?? 0) / 3,
          );
    const textureMaxPx = Math.max(
      0,
      ...doc
        .getRoot()
        .listTextures()
        .map((t) => Math.max(...(t.getSize() ?? [0, 0]))),
    );

    built.set(item.id, {
      id: backstageId(item.id),
      section: item.section,
      class: item.class,
      displayName: item.displayName,
      themes: item.themes,
      files: { model, thumbnail: `sketches/${item.id}/front.svg` },
      joints:
        mapping && mapping.status === 'mapped' ? (mapping.joints as JointName[]) : 'prop-only',
      defaultSize: { height: height(mesh.positions) },
      licence: item.licence,
      credit: item.credit,
      source: { url: item.page, retrieved: today },
      origin: 'shipped',
      sketches: [],
    });
    provenance[item.id] = {
      source,
      fetched,
      retrieved: today,
      vrm,
      triangles,
      textureMaxPx,
      skeleton: mapping ? mapping.status : 'none',
      missingJoints: mapping ? mapping.missingRequired : [],
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
      return `| \`${i.id}\` | ${i.displayName} | ${i.licence} | ${i.section} | ${p.triangles} | ${p.textureMaxPx || '—'} | ${p.skeleton}${p.missingJoints.length ? ` (missing ${p.missingJoints.join(', ')})` : ''} | ${i.defaultSize.height} m | ${p.vrm ? `VRM ${p.vrm}` : 'glTF'} | ${i.sketches.length} |`;
    });
  return [
    '# Backstage sources: build report',
    '',
    "Written by `tools/backstage-sources` (WP3.7). Before merging, look at each item's sketches (`sketches/<id>/`) for respectful, age-appropriate representation (licence audit, section 1), and at `sketches/touch-up.md`.",
    '',
    '| Item | Name | Licence | Section | Triangles | Largest texture | Skeleton | Height | Format | Sketches |',
    '|---|---|---|---|---|---|---|---|---|---|',
    ...rows,
    '',
    "Triangles and textures are as fetched; WP3c reduces them to the device budget. VRM 0.x avatars face -Z and must be turned by the stage's loader.",
    '',
  ].join('\n');
}
