/**
 * WP3.7: builds a Backstage folder from its source lists (`sources/*.json`).
 *
 * For each item: fetch it, pinned (`fetch.ts`); write it to `models/<id>.<glb|vrm>`, and its
 * colour thumbnail to `thumbnails/<id>.webp` (`renderThumbnail`, WP3c); measure it;
 * map its skeleton onto the joint map (WP3.3), using a VRM's own bone table where it has one;
 * and write its `backstage.json` item with the licence, credit line and source from the list.
 * Then draw every item's sketches (`@storystage/make-sketches`, WP10.5), and write
 * `provenance.json` (what was fetched, with SHA-256s), `prompter-catalogue.txt` (the Prompter's
 * catalogue, WP3c) and `sources-report.md` for the reviewer.
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
import { WebIO, type Document } from '@gltf-transform/core';
import { ALL_EXTENSIONS } from '@gltf-transform/extensions';
import {
  CATALOGUE_TOKEN_BUDGET,
  MANIFEST_VERSION,
  budgetFor,
  catalogueText,
  catalogueTokens,
  creditFor,
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
import {
  meshFromDocument,
  meshFromModel,
  readModel,
  renderThumbnail,
  type ImageDecoder,
} from '@storystage/sketches';
import { backstageId, type JointName } from '@storystage/story-api';
import { groundTile, hexToRgb, rgbToHex, skyDome } from './backdrops.ts';
import { fetchModel, fetchPicture, httpFetch, type Fetcher, type Fetched } from './fetch.ts';
import { applyExcludes, type Exclude } from './exclude.ts';
import { sharpDecoder, sharpEncoder, thumbnailWebp } from './sharp-encoder.ts';
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
  /**
   * A backdrop's colours (spec 17 section 2), as `rrggbb`: a ground's average as fetched and as
   * shipped, matched to its `look`; a sky's horizon (its atmosphere colour) and a suggested
   * lighting, for the stage's tables.
   */
  readonly backdrop?:
    | { readonly look: string; readonly before: string; readonly after: string }
    | {
        readonly horizon: string;
        readonly lighting: { readonly above: string; readonly below: string };
      };
}

export interface BuildReport {
  readonly items: number;
  readonly sketches: MakeReport;
  readonly provenance: Readonly<Record<string, Provenance>>;
  /** The Prompter catalogue's estimated size (`prompter-catalogue.txt`). */
  readonly catalogueTokens: number;
}

export async function buildSources(
  dir: string,
  options: {
    readonly fetcher?: Fetcher;
    readonly today?: string;
    readonly only?: string;
    readonly encodeTexture?: TextureEncoder;
    readonly decodeImage?: ImageDecoder;
  } = {},
): Promise<BuildReport> {
  const fetcher = options.fetcher ?? httpFetch;
  const encodeTexture = options.encodeTexture ?? sharpEncoder;
  const decodeImage = options.decodeImage ?? sharpDecoder;
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
    // A backdrop is made here from its picture (spec 17 section 2); anything else is fetched.
    const made = item.backdrop ? await makeBackdrop(item, fetcher, io) : null;
    const got: Fetched = made ?? (await fetchModel(item, fetcher, dir));
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
      if (item.turn !== undefined) turnModel(doc, item.turn);
      if (item.height !== undefined) scaleToHeight(doc, item.height);
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
    // Its colour picture for Backstage's browse views (spec 17, section 7a).
    const thumbnail = `thumbnails/${item.id}.webp`;
    await mkdir(dirname(join(dir, thumbnail)), { recursive: true });
    // A backdrop's is its own picture: a flat tile seen from the front would show nothing.
    await writeFile(
      join(dir, thumbnail),
      made ? made.thumbnail : await thumbnailWebp(await renderThumbnail(mesh, { decodeImage })),
    );

    built.set(item.id, {
      id: backstageId(item.id),
      section: item.section,
      class: item.class,
      displayName: item.displayName,
      themes: item.themes,
      ...(item.description ? { description: item.description } : {}),
      files: { model, thumbnail },
      ...(vrm ? { vrm } : {}),
      joints:
        mapping && mapping.status === 'mapped' ? (mapping.joints as JointName[]) : 'prop-only',
      defaultSize: { height: height(mesh.positions) },
      budget: { triangles, textureMaxPx },
      licence: item.licence,
      // A changed CC BY model says so (owner, 8 Nov 2026); VRM files are kept as they are.
      credit: creditFor(item, ext === 'glb'),
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
      ...(made ? { backdrop: made.colours } : {}),
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
  // The Prompter's catalogue (spec 17, section 4a), written out so the reviewer reads exactly
  // what Claude will. The build stops before writing anything if it is over its budget.
  const catalogue = catalogueText(manifest);
  const tokens = catalogueTokens(catalogue);
  if (tokens > CATALOGUE_TOKEN_BUDGET)
    throw new Error(
      `The Prompter's catalogue would be about ${tokens} tokens, over its budget of ${CATALOGUE_TOKEN_BUDGET} (spec 04, section 2.1). Shorten descriptions or themes, or raise it with the owner.`,
    );
  await writeFile(manifestPath, `${JSON.stringify(manifest, null, 2)}\n`);
  await writeFile(join(dir, 'prompter-catalogue.txt'), catalogue);
  const ordered = Object.fromEntries(
    Object.entries(provenance).sort(([a], [b]) => a.localeCompare(b, 'en')),
  );
  await writeFile(provenancePath, `${JSON.stringify(ordered, null, 2)}\n`);

  const sketches = await makeSketches(dir);
  await writeFile(
    join(dir, 'sources-report.md'),
    report(sketches.manifest.items, ordered, built, tokens),
  );
  return { items: built.size, sketches, provenance: ordered, catalogueTokens: tokens };
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

/** Puts a scene's nodes under one new root node, made by `make`. */
function wrapScene(doc: Document, make: () => ReturnType<Document['createNode']>): void {
  const root = doc.getRoot();
  const scene = root.getDefaultScene() ?? root.listScenes()[0];
  if (!scene) return;
  const node = make();
  for (const child of scene.listChildren()) {
    scene.removeChild(child);
    node.addChild(child);
  }
  scene.addChild(node);
}

/**
 * Turns a model by quarter turns, `x` first, then `y` (both in degrees), under one new root
 * node, so it faces +Z and stands up as every Backstage model does (spec 17, section 1).
 */
export function turnModel(doc: Document, turn: { readonly x?: number; readonly y?: number }): void {
  const x = ((turn.x ?? 0) * Math.PI) / 180;
  const y = ((turn.y ?? 0) * Math.PI) / 180;
  if (x === 0 && y === 0) return;
  // q = qy · qx: about X first, then about Y.
  const [sx, cx, sy, cy] = [Math.sin(x / 2), Math.cos(x / 2), Math.sin(y / 2), Math.cos(y / 2)];
  const q: [number, number, number, number] = [cy * sx, sy * cx, -sy * sx, cy * cx];
  wrapScene(doc, () => doc.createNode('storystage-turn').setRotation(q));
}

/**
 * Scales a model so its height (its extent along Y) is `metres`: its scene's nodes go under one
 * new root node with that scale, so nothing inside, skin or animation, needs to change.
 */
export function scaleToHeight(doc: Document, metres: number): void {
  const now = height(meshFromDocument(doc).positions);
  const k = metres / now;
  if (!Number.isFinite(k) || Math.abs(k - 1) < 1e-6) return;
  wrapScene(doc, () => doc.createNode('storystage-size').setScale([k, k, k]));
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

/** A backdrop item's model, made from its picture, with its thumbnail and colours. */
async function makeBackdrop(
  item: SourceItem,
  fetcher: Fetcher,
  io: WebIO,
): Promise<Fetched & { thumbnail: Uint8Array; colours: NonNullable<Provenance['backdrop']> }> {
  const picture = await fetchPicture(item, fetcher);
  const b = item.backdrop!;
  if (b.kind === 'ground') {
    const tile = await groundTile(picture.bytes, b.tile, hexToRgb(b.look));
    return {
      bytes: await io.writeBinary(tile.doc),
      ext: 'glb',
      fetched: picture.fetched,
      thumbnail: tile.thumbnail,
      colours: { look: b.look, before: rgbToHex(tile.before), after: rgbToHex(tile.after) },
    };
  }
  const dome = await skyDome(picture.bytes, {
    ...(b.exposure !== undefined ? { exposure: b.exposure } : {}),
    ...(b.tint !== undefined ? { tint: hexToRgb(b.tint) } : {}),
    ...(b.ahead !== undefined ? { ahead: b.ahead } : {}),
  });
  return {
    bytes: await io.writeBinary(dome.doc),
    ext: 'glb',
    fetched: picture.fetched,
    thumbnail: dome.thumbnail,
    colours: {
      horizon: rgbToHex(dome.horizon),
      lighting: { above: rgbToHex(dome.lighting.above), below: rgbToHex(dome.lighting.below) },
    },
  };
}

/** The backdrops' colours, for the reviewer and for the stage's tables (spec 17 section 2). */
function backdropRows(
  built: ReadonlyMap<string, BackstageItem>,
  provenance: Readonly<Record<string, Provenance>>,
): string[] {
  const grounds: string[] = [];
  const skies: string[] = [];
  for (const id of [...built.keys()].sort()) {
    const c = provenance[id]?.backdrop;
    if (!c) continue;
    if ('look' in c) grounds.push(`| \`${id}\` | #${c.look} | #${c.before} | #${c.after} |`);
    else skies.push(`| \`${id}\` | #${c.horizon} | #${c.lighting.above} | #${c.lighting.below} |`);
  }
  return [
    ...(grounds.length
      ? [
          '',
          "**Grounds:** each picture matched to the stage's flat colour (spec 17 section 2: within 10% on each channel).",
          '',
          '| Ground | Stage colour | Fetched average | Shipped average |',
          '|---|---|---|---|',
          ...grounds,
        ]
      : []),
    ...(skies.length
      ? [
          '',
          "**Picture skies:** for the stage's `SKIES` and lighting tables (S3). The lighting is a suggestion.",
          '',
          '| Sky | Horizon (atmosphere) | Light from above | Light from below |',
          '|---|---|---|---|',
          ...skies,
        ]
      : []),
  ];
}

function report(
  items: readonly BackstageItem[],
  provenance: Readonly<Record<string, Provenance>>,
  built: ReadonlyMap<string, BackstageItem>,
  tokens: number,
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
    ...backdropRows(built, provenance),
    '',
    `**Prompter catalogue:** about ${tokens.toLocaleString('en-GB')} of ${CATALOGUE_TOKEN_BUDGET.toLocaleString('en-GB')} tokens. \`prompter-catalogue.txt\` is exactly what Claude reads; check its descriptions with the sketches.`,
    '',
  ].join('\n');
}
