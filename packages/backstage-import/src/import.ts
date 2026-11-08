/**
 * WP3.11: `importModel`, the import pipeline (spec 17, section 5; decision 0066). It takes the
 * files a person picked and what they said about the model, and gives back the Backstage record,
 * its files and a report in plain words, or why it can't be imported. It's pure: the caller shows
 * the report, and on Save adds the record and files to the class Backstage
 * (`ClassFolders.backstage().add`).
 *
 * The steps:
 * 1. **Read and check, before anything heavy** (`checks.ts`): which files, their sizes, the glTF's
 *    JSON (extensions, every `uri`, the ceilings), and every picture's size from its header.
 * 2. **Read the model.** An OBJ with our own reader (`obj.ts`). A VRM avatar has its bones named
 *    from its own VRM table, as the sketch reader does; a VRM 0.x avatar is turned to face +Z in
 *    the file itself. What's saved is an ordinary glTF facing +Z, with no `vrm` field.
 * 3. **Reduce it to its section's budget** with `reduceModel`, the same code the shipped build
 *    uses. Pictures are shrunk by the caller's encoder: WebP, or PNG where WebP can't be made.
 * 4. **Map its skeleton** for a class that has one. Without the required joints, it's prop only.
 * 5. **Draw its sketches and thumbnail.**
 * 6. **Make its record:** an id unique in the class Backstage, the person's choices, the licence,
 *    credit and source (`licence.ts`), `origin: "imported"`, its measured budget and height.
 * 7. **The report.**
 *
 * The browser's parts (the picture encoder and decoder, and the worker that runs this with a
 * time limit) are the caller's, so this runs the same in tests.
 */
import { WebIO, type Accessor, type Document } from '@gltf-transform/core';
import { ALL_EXTENSIONS } from '@gltf-transform/extensions';
import { MeshoptDecoder } from 'meshoptimizer';
import {
  DESCRIPTION_MAX,
  ITEM_BUDGETS,
  MANIFEST_VERSION,
  jointWord,
  jointsOf,
  mapSkeleton,
  mayDistribute,
  skeletonOf,
  validateManifest,
  type BackstageItem,
  type Section,
} from '@storystage/backstage';
import { countTriangles, reduceModel, type TextureEncoder } from '@storystage/backstage/optimize';
import {
  makeItemSketches,
  meshFromDocument,
  renderThumbnail,
  type ImageDecoder,
  type Picture,
  type SketchMesh,
} from '@storystage/sketches';
import { backstageId, type JointName, type StoryClass } from '@storystage/story-api';
import {
  IMPORT_CEILINGS,
  checkGltfJson,
  checkPicture,
  checkSizes,
  sortPicked,
  splitGlb,
  type ImportProblem,
} from './checks.ts';
import { licenceRecord, type LicenceAnswers, type LicenceProblem } from './licence.ts';
import { readObj } from './obj.ts';

/** What the person chose about the model, on the import's steps. */
export interface ImportChoices {
  readonly section: Section;
  readonly class: StoryClass;
  /** The name learners see ("Robot"). */
  readonly name: string;
  /** What it looks like, in one plain line. Optional. */
  readonly description?: string;
  readonly themes?: readonly string[];
  readonly licence: LicenceAnswers;
}

/** The browser's parts, passed in (spec 17, section 5, steps 3 and 5). */
export interface ImportTools {
  /** Shrinks a picture to the budget: WebP, or PNG where WebP can't be made. */
  readonly encodeTexture: TextureEncoder;
  /** Decodes pictures for the thumbnail. Without one, the thumbnail shows plain colours. */
  readonly decodeImage?: ImageDecoder;
  /** Encodes the thumbnail: WebP, or PNG where WebP can't be made. */
  readonly encodeThumbnail: (
    picture: Picture,
  ) => Promise<{ readonly bytes: Uint8Array; readonly mimeType: 'image/webp' | 'image/png' }>;
}

/** One of the import's files, at its path relative to the item, as the record names it. */
export interface ImportedFile {
  readonly path: string;
  readonly bytes: Uint8Array;
}

export interface ImportReport {
  /** Each line in plain words, in the order to show them. */
  readonly lines: readonly string[];
  readonly triangles: { readonly before: number; readonly after: number };
  readonly textureMaxPx: { readonly before: number; readonly after: number };
  /** For a class with a skeleton: how many of its joints were found, and whether it can move. */
  readonly skeleton: {
    readonly mapped: number;
    readonly of: number;
    readonly status: 'mapped' | 'prop-only';
  } | null;
  /** Why films using it stay in school (CC BY-NC and "not sure"), or `null`. */
  readonly staysInClass: string | null;
}

export type ImportResult =
  | {
      readonly ok: true;
      readonly item: BackstageItem;
      readonly files: readonly ImportedFile[];
      readonly report: ImportReport;
    }
  | { readonly ok: false; readonly problems: readonly ImportProblem[] }
  | { readonly ok: false; readonly licence: readonly LicenceProblem[] };

const thousands = (n: number) => n.toLocaleString('en-GB');
const fail = (...problems: ImportProblem[]): ImportResult => ({ ok: false, problems });
const DAMAGED: ImportProblem = {
  code: 'damaged',
  message: "This file is damaged, or it isn't a model.",
};

/**
 * The record's id: `class/<Class>/<name>`, from its name, not one in `taken`. Ids in the class
 * Backstage are never reused (decision 0066), so `taken` is every id it has had that the caller
 * knows: live and in the bin.
 */
export function classModelId(cls: StoryClass, name: string, taken: ReadonlySet<string>): string {
  // The name's words, joined by hyphens. Split into words and joined, rather than trimmed with
  // anchored patterns, so no name can make the matching slow (CodeQL, js/polynomial-redos).
  const words = name
    .slice(0, 200)
    .normalize('NFKD')
    .replace(/\p{M}/gu, '')
    .toLowerCase()
    .split(/[^a-z0-9]+/)
    .filter((w) => w !== '');
  let slug = words.join('-').slice(0, 40);
  while (slug.endsWith('-')) slug = slug.slice(0, -1);
  if (slug === '') slug = 'model';
  const base = `class/${cls}/${slug}`;
  if (!taken.has(base)) return base;
  for (let n = 2; ; n++) if (!taken.has(`${base}-${n}`)) return `${base}-${n}`;
}

/** Every standard extension the reader knows, except Draco, which is refused before reading. */
const EXTENSIONS = ALL_EXTENSIONS.filter((e) => e.EXTENSION_NAME !== 'KHR_draco_mesh_compression');

async function reader(): Promise<WebIO> {
  await MeshoptDecoder.ready;
  return new WebIO()
    .registerExtensions(EXTENSIONS)
    .registerDependencies({ 'meshopt.decoder': MeshoptDecoder });
}

interface VrmJson {
  readonly extensions?: {
    readonly VRM?: {
      readonly humanoid?: { readonly humanBones?: readonly { bone: string; node: number }[] };
    };
    readonly VRMC_vrm?: {
      readonly humanoid?: { readonly humanBones?: Readonly<Record<string, { node: number }>> };
    };
  };
}

/** A VRM's bones by node, and its version, from its JSON. */
function vrmBones(json: unknown): { version: '0' | '1' | null; bones: Map<number, string> } {
  const ext = (json as VrmJson).extensions;
  const bones = new Map<number, string>();
  if (ext?.VRMC_vrm) {
    for (const [bone, value] of Object.entries(ext.VRMC_vrm.humanoid?.humanBones ?? {}))
      if (typeof value?.node === 'number') bones.set(value.node, bone);
    return { version: '1', bones };
  }
  if (ext?.VRM) {
    for (const b of ext.VRM.humanoid?.humanBones ?? [])
      if (typeof b?.node === 'number' && typeof b.bone === 'string') bones.set(b.node, b.bone);
    return { version: '0', bones };
  }
  return { version: null, bones };
}

/** Turns a VRM 0.x avatar to face +Z, in the file itself, under one new root node. */
function faceFront(doc: Document): void {
  const root = doc.getRoot();
  const scene = root.getDefaultScene() ?? root.listScenes()[0];
  if (!scene) return;
  const turn = doc.createNode('storystage-face-plus-z').setRotation([0, 1, 0, 0]);
  for (const child of scene.listChildren()) {
    scene.removeChild(child);
    turn.addChild(child);
  }
  scene.addChild(turn);
}

/** Height in metres at scale 1: the model's extent along Y, as the shipped build measures it. */
function heightOf(positions: Float32Array): number {
  let lo = Infinity;
  let hi = -Infinity;
  for (let i = 1; i < positions.length; i += 3) {
    lo = Math.min(lo, positions[i]!);
    hi = Math.max(hi, positions[i]!);
  }
  return hi > lo ? Math.max(0.01, Math.round((hi - lo) * 100) / 100) : 1;
}

/** Every accessor's data, checked to be whole: a count the JSON claims falsely is caught here. */
function wholeAccessors(doc: Document): boolean {
  return doc
    .getRoot()
    .listAccessors()
    .every((a: Accessor) => {
      const array = a.getArray();
      return array !== null && array.length >= a.getCount() * a.getElementSize();
    });
}

/** Steps 1 and 2: the picked files, checked and read into one glTF document. */
async function readPicked(
  files: ReadonlyMap<string, Uint8Array>,
): Promise<
  | { ok: true; doc: Document; vrm: '0' | '1' | null; leftOut: readonly string[] }
  | { ok: false; problems: ImportProblem[] }
> {
  const sorted = sortPicked([...files.keys()]);
  if (!sorted.ok) return { ok: false, problems: [sorted.problem] };
  const sizes = checkSizes([...files].map(([name, b]) => ({ name, bytes: b.length })));
  if (sizes) return { ok: false, problems: [sizes] };
  const { kind, model, others } = sorted.picked;
  const bytes = files.get(model)!;

  if (kind === 'obj') {
    const read = readObj(bytes, files);
    if (!read.ok) return { ok: false, problems: [read.problem] };
    return { ok: true, doc: read.result.document, vrm: null, leftOut: read.result.leftOut };
  }

  let json: unknown;
  const resources: Record<string, Uint8Array<ArrayBuffer>> = {};
  if (kind === 'gltf') {
    try {
      json = JSON.parse(new TextDecoder('utf-8', { fatal: true }).decode(bytes));
    } catch {
      return { ok: false, problems: [DAMAGED] };
    }
  } else {
    const split = splitGlb(bytes);
    if (!split.ok) return { ok: false, problems: [split.problem] };
    json = split.json;
  }
  const problems = checkGltfJson(json, others);
  if (problems.length > 0) return { ok: false, problems };
  if (kind === 'gltf') {
    // Every uri is embedded data or a picked file by plain name (checked above): hand the reader
    // the picked files under the uris the JSON uses, so it never fetches anything.
    const j = json as { buffers?: { uri?: string }[]; images?: { uri?: string }[] };
    for (const owner of [...(j.buffers ?? []), ...(j.images ?? [])]) {
      const uri = owner.uri;
      if (uri === undefined || uri.startsWith('data:')) continue;
      resources[uri] = files.get(decodeURIComponent(uri))!.slice();
    }
  }

  const { version, bones } = vrmBones(json);
  const io = await reader();
  let doc: Document;
  try {
    doc =
      kind === 'gltf'
        ? await io.readJSON({ json: json as never, resources })
        : await io.readBinary(bytes);
  } catch {
    return { ok: false, problems: [DAMAGED] };
  }
  if (!wholeAccessors(doc)) return { ok: false, problems: [DAMAGED] };
  if (bones.size > 0) {
    const nodes = doc.getRoot().listNodes();
    for (const [i, bone] of bones) nodes[i]?.setName(bone);
  }
  if (version === '0') faceFront(doc);
  return { ok: true, doc, vrm: version, leftOut: [] };
}

/** Pictures in the model itself (embedded, or in a `.glb`'s binary chunk), from their headers. */
function checkEmbeddedPictures(doc: Document): ImportProblem | null {
  for (const texture of doc.getRoot().listTextures()) {
    const image = texture.getImage();
    if (!image) continue;
    const problem = checkPicture(image);
    if (problem) return problem;
  }
  return null;
}

/** The plain-words sentence for a skeleton that isn't complete. */
function missingWords(skeleton: Parameters<typeof jointWord>[0], missing: readonly JointName[]) {
  const words = missing.slice(0, 3).map((j) => jointWord(skeleton, j));
  const more = missing.length > 3 ? ` and ${missing.length - 3} more` : '';
  return `${words.join(', ')}${more}`;
}

/**
 * Imports a model: `files` are the picked files by plain name; `taken` the ids the class
 * Backstage has had (live and in the bin).
 */
export async function importModel(
  files: ReadonlyMap<string, Uint8Array>,
  choices: ImportChoices,
  tools: ImportTools,
  taken: ReadonlySet<string> = new Set(),
): Promise<ImportResult> {
  // The licence first: it needs nothing heavy, and the person can fix it straight away.
  const licence = licenceRecord(choices.name, choices.licence);
  if (!licence.ok) return { ok: false, licence: licence.problems };

  const read = await readPicked(files);
  if (!read.ok) return fail(...read.problems);
  const { doc, vrm, leftOut } = read;
  const embedded = checkEmbeddedPictures(doc);
  if (embedded) return fail(embedded);
  // The claims in the JSON were checked in step 1; this is what the file really holds.
  if (countTriangles(doc) > IMPORT_CEILINGS.triangles)
    return fail({
      code: 'tooManyTriangles',
      message: `This model has too many triangles to import: more than ${thousands(IMPORT_CEILINGS.triangles)}. Try a simpler version of it.`,
    });

  // Step 3: reduce it to its section's budget.
  const budget = ITEM_BUDGETS[choices.section];
  let reduced;
  try {
    reduced = await reduceModel(doc, budget, { encodeTexture: tools.encodeTexture });
  } catch {
    return fail(DAMAGED);
  }
  if (!reduced.fits)
    return fail({
      code: 'tooManyTriangles',
      message:
        reduced.after.triangles > budget.triangles
          ? `Even simplified, this model is too detailed for StoryStage: ${thousands(reduced.after.triangles)} triangles, and this section allows ${thousands(budget.triangles)}. Try a simpler version of it.`
          : `This model's pictures couldn't be made small enough for StoryStage. Try again, or try a simpler version of it.`,
    });

  // Step 4: its skeleton.
  let mesh: SketchMesh;
  try {
    mesh = meshFromDocument(doc);
  } catch {
    return fail(DAMAGED);
  }
  if (mesh.positions.length === 0)
    return fail({ code: 'damaged', message: 'This file has no shapes in it to import.' });
  const skeleton = skeletonOf(choices.class);
  const boneNames = (mesh.joints ?? []).map((i) => mesh.nodes![i]!.name);
  const mapping = skeleton && boneNames.length > 0 ? mapSkeleton(boneNames, skeleton) : null;
  const joints: BackstageItem['joints'] =
    mapping && mapping.status === 'mapped' ? (mapping.joints as JointName[]) : 'prop-only';

  // Step 6 (its id and the parts of the record the sketches need), then step 5.
  const id = backstageId(classModelId(choices.class, choices.name, taken));
  const displayName = choices.name.replace(/\s+/g, ' ').trim();
  const themes = [...new Set((choices.themes ?? []).map((t) => t.trim()).filter(Boolean))];
  const sketches = makeItemSketches({ id, section: choices.section, displayName, themes }, mesh);
  const thumbnailPicture = await renderThumbnail(mesh, {
    ...(tools.decodeImage ? { decodeImage: tools.decodeImage } : {}),
  });
  const thumbnail = await tools.encodeThumbnail(thumbnailPicture);
  const thumbnailPath = `thumbnail.${thumbnail.mimeType === 'image/webp' ? 'webp' : 'png'}`;

  // Sketch files sit beside the model: `sketches/<facing>[-<pose>].svg`.
  const sketchPath = (file: string) => `sketches/${file.split('/').pop()!}`;
  const encoder = new TextEncoder();
  const model = await (await reader()).writeBinary(doc);

  const description = choices.description?.replace(/\s+/g, ' ').trim();
  const item: BackstageItem = {
    id,
    section: choices.section,
    class: choices.class,
    displayName,
    themes,
    ...(description ? { description: description.slice(0, DESCRIPTION_MAX) } : {}),
    files: { model: 'model.glb', thumbnail: thumbnailPath },
    joints,
    defaultSize: { height: heightOf(mesh.positions) },
    budget: reduced.after,
    ...licence.record,
    origin: 'imported',
    sketches: sketches.map((s) => ({
      facing: s.facing,
      ...(s.pose ? { pose: s.pose } : {}),
      file: sketchPath(s.file),
    })),
  };
  const checked = validateManifest({ manifestVersion: MANIFEST_VERSION, items: [item] });
  if (!checked.ok) return fail(DAMAGED);

  // Step 7: the report.
  const lines: string[] = [];
  const { before, after } = reduced;
  lines.push(
    before.triangles > after.triangles
      ? `Simplified from ${thousands(before.triangles)} to ${thousands(after.triangles)} triangles.`
      : `${thousands(after.triangles)} triangles: no simplifying needed.`,
  );
  if (before.textureMaxPx > after.textureMaxPx)
    lines.push(
      `Pictures made smaller, from ${thousands(before.textureMaxPx)} to ${thousands(after.textureMaxPx)} pixels across.`,
    );
  if (vrm === '0') lines.push('Turned round to face the front, as StoryStage models do.');
  let skeletonReport: ImportReport['skeleton'] = null;
  if (skeleton) {
    const of = jointsOf(skeleton).length;
    const found = mapping ? Object.keys(mapping.bones).length : 0;
    const status = mapping?.status ?? 'prop-only';
    skeletonReport = { mapped: Math.min(found, of), of, status };
    if (status === 'mapped')
      lines.push(
        `Skeleton mapped: ${Math.min(found, of)} of ${of} joints, so it can walk and gesture.`,
      );
    else
      lines.push(
        mapping
          ? `Prop only: it can move and turn, but not walk or gesture. Its skeleton has no ${missingWords(skeleton, mapping.missingRequired)}.`
          : 'Prop only: it has no skeleton, so it can move and turn, but not walk or gesture.',
      );
  }
  lines.push(`It's ${item.defaultSize.height} metres tall.`);
  if (leftOut.length > 0) lines.push(`Left out of the file: ${leftOut.join(', ')}.`);
  lines.push(`Credit: "${item.credit}".`);
  const distribute = mayDistribute(item);
  const staysInClass = distribute.allowed ? null : distribute.reason;
  if (staysInClass) lines.push(staysInClass);

  const files_: ImportedFile[] = [
    { path: item.files.model, bytes: model },
    { path: thumbnailPath, bytes: thumbnail.bytes },
    ...sketches.map((s) => ({ path: sketchPath(s.file), bytes: encoder.encode(s.svg) })),
  ];
  return {
    ok: true,
    item,
    files: files_,
    report: {
      lines,
      triangles: { before: before.triangles, after: after.triangles },
      textureMaxPx: { before: before.textureMaxPx, after: after.textureMaxPx },
      skeleton: skeletonReport,
      staysInClass,
    },
  };
}
