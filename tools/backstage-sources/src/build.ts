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
import { createHash } from 'node:crypto';
import { existsSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { WebIO, type Document } from '@gltf-transform/core';
import { ALL_EXTENSIONS } from '@gltf-transform/extensions';
import {
  CATALOGUE_INDEX_TOKEN_BUDGET,
  MANIFEST_VERSION,
  budgetFor,
  catalogueData,
  catalogueJson,
  catalogueText,
  catalogueTokens,
  renderIndex,
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
import { addJoints } from './add-joints.ts';
import { standardClips } from './clips.ts';
import { alignGlb } from './glb-align.ts';
import {
  meshFromDocument,
  meshFromModel,
  readModel,
  renderThumbnail,
  THUMBNAIL_VIEWS,
  type ImageDecoder,
} from '@storystage/sketches';
import { backstageId, type JointName } from '@storystage/story-api';
import { groundTile, hexToRgb, rgbToHex, skyDome } from './backdrops.ts';
import { fetchModel, fetchPicture, httpFetch, type Fetcher, type Fetched } from './fetch.ts';
import { applyExcludes, type Exclude } from './exclude.ts';
import { applyKitbash } from './kitbash.ts';
import {
  sharpDecoder,
  sharpEncoder,
  sharpPainter,
  sharpPicturePacker,
  thumbnailWebp,
} from './sharp-encoder.ts';
import { undraco } from './draco.ts';
import { coverTextures } from './cover.ts';
import { makeGlobe } from './globe.ts';
import { packVrmTextures, type PicturePacker } from './vrm-textures.ts';
import { excludesFor, stageLook, validateSources, type SourceItem } from './sources.ts';

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
  /** The estimated size of the index the Prompter's system prompt holds (`renderIndex`). */
  readonly catalogueTokens: number;
  /** The estimated size of every full line (`prompter-catalogue.txt`), for the report. */
  readonly fullCatalogueTokens: number;
}

export async function buildSources(
  dir: string,
  options: {
    readonly fetcher?: Fetcher;
    readonly today?: string;
    readonly only?: string;
    readonly encodeTexture?: TextureEncoder;
    /** Fits a VRM's pictures to the budget, as WebP where smaller (sharp by default). */
    readonly packPicture?: PicturePacker;
    readonly decodeImage?: ImageDecoder;
  } = {},
): Promise<BuildReport> {
  const fetcher = options.fetcher ?? httpFetch;
  const encodeTexture = options.encodeTexture ?? sharpEncoder;
  const packPicture = options.packPicture ?? sharpPicturePacker;
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
    const fetchedModel: Fetched =
      made ??
      (item.globe ? await globeModel(item, fetcher, io) : await fetchModel(item, fetcher, dir));
    // A character made from parts (`kitbash.ts`): its other parts come from the same commit, and
    // each is recorded with what was fetched.
    const assembled: Fetched = item.kitbash
      ? await kitbash(item, fetchedModel, fetcher)
      : fetchedModel;
    // A binary glTF's JSON chunk padded to 4 bytes, as the format requires (some VRMs leave it),
    // and a glTF's Draco meshes decoded (NASA's models), as nothing after this reads Draco.
    const aligned = alignGlb(assembled.bytes);
    const got = {
      ...assembled,
      bytes: assembled.ext === 'glb' ? await undraco(aligned) : aligned,
    } as Fetched;
    const { ext, fetched } = got;
    // VRM files are kept byte for byte, but for that padding; excludes apply to glTF models only.
    const trimmed =
      ext === 'glb'
        ? await applyExcludes(got.bytes, exclude)
        : { bytes: got.bytes, removed: { nodes: [], animations: [] } };
    const budget = budgetFor(item);
    let bytes = trimmed.bytes;
    let fetchedSize: Budget;
    // A VRM whose pictures were packed is changed, so a licence asking it says so.
    let vrmChanged = false;
    if (ext === 'glb') {
      const doc = await io.readBinary(bytes);
      stripExtras(doc);
      // NASA's insignia painted out of the shipped copy (`cover.ts`).
      if (item.cover) await coverTextures(doc, item.cover, sharpPainter);
      if (item.addJoints) addJoints(doc, item.addJoints);
      if (item.bones) renameBones(doc, item.bones);
      if (item.clips) standardClips(doc, item.clips);
      // A hopper never walks with a clip of its own (manifest 2.4.0; S3's review of #573).
      if (
        item.gait &&
        doc
          .getRoot()
          .listAnimations()
          .some((a) => a.getName() === 'walk')
      )
        throw new Error(`${item.id}: a gait is for an animal with no walk clip; its file has one.`);
      // A model whose bones its source list maps keeps every node, so no named joint is lost.
      const reduced = await reduceModel(doc, budget, {
        encodeTexture,
        keepLeaves: item.bones !== undefined,
      });
      if (item.turn !== undefined) turnModel(doc, item.turn);
      if (item.height !== undefined) scaleToHeight(doc, item.height);
      // Everything stands on the ground, the stage placing it by its origin; a backdrop's ground
      // and sky are made to sit where they do (the owner's choice for props and sets, 20 Nov).
      if (item.section !== 'backdrops') standOnGround(doc);
      fetchedSize = reduced.before;
      bytes = await io.writeBinary(doc);
    } else {
      const { doc } = await readModel(bytes);
      fetchedSize = { triangles: countTriangles(doc), textureMaxPx: largestTexture(doc) };
      // Kept as it is but for its pictures, fitted to the budget (owner, 19 Nov 2026) and WebP
      // where that's smaller (owner, 23 Nov 2026).
      const packed = await packVrmTextures(bytes, budget.textureMaxPx, packPicture);
      bytes = packed.bytes;
      vrmChanged = packed.changed > 0;
    }
    const model = `models/${item.id}.${ext}`;
    await mkdir(dirname(join(dir, model)), { recursive: true });
    await writeFile(join(dir, model), bytes);

    const { doc, vrm } = await readModel(bytes);
    const mesh = await meshFromModel(bytes);
    const skeleton = skeletonOf(item.class);
    const skinned = (mesh.joints ?? []).map((i) => mesh.nodes![i]!.name);
    // The joints its source list names, too, wherever they are: a model whose parts hang on its
    // bones, with no skin (Styloo's ladybird, whose wing cases are separate meshes), has no skin
    // joints once its unused skin is pruned, but the stage moves its parts by those nodes.
    const present = new Set(
      doc
        .getRoot()
        .listNodes()
        .map((n) => n.getName()),
    );
    const named = Object.values(item.bones ?? {}).filter(
      (n) => present.has(n) && !skinned.includes(n),
    );
    const boneNames = [...skinned, ...named];
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
      made
        ? made.thumbnail
        : await thumbnailWebp(
            await renderThumbnail(mesh, { decodeImage, ...THUMBNAIL_VIEWS[item.section] }),
          ),
    );

    built.set(item.id, {
      id: backstageId(item.id),
      section: item.section,
      class: item.class,
      displayName: item.displayName,
      themes: item.themes,
      ...(item.description ? { description: item.description } : {}),
      ...(item.gait ? { gait: item.gait } : {}),
      files: { model, thumbnail },
      ...(vrm ? { vrm } : {}),
      joints:
        mapping && mapping.status === 'mapped' ? (mapping.joints as JointName[]) : 'prop-only',
      defaultSize: { height: height(mesh.positions) },
      budget: { triangles, textureMaxPx },
      licence: item.licence,
      ...(item.publicDomain ? { publicDomain: item.publicDomain } : {}),
      // A changed CC BY model says so (owner, 8 Nov 2026); VRM files are kept as they are.
      credit: creditFor(item, ext === 'glb' || vrmChanged),
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
  // The Prompter's catalogue (spec 17, section 4a): the JSON the Prompter reads, and every full
  // line for the reviewer. The build stops before writing anything if the index the system
  // prompt holds is over its budget.
  const catalogue = catalogueText(manifest);
  const tokens = catalogueTokens(renderIndex(catalogueData(manifest)));
  const fullTokens = catalogueTokens(catalogue);
  if (tokens > CATALOGUE_INDEX_TOKEN_BUDGET)
    throw new Error(
      `The Prompter's catalogue index would be about ${tokens} tokens, over its budget of ${CATALOGUE_INDEX_TOKEN_BUDGET} (spec 04, section 2.7). Shorten display names, or raise it with the owner.`,
    );
  await writeFile(manifestPath, `${JSON.stringify(manifest, null, 2)}\n`);
  await writeFile(join(dir, 'prompter-catalogue.txt'), catalogue);
  await writeFile(join(dir, 'prompter-catalogue.json'), catalogueJson(manifest));
  const ordered = Object.fromEntries(
    Object.entries(provenance).sort(([a], [b]) => a.localeCompare(b, 'en')),
  );
  await writeFile(provenancePath, `${JSON.stringify(ordered, null, 2)}\n`);

  const sketches = await makeSketches(dir);
  await writeFile(
    join(dir, 'sources-report.md'),
    report(sketches.manifest.items, ordered, built, tokens, fullTokens),
  );
  return {
    items: built.size,
    sketches,
    provenance: ordered,
    catalogueTokens: tokens,
    fullCatalogueTokens: fullTokens,
  };
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
  // By the height as measured, not as rounded for the manifest: Poly Haven's rat, 3.4 cm tall
  // and asked for 8, came out 9 when it was scaled by 8 / 3.
  const now = span(meshFromDocument(doc).positions);
  const k = metres / now;
  if (!Number.isFinite(k) || Math.abs(k - 1) < 1e-6) return;
  wrapScene(doc, () => doc.createNode('storystage-size').setScale([k, k, k]));
}

/**
 * Stands a model on the ground: moves it, under one new root node, so the lowest point of its rest
 * pose as a renderer draws it (a skinned mesh by its joints) is at y = 0. The stage stands an
 * object by its origin (S3, 19 Nov 2026), and some makers put theirs mid-body: the African
 * penguin's was 0.48 m above its feet, so it stood sunk to its head. Props and sets too (the
 * owner's choice, 20 Nov): Poly Pizza's house stood sunk by 2.66 m, its bench to its seat.
 *
 * Across and front to back, it's centred only where its origin is near or outside its edge
 * (outside the middle 80% of its width or length), so a turn doesn't swing it round a point
 * outside it (the same penguin's body was all behind its beak; the Scottish Maritime Museum's snow
 * goggles were 11.7 m from theirs; Poly Pizza's furniture has its origin at a corner). A model
 * whose origin is within, if off-centre because of a long tail or trunk, keeps it.
 */
export function standOnGround(doc: Document): void {
  const positions = meshFromDocument(doc).positions;
  const lo = [Infinity, Infinity, Infinity];
  const hi = [-Infinity, -Infinity, -Infinity];
  for (let i = 0; i < positions.length; i += 3)
    for (let a = 0; a < 3; a++) {
      lo[a] = Math.min(lo[a]!, positions[i + a]!);
      hi[a] = Math.max(hi[a]!, positions[i + a]!);
    }
  if (!Number.isFinite(lo[1]!)) return;
  const shift = [0, -lo[1]!, 0];
  for (const a of [0, 2]) {
    const margin = 0.1 * (hi[a]! - lo[a]!);
    if (lo[a]! + margin > 0 || hi[a]! - margin < 0) shift[a] = -(lo[a]! + hi[a]!) / 2;
  }
  if (shift.every((s) => Math.abs(s) < 1e-4)) return;
  wrapScene(doc, () =>
    doc.createNode('storystage-ground').setTranslation(shift as [number, number, number]),
  );
}

/** Height in metres at scale 1: the model's extent along Y. */
/** From the lowest point to the highest, in metres; 0 for a flat or empty model. */
function span(positions: Float32Array): number {
  let lo = Infinity;
  let hi = -Infinity;
  for (let i = 1; i < positions.length; i += 3) {
    lo = Math.min(lo, positions[i]!);
    hi = Math.max(hi, positions[i]!);
  }
  return hi > lo ? hi - lo : 0;
}

/** The manifest's height: the span to the centimetre, at least 1 cm, or 1 m for a flat model. */
function height(positions: Float32Array): number {
  const h = span(positions);
  return h > 0 ? Math.max(0.01, Math.round(h * 100) / 100) : 1;
}

const MIME: Readonly<Record<string, string>> = {
  jpg: 'image/jpeg',
  png: 'image/png',
  webp: 'image/webp',
};
const mimeOf = (path: string) => MIME[path.slice(path.lastIndexOf('.') + 1)] ?? 'image/jpeg';

/** A globe item's model (`globe.ts`), made from its picture and its ring's, both recorded. */
async function globeModel(item: SourceItem, fetcher: Fetcher, io: WebIO): Promise<Fetched> {
  const picture = await fetchPicture(item, fetcher);
  const f = item.fetch as { github: string; commit: string; path: string };
  const globe = item.globe!;
  let ring: { bytes: Uint8Array; mimeType: string } | undefined;
  const fetched = [...picture.fetched];
  if (globe.ring) {
    const url =
      `https://raw.githubusercontent.com/${f.github}/${f.commit}/` +
      globe.ring.path.split('/').map(encodeURIComponent).join('/');
    const bytes = await fetcher(url);
    fetched.push({ url, sha256: createHash('sha256').update(bytes).digest('hex') });
    ring = { bytes, mimeType: mimeOf(globe.ring.path) };
  }
  const doc = makeGlobe(
    item.displayName,
    { bytes: picture.bytes, mimeType: mimeOf(f.path) },
    globe,
    ring,
  );
  return { bytes: await io.writeBinary(doc), ext: 'glb', fetched };
}

/** A backdrop item's model, made from its picture, with its thumbnail and colours. */
/** Applies an item's `kitbash` recipe to its fetched base, fetching parts from the same commit. */
async function kitbash(item: SourceItem, base: Fetched, fetcher: Fetcher): Promise<Fetched> {
  const f = item.fetch;
  if (!('github' in f)) throw new Error(`${item.id}: kitbash needs a base fetched from GitHub.`);
  const fetched = [...base.fetched];
  const bytes = await applyKitbash(base.bytes, item.kitbash!, async (path) => {
    const url =
      `https://raw.githubusercontent.com/${f.github}/${f.commit}/` +
      path.split('/').map(encodeURIComponent).join('/');
    const part = await fetcher(url);
    fetched.push({ url, sha256: createHash('sha256').update(part).digest('hex') });
    return part;
  });
  return { bytes, ext: 'glb', fetched };
}

async function makeBackdrop(
  item: SourceItem,
  fetcher: Fetcher,
  io: WebIO,
): Promise<Fetched & { thumbnail: Uint8Array; colours: NonNullable<Provenance['backdrop']> }> {
  const picture = await fetchPicture(item, fetcher);
  const b = item.backdrop!;
  if (b.kind === 'ground') {
    // Validated: the stage has this ground, and a look the list gives agrees with it.
    const look = b.look ?? stageLook(item.id)!;
    const tile = await groundTile(picture.bytes, b.tile, hexToRgb(look));
    return {
      bytes: await io.writeBinary(tile.doc),
      ext: 'glb',
      fetched: picture.fetched,
      thumbnail: tile.thumbnail,
      colours: { look, before: rgbToHex(tile.before), after: rgbToHex(tile.after) },
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
  fullTokens: number,
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
    `**Prompter catalogue:** the index in its system prompt is about ${tokens.toLocaleString('en-GB')} of ${CATALOGUE_INDEX_TOKEN_BUDGET.toLocaleString('en-GB')} tokens; every full line, which requests carry a few at a time, about ${fullTokens.toLocaleString('en-GB')}. \`prompter-catalogue.txt\` holds every full line exactly as Claude reads it; check its descriptions with the sketches.`,
    '',
  ].join('\n');
}

/**
 * Clears every `extras` a maker left in a model, on the file, its asset record and each part.
 * Nothing in StoryStage reads them, and a maker may put anything there: Gobkit's carry its
 * marketing, including a line promoting AI tools, which the owner chose to strip (20 Nov 2026).
 * Credit is the source list's, so nothing is lost.
 */
export function stripExtras(doc: Document): void {
  const root = doc.getRoot();
  delete (root.getAsset() as { extras?: unknown }).extras;
  root.setExtras({});
  const parts = [
    root.listScenes(),
    root.listNodes(),
    root.listMeshes(),
    root.listMeshes().flatMap((m) => m.listPrimitives()),
    root.listMaterials(),
    root.listTextures(),
    root.listAnimations(),
    root.listSkins(),
    root.listAccessors(),
    root.listCameras(),
    root.listBuffers(),
  ];
  for (const list of parts) for (const part of list) part.setExtras({});
}

/** Renames a model's own bones to our joint ids (a source-list item's `bones`); a name not found throws. */
export function renameBones(doc: Document, bones: Readonly<Record<string, string>>): void {
  const nodes = doc.getRoot().listNodes();
  for (const [bone, joint] of Object.entries(bones)) {
    const found = nodes.filter((n) => n.getName() === bone);
    if (found.length !== 1)
      throw new Error(`bones: the model has ${found.length} nodes called "${bone}", not one.`);
    found[0]!.setName(joint);
  }
}
