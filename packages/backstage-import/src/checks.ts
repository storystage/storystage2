/**
 * WP3.11, step 1: what's checked before anything heavy runs (spec 17, section 5; spec 15, section
 * 3.4, threats F8 and F9). Everything here reads headers and JSON only: no geometry is decoded and
 * no picture is drawn until the whole import has passed.
 *
 * - **Which files** can be imported, by name: one `.glb` or `.vrm`; a `.gltf` with its `.bin`
 *   and pictures; an `.obj` with its `.mtl` and pictures. FBX and anything else is refused.
 * - **Sizes:** each file at most `IMPORT_FILE_LIMIT`, which is the host's `FILE_LIMIT`.
 * - **Pictures:** width and height from the header, before decoding: 8,192 pixels on a side and 40
 *   million pixels at most. Only PNG, JPEG and WebP.
 * - **glTF:** any required extension the stage doesn't use refuses the file (`IMPORT_EXTENSIONS`);
 *   each `uri` is embedded data or one of the picked files, by plain name; and the ceilings that
 *   keep the worker safe (`IMPORT_CEILINGS`). A count the JSON claims falsely is caught later, by
 *   the reader, which checks every accessor against its buffer.
 *
 * Problems come back in plain words for the person importing, and never quote the file's own
 * contents, except a file name that is plain and short.
 */

/** The largest file the import reads: the host's `FILE_LIMIT` (512 MiB), checked by a test. */
export const IMPORT_FILE_LIMIT = 512 * 1024 * 1024;

/** The largest picture: on each side, and in all (spec 15, section 3.4). */
export const PICTURE_LIMITS = { side: 8192, pixels: 40_000_000 } as const;

/** Over any of these, a model is refused before it's reduced (spec 17, section 5, step 1). */
export const IMPORT_CEILINGS = {
  triangles: 2_000_000,
  joints: 256,
  nodes: 10_000,
  pictures: 64,
} as const;

/**
 * The glTF extensions a model may *require*: the ones the reader and the stage use. Extensions a
 * model only uses, without requiring them, are dropped on reading, so they never refuse a model.
 */
export const IMPORT_EXTENSIONS = [
  'EXT_meshopt_compression',
  'EXT_texture_webp',
  'KHR_materials_emissive_strength',
  'KHR_materials_unlit',
  'KHR_mesh_quantization',
  'KHR_texture_transform',
] as const;

export type ImportProblemCode =
  | 'noModel'
  | 'severalModels'
  | 'fbx'
  | 'notAModel'
  | 'tooBig'
  | 'damaged'
  | 'missingFile'
  | 'outsideFile'
  | 'remoteFile'
  | 'pictureKind'
  | 'pictureTooBig'
  | 'draco'
  | 'extension'
  | 'tooManyTriangles'
  | 'tooManyJoints'
  | 'tooManyNodes'
  | 'tooManyPictures';

export interface ImportProblem {
  readonly code: ImportProblemCode;
  /** In plain words, for the person importing. */
  readonly message: string;
}

const thousands = (n: number) => n.toLocaleString('en-GB');

/** A name from the picker or a `uri`, quoted only if it's plain, short and printable. */
function quoted(name: string): string {
  return name.length <= 80 && /^[\p{L}\p{N} ._()-]+$/u.test(name) ? ` (${name})` : '';
}

const problem = (code: ImportProblemCode, message: string): ImportProblem => ({ code, message });

// ---- Which files -------------------------------------------------------------------------------

export type ModelKind = 'glb' | 'vrm' | 'gltf' | 'obj';

/** The files picked for one import: the model, and the files it may refer to. */
export interface PickedFiles {
  readonly kind: ModelKind;
  /** The model file's name. */
  readonly model: string;
  /** Every other file picked, by plain name: `.bin`, `.mtl` and pictures. */
  readonly others: readonly string[];
}

const extensionOf = (name: string) => {
  const dot = name.lastIndexOf('.');
  return dot < 0 ? '' : name.slice(dot + 1).toLowerCase();
};

const MODEL_KINDS: Readonly<Record<string, ModelKind>> = {
  glb: 'glb',
  vrm: 'vrm',
  gltf: 'gltf',
  obj: 'obj',
};

/** What may come with a model: a `.gltf`'s buffers, an `.obj`'s materials, and pictures. */
const COMPANIONS = new Set(['bin', 'mtl', 'png', 'jpg', 'jpeg', 'webp']);

/**
 * Sorts the picked files into one model and what comes with it, or says why they can't be
 * imported. Names are as the picker gives them: plain names, never paths.
 */
export function sortPicked(
  names: readonly string[],
):
  | { readonly ok: true; readonly picked: PickedFiles }
  | { readonly ok: false; readonly problem: ImportProblem } {
  const models = names.filter((n) => extensionOf(n) in MODEL_KINDS);
  if (names.some((n) => extensionOf(n) === 'fbx'))
    return {
      ok: false,
      problem: problem(
        'fbx',
        "StoryStage can't open FBX files. The teacher guide shows how to turn one into a .glb file with Blender, which is free.",
      ),
    };
  if (models.length > 1)
    return {
      ok: false,
      problem: problem('severalModels', 'Pick one model at a time, with its own pictures.'),
    };
  const model = models[0];
  if (model === undefined) {
    const odd = names.find((n) => !COMPANIONS.has(extensionOf(n)));
    return {
      ok: false,
      problem: problem(
        odd !== undefined ? 'notAModel' : 'noModel',
        odd !== undefined
          ? `StoryStage can import .glb, .vrm, .gltf and .obj models${quoted(odd)}.`
          : 'Pick a model file too: a .glb, .vrm, .gltf or .obj file.',
      ),
    };
  }
  const kind = MODEL_KINDS[extensionOf(model)]!;
  const others = names.filter((n) => n !== model);
  const odd = others.find((n) => !COMPANIONS.has(extensionOf(n)));
  if (odd !== undefined)
    return {
      ok: false,
      problem: problem(
        'notAModel',
        `Only the model, its .bin or .mtl file and its pictures can be picked together${quoted(odd)}.`,
      ),
    };
  return { ok: true, picked: { kind, model, others } };
}

/** Each file's size, before it's read. */
export function checkSizes(
  files: readonly { readonly name: string; readonly bytes: number }[],
  limit = IMPORT_FILE_LIMIT,
): ImportProblem | null {
  const big = files.find((f) => f.bytes > limit);
  return big
    ? problem(
        'tooBig',
        `This file is too big to import${quoted(big.name)}. The most is ${Math.round(limit / 1024 / 1024)} MB.`,
      )
    : null;
}

// ---- Pictures ----------------------------------------------------------------------------------

export interface PictureSize {
  readonly kind: 'png' | 'jpeg' | 'webp';
  readonly width: number;
  readonly height: number;
}

const u16be = (b: Uint8Array, i: number) => (b[i]! << 8) | b[i + 1]!;
const u16le = (b: Uint8Array, i: number) => b[i]! | (b[i + 1]! << 8);
const u24le = (b: Uint8Array, i: number) => b[i]! | (b[i + 1]! << 8) | (b[i + 2]! << 16);
const u32be = (b: Uint8Array, i: number) =>
  ((b[i]! << 24) >>> 0) + ((b[i + 1]! << 16) | (b[i + 2]! << 8) | b[i + 3]!);
const ascii = (b: Uint8Array, i: number, n: number) => String.fromCharCode(...b.subarray(i, i + n));

/** A picture's kind and size from its header alone, or `null` if it isn't PNG, JPEG or WebP. */
export function pictureSize(b: Uint8Array): PictureSize | null {
  // PNG: the signature, then IHDR first, with the width and height.
  if (b.length >= 24 && u32be(b, 0) === 0x89504e47 && ascii(b, 12, 4) === 'IHDR')
    return { kind: 'png', width: u32be(b, 16), height: u32be(b, 20) };
  // JPEG: walk the markers to the first start-of-frame.
  if (b.length >= 4 && b[0] === 0xff && b[1] === 0xd8) {
    let i = 2;
    while (i + 9 < b.length) {
      if (b[i] !== 0xff) return null;
      const marker = b[i + 1]!;
      if (marker === 0xff) {
        i++;
        continue;
      }
      // Markers with no length.
      if (marker === 0x01 || (marker >= 0xd0 && marker <= 0xd8)) {
        i += 2;
        continue;
      }
      const isFrame =
        marker >= 0xc0 && marker <= 0xcf && marker !== 0xc4 && marker !== 0xc8 && marker !== 0xcc;
      if (isFrame) return { kind: 'jpeg', height: u16be(b, i + 5), width: u16be(b, i + 7) };
      const length = u16be(b, i + 2);
      if (length < 2) return null;
      i += 2 + length;
    }
    return null;
  }
  // WebP: RIFF, WEBP, then a lossy, lossless or extended chunk.
  if (b.length >= 30 && ascii(b, 0, 4) === 'RIFF' && ascii(b, 8, 4) === 'WEBP') {
    const chunk = ascii(b, 12, 4);
    if (chunk === 'VP8 ' && b[23] === 0x9d && b[24] === 0x01 && b[25] === 0x2a)
      return { kind: 'webp', width: u16le(b, 26) & 0x3fff, height: u16le(b, 28) & 0x3fff };
    if (chunk === 'VP8L' && b[20] === 0x2f) {
      const bits = b[21]! | (b[22]! << 8) | (b[23]! << 16) | (b[24]! << 24);
      return { kind: 'webp', width: (bits & 0x3fff) + 1, height: ((bits >>> 14) & 0x3fff) + 1 };
    }
    if (chunk === 'VP8X')
      return { kind: 'webp', width: u24le(b, 24) + 1, height: u24le(b, 27) + 1 };
  }
  return null;
}

/** A picture's header against the limits. */
export function checkPicture(bytes: Uint8Array, name = ''): ImportProblem | null {
  const size = pictureSize(bytes);
  if (!size)
    return problem(
      'pictureKind',
      `One of its pictures isn't a PNG, JPEG or WebP picture${quoted(name)}.`,
    );
  const { width, height } = size;
  if (
    width === 0 ||
    height === 0 ||
    width > PICTURE_LIMITS.side ||
    height > PICTURE_LIMITS.side ||
    width * height > PICTURE_LIMITS.pixels
  )
    return problem(
      'pictureTooBig',
      `One of its pictures is too big (${thousands(width)} by ${thousands(height)} pixels). Pictures can be at most ${thousands(PICTURE_LIMITS.side)} pixels on each side.`,
    );
  return null;
}

// ---- glTF --------------------------------------------------------------------------------------

const DAMAGED = problem('damaged', "This file is damaged, or it isn't a model.");

/**
 * A binary glTF (`.glb` or `.vrm`) split into its JSON and its binary chunk, checking every length
 * against the file before using it.
 */
export function splitGlb(
  b: Uint8Array,
):
  | { readonly ok: true; readonly json: unknown; readonly bin: Uint8Array | null }
  | { readonly ok: false; readonly problem: ImportProblem } {
  const view = new DataView(b.buffer, b.byteOffset, b.byteLength);
  if (b.length < 20 || view.getUint32(0, true) !== 0x46546c67 || view.getUint32(4, true) !== 2)
    return { ok: false, problem: DAMAGED };
  const total = view.getUint32(8, true);
  if (total > b.length) return { ok: false, problem: DAMAGED };
  const jsonLength = view.getUint32(12, true);
  if (view.getUint32(16, true) !== 0x4e4f534a || 20 + jsonLength > total)
    return { ok: false, problem: DAMAGED };
  let json: unknown;
  try {
    json = JSON.parse(
      new TextDecoder('utf-8', { fatal: true }).decode(b.subarray(20, 20 + jsonLength)),
    );
  } catch {
    return { ok: false, problem: DAMAGED };
  }
  let bin: Uint8Array | null = null;
  const at = 20 + jsonLength;
  if (at + 8 <= total) {
    const binLength = view.getUint32(at, true);
    if (view.getUint32(at + 4, true) !== 0x004e4942 || at + 8 + binLength > total)
      return { ok: false, problem: DAMAGED };
    bin = b.subarray(at + 8, at + 8 + binLength);
  }
  return { ok: true, json, bin };
}

type Json = Record<string, unknown>;
const isObject = (v: unknown): v is Json =>
  typeof v === 'object' && v !== null && !Array.isArray(v);
const list = (v: unknown): unknown[] => (Array.isArray(v) ? v : []);
const count = (v: unknown) => (typeof v === 'number' && Number.isInteger(v) && v >= 0 ? v : 0);

/** A `uri` that names one of the picked files: a plain name, perhaps percent-encoded. */
function plainName(uri: string): string | null {
  let name: string;
  try {
    name = decodeURIComponent(uri);
  } catch {
    return null;
  }
  if (name === '' || name === '.' || name === '..') return null;
  return /[/\\:\0]/.test(name) ? null : name;
}

/**
 * The checks on a glTF's JSON (spec 15, section 3.4): its version, required extensions, every
 * `uri`, and the ceilings. `others` are the plain names of the files picked with it.
 */
export function checkGltfJson(json: unknown, others: readonly string[] = []): ImportProblem[] {
  if (!isObject(json) || !isObject(json.asset) || typeof json.asset.version !== 'string')
    return [DAMAGED];
  if (!json.asset.version.startsWith('2.')) return [DAMAGED];
  const problems: ImportProblem[] = [];

  // Required extensions.
  const required = list(json.extensionsRequired).filter((e): e is string => typeof e === 'string');
  if (required.includes('KHR_draco_mesh_compression'))
    problems.push(
      problem(
        'draco',
        "This model is squeezed with Draco compression, which StoryStage can't open. In Blender, export it as .glb again with compression turned off.",
      ),
    );
  const unknown = required.filter(
    (e) =>
      e !== 'KHR_draco_mesh_compression' && !(IMPORT_EXTENSIONS as readonly string[]).includes(e),
  );
  if (unknown.length > 0)
    problems.push(
      problem(
        'extension',
        `This model needs something StoryStage doesn't support${quoted(unknown[0]!)}. In Blender, export it as .glb again.`,
      ),
    );

  // Every uri: embedded data, or a file picked with it (F9).
  const picked = new Set(others);
  for (const owner of [...list(json.buffers), ...list(json.images)]) {
    if (!isObject(owner) || owner.uri === undefined) continue;
    const uri = owner.uri;
    if (typeof uri !== 'string') return [DAMAGED];
    if (uri.startsWith('data:')) continue;
    if (/^[a-z][a-z0-9+.-]*:/i.test(uri)) {
      problems.push(
        problem(
          'remoteFile',
          "This model asks for a file from somewhere else, such as the internet. StoryStage only uses files you pick, so it can't be imported.",
        ),
      );
      continue;
    }
    const name = plainName(uri);
    if (name === null) {
      problems.push(
        problem(
          'outsideFile',
          'This model uses a file from another folder. Put the model and all its files in one folder, and pick them together.',
        ),
      );
      continue;
    }
    if (!picked.has(name))
      problems.push(
        problem(
          'missingFile',
          `This model needs a file you didn't pick${quoted(name)}. Pick it together with the model.`,
        ),
      );
  }

  // Ceilings. Triangles are counted from what each primitive claims; the reader checks the claims.
  const accessors = list(json.accessors);
  const accessorCount = (i: unknown) =>
    typeof i === 'number' && isObject(accessors[i]) ? count(accessors[i]!.count) : 0;
  let triangles = 0;
  for (const mesh of list(json.meshes))
    for (const p of list(isObject(mesh) ? mesh.primitives : undefined)) {
      if (!isObject(p)) continue;
      const mode = p.mode === undefined ? 4 : p.mode;
      const attributes = isObject(p.attributes) ? p.attributes : {};
      const n =
        p.indices !== undefined ? accessorCount(p.indices) : accessorCount(attributes.POSITION);
      if (mode === 4) triangles += Math.floor(n / 3);
      else if (mode === 5 || mode === 6) triangles += Math.max(0, n - 2);
    }
  const joints = new Set<unknown>();
  for (const skin of list(json.skins))
    for (const j of list(isObject(skin) ? skin.joints : undefined)) joints.add(j);
  const nodes = list(json.nodes).length;
  const pictures = list(json.images).length;

  const over = (code: ImportProblemCode, what: string, n: number, most: number): ImportProblem =>
    problem(
      code,
      `This model has too many ${what} to import: ${thousands(n)}, and the most is ${thousands(most)}. Try a simpler version of it.`,
    );
  if (triangles > IMPORT_CEILINGS.triangles)
    problems.push(over('tooManyTriangles', 'triangles', triangles, IMPORT_CEILINGS.triangles));
  if (joints.size > IMPORT_CEILINGS.joints)
    problems.push(
      over('tooManyJoints', 'joints in its skeleton', joints.size, IMPORT_CEILINGS.joints),
    );
  if (nodes > IMPORT_CEILINGS.nodes)
    problems.push(over('tooManyNodes', 'parts', nodes, IMPORT_CEILINGS.nodes));
  if (pictures > IMPORT_CEILINGS.pictures)
    problems.push(over('tooManyPictures', 'pictures', pictures, IMPORT_CEILINGS.pictures));
  return problems;
}
