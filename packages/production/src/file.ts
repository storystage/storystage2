/**
 * WP8.4: saving and opening a `.storystage` file (`docs/spec/03-production-format.md`, section 1;
 * `docs/spec/15-security.md`, section 3).
 *
 * Saving gives the same bytes for the same production: entries in the order section 1 lists and
 * then by name, JSON with its keys sorted, the script as Fountain, and the archive writer's fixed
 * dates. Opening reads only the entries the format names, through the one archive reader, checks
 * every part's shape and then every reference before anything loads, and decides on the versions:
 * a newer file opens read-only, an older one is migrated and its original handed back to be kept.
 *
 * Both are pure: bytes in and bytes out. Where the bytes live (a pupil's folder, the system's file
 * picker) is the host's (`@storystage/host`, decision 0065).
 */
import {
  compareVersions,
  openProgram,
  serializeProgram,
  type OpenOptions,
  type Program,
} from '@storystage/ast';
import { readArchive, readJson, writeArchive, type ArchiveEntry } from './archive.ts';
import { readFountain, writeFountain, type FountainProblem } from './fountain.ts';
import {
  FORMAT_VERSION,
  SAFE_ID,
  ZIP_LAYOUT,
  checkReferences,
  lineId,
  sceneId,
  type Frame,
  type Production,
  type ProductionManifest,
  type Scene,
  type Storyboard,
} from './types.ts';
import {
  checkFrameShape,
  checkManifestShape,
  checkSceneShape,
  checkStoryboardShape,
} from './validate.ts';

/** Files a production carries besides its JSON and script, by their path inside the file. */
export interface ProductionFiles {
  /** Learner-recorded lines and narration, by `audio/<file>`. */
  readonly audio: ReadonlyMap<string, Uint8Array>;
  /**
   * Each packed model's files (model, thumbnail, sketches), by `models/<folder>/<path>`. They
   * are untrusted: each is checked as an import before it reaches the stage (spec 03, 1.3).
   */
  readonly models: ReadonlyMap<string, Uint8Array>;
}

const NO_FILES: ProductionFiles = { audio: new Map(), models: new Map() };

/** Saving refused: the production is broken, which is a bug, so `problems` are for developers. */
export class SaveRefused extends Error {
  readonly problems: readonly string[];
  constructor(problems: readonly string[]) {
    super(`This production can't be saved: ${problems[0]}`);
    this.name = 'SaveRefused';
    this.problems = problems;
  }
}

/** JSON with every object's keys sorted, so the same value always gives the same text. */
export function stableJson(value: unknown): string {
  const sort = (v: unknown): unknown => {
    if (Array.isArray(v)) return v.map(sort);
    if (typeof v !== 'object' || v === null) return v;
    const o = v as Record<string, unknown>;
    return Object.fromEntries(
      Object.keys(o)
        .filter((k) => o[k] !== undefined)
        .sort()
        .map((k) => [k, sort(o[k])]),
    );
  };
  return JSON.stringify(sort(value));
}

const text = (s: string) => new TextEncoder().encode(s);
const byName = (a: ArchiveEntry, b: ArchiveEntry) =>
  a.name < b.name ? -1 : a.name > b.name ? 1 : 0;

/** The paths of a packed model's files: its model, thumbnail and sketches. */
function packedPaths(manifest: ProductionManifest): string[] {
  return manifest.models.flatMap(({ folder, item }) =>
    [item.files.model, item.files.thumbnail, ...item.sketches.map((s) => s.file)].map((file) =>
      ZIP_LAYOUT.model(folder, file),
    ),
  );
}

/**
 * The production as a `.storystage` file. Refuses (`SaveRefused`) a production whose references
 * are broken, or whose audio or packed model files aren't all in `files`, so a saved file always
 * opens.
 */
export function saveProduction(p: Production, files: ProductionFiles = NO_FILES): Uint8Array {
  const problems = checkReferences(p);
  const audio = p.manifest.audio.map((a) => `${ZIP_LAYOUT.audio}${a.file}`);
  for (const path of [...audio, ...packedPaths(p.manifest)]) {
    const have = path.startsWith(ZIP_LAYOUT.audio) ? files.audio : files.models;
    if (!have.has(path)) problems.push(`${path} is named in the manifest, but not given.`);
  }
  if (problems.length > 0) throw new SaveRefused(problems);

  const json = (name: string, value: unknown): ArchiveEntry => ({
    name,
    bytes: text(stableJson(value)),
  });
  const entries: ArchiveEntry[] = [
    json(ZIP_LAYOUT.manifest, p.manifest),
    { name: ZIP_LAYOUT.program, bytes: text(serializeProgram(p.program)) },
    ...p.scenes.map((s) => json(ZIP_LAYOUT.scene(s.id), s)).sort(byName),
    json(ZIP_LAYOUT.storyboard, p.storyboard),
    { name: ZIP_LAYOUT.script, bytes: text(writeFountain(p)) },
    ...p.frames.map((f) => json(ZIP_LAYOUT.frame(f.id), f)).sort(byName),
    ...audio.map((name) => ({ name, bytes: files.audio.get(name)! })).sort(byName),
    ...[...new Set(packedPaths(p.manifest))]
      .map((name) => ({ name, bytes: files.models.get(name)! }))
      .sort(byName),
  ];
  return writeArchive(entries);
}

// ---- Opening ---------------------------------------------------------------------------------

const DAMAGED = "This file can't be opened: part of it is damaged.";
const TOO_OLD = "This film was made with a very old StoryStage, so this one can't open it.";
const NOT_A_FILM = "This isn't a StoryStage film.";
const NEWER =
  'This film was made with a newer StoryStage. You can watch it and read its code, but not change it. Update StoryStage to change it.';

/**
 * One step up the format's versions: from the version it's keyed by, `to` the next. `manifest`
 * changes the manifest as read, before its shape is checked; `formatVersion` is set to `to` after.
 * Each version that adds only optional fields has a step that changes nothing else.
 */
export interface FormatMigration {
  readonly to: string;
  readonly manifest: (m: Partial<ProductionManifest>) => Partial<ProductionManifest>;
}

export type FormatMigrations = Readonly<Record<string, FormatMigration>>;

/** The format's migrations (spec 03, section 1.2; `packages/production/CHANGELOG.md`). */
export const FORMAT_MIGRATIONS: FormatMigrations = {
  // 1.1.0 adds two optional fields (credit names, retake notes): nothing else changes.
  '1.0.0': { to: '1.1.0', manifest: (m) => m },
};

export type OpenedProduction =
  | {
      /** `ok`: this version. `migrated`: older, brought up to date; keep `original` beside it. */
      readonly status: 'ok' | 'migrated' | 'readOnly';
      readonly production: Production;
      readonly files: ProductionFiles;
      /** For `readOnly`: why, in plain words, for the session's `readOnly` option. */
      readonly message: string | null;
      /** For `migrated`: the file as it was, for `PupilFolder.keepOriginal` (spec 03, 1.2). */
      readonly original: Uint8Array | null;
    }
  | {
      readonly status: 'broken';
      /** In plain words, for the learner; never quotes the file. */
      readonly message: string;
      /** For developers and logs. */
      readonly problems: readonly string[];
    };

const broken = (message: string, problems: readonly string[]): OpenedProduction => ({
  status: 'broken',
  message,
  problems,
});

/** The entries the format names (spec 03, section 1). Anything else is ignored, never unpacked. */
const FORMAT_ENTRY =
  /^(manifest\.json|program\.json|storyboard\.json|script\.fountain|scenes\/[^/]+\.json|frames\/[^/]+\.json|audio\/[^/]+|models\/[^/]+\/.+)$/;

const SCENE_FILE = /^scenes\/([^/]+)\.json$/;
const FRAME_FILE = /^frames\/([^/]+)\.json$/;

/** Ids for script lines and scenes that arrive without one (a script from another tool). */
function freshIds(): { scene(): ReturnType<typeof sceneId>; line(): ReturnType<typeof lineId> } {
  let n = 0;
  return { scene: () => sceneId(`new-s${++n}`), line: () => lineId(`new-l${++n}`) };
}

const FOUNTAIN_WORDS: Readonly<Record<FountainProblem['code'], string>> = {
  tooBig: 'its script is too long',
  tooManyScenes: 'its script has too many scenes',
  tooManyLines: 'its script has too many lines',
  lineTooLong: 'a line in its script is too long',
  headingTooLong: 'a scene heading in its script is too long',
  nameTooLong: "a speaker's name in its script is too long",
};

/**
 * Opens a `.storystage` file: the archive reader's checks (spec 15, 3.1 and 3.2), then every
 * part's shape (3.3), the versions (spec 03, 1.2), the script, and `checkReferences`. A problem
 * anywhere opens nothing.
 */
export function openProduction(
  bytes: Uint8Array,
  options: {
    /** The format version this build reads. Tests pretend to be a later build. */
    readonly formatVersion?: string;
    /** For the program (`openProgram`): tests pass their own versions and migrations. */
    readonly program?: OpenOptions;
    /** The format's migrations. Tests pass their own. */
    readonly migrations?: FormatMigrations;
  } = {},
): OpenedProduction {
  const current = options.formatVersion ?? FORMAT_VERSION;
  const read = readArchive(bytes, { wanted: (name) => FORMAT_ENTRY.test(name) });
  if (!read.ok) return broken(read.problem.message, [read.problem.code]);
  const entries = read.entries;
  const json = (name: string): { ok: true; value: unknown } | { ok: false; problem: string } => {
    const entry = entries.get(name);
    if (!entry) return { ok: false, problem: `${name} is missing.` };
    const parsed = readJson(entry);
    return parsed.ok ? parsed : { ok: false, problem: `${name}: ${parsed.problem.code}` };
  };

  // The manifest first: it says which version the rest is.
  const manifestJson = json(ZIP_LAYOUT.manifest);
  // No manifest at all: some other zip. A manifest that won't parse: a damaged film.
  if (!manifestJson.ok)
    return broken(entries.has(ZIP_LAYOUT.manifest) ? DAMAGED : NOT_A_FILM, [manifestJson.problem]);
  const m = manifestJson.value as Partial<ProductionManifest> | null;
  if (typeof m !== 'object' || m === null || m.format !== 'storystage')
    return broken(NOT_A_FILM, ['manifest.json is not a StoryStage manifest.']);
  if (typeof m.formatVersion !== 'string' || !/^\d+\.\d+\.\d+$/.test(m.formatVersion))
    return broken(DAMAGED, ['manifest.json has no format version.']);
  let order = compareVersions(m.formatVersion, current);
  // An older file is brought up to date one step at a time (spec 03, section 1.2).
  let upgraded: Partial<ProductionManifest> = m;
  let formatMigrated = false;
  const migrations = options.migrations ?? FORMAT_MIGRATIONS;
  while (order < 0) {
    const from = upgraded.formatVersion!;
    const step = migrations[from];
    if (!step) return broken(TOO_OLD, [`Nothing migrates format ${from} to ${current}.`]);
    upgraded = { ...step.manifest(upgraded), formatVersion: step.to };
    formatMigrated = true;
    order = compareVersions(step.to, current);
  }
  const newer = order > 0;
  const shape = { allowExtra: newer };

  const problems: string[] = [...checkManifestShape(upgraded, shape)];
  const manifest = upgraded as ProductionManifest;

  const scenes: Scene[] = [];
  const frames: Frame[] = [];
  for (const name of [...entries.keys()].sort()) {
    const scene = SCENE_FILE.exec(name);
    const frame = FRAME_FILE.exec(name);
    if (!scene && !frame) continue;
    const parsed = json(name);
    if (!parsed.ok) {
      problems.push(parsed.problem);
      continue;
    }
    const v = parsed.value as { id?: unknown };
    const found = scene ? checkSceneShape(v, name, shape) : checkFrameShape(v, name, shape);
    const id = (scene ?? frame)![1]!;
    if (!SAFE_ID.test(id) || v?.id !== id) found.push(`${name}: its id doesn't match its name.`);
    problems.push(...found);
    if (found.length === 0) (scene ? scenes : frames).push(v as never);
  }

  const storyboardJson = json(ZIP_LAYOUT.storyboard);
  if (!storyboardJson.ok) problems.push(storyboardJson.problem);
  else problems.push(...checkStoryboardShape(storyboardJson.value, shape));

  const programJson = json(ZIP_LAYOUT.program);
  let program: Program | null = null;
  let programStatus: 'ok' | 'migrated' | 'readOnly' = 'ok';
  if (!programJson.ok) problems.push(programJson.problem);
  else {
    const opened = openProgram(programJson.value, options.program);
    if (opened.status === 'broken')
      return broken(opened.message, [...problems, ...opened.problems.map((p) => p.message)]);
    program = opened.program;
    programStatus = opened.status;
  }

  const scriptBytes = entries.get(ZIP_LAYOUT.script);
  let script: Production['script'] = [];
  if (!scriptBytes) problems.push('script.fountain is missing.');
  else {
    let source: string | null = null;
    try {
      source = new TextDecoder('utf-8', { fatal: true }).decode(scriptBytes);
    } catch {
      problems.push('script.fountain is not UTF-8.');
    }
    if (source !== null) {
      const result = readFountain(source, freshIds());
      if (!result.ok)
        return broken(`This film can't be opened: ${FOUNTAIN_WORDS[result.problem.code]}.`, [
          `script.fountain: ${result.problem.code}`,
        ]);
      script = result.script.lines;
    }
  }

  if (problems.length > 0 || program === null) return broken(DAMAGED, problems);

  const production: Production = {
    manifest,
    program,
    // Scenes and frames in file-name order: their order carries no meaning (the running order
    // and each frame's `order` do), so the same file always opens the same way.
    scenes,
    storyboard: (storyboardJson as { value: unknown }).value as Storyboard,
    script,
    frames,
  };
  const references = checkReferences(production);
  if (references.length > 0) return broken(DAMAGED, references);

  // The files the manifest names, and nothing else.
  const audio = new Map<string, Uint8Array>();
  for (const a of manifest.audio) {
    const path = `${ZIP_LAYOUT.audio}${a.file}`;
    const got = entries.get(path);
    if (!got) return broken(DAMAGED, [`${path} is named in the manifest, but missing.`]);
    audio.set(path, got);
  }
  const models = new Map<string, Uint8Array>();
  for (const path of packedPaths(manifest)) {
    const got = entries.get(path);
    if (!got) return broken(DAMAGED, [`${path} is named in the manifest, but missing.`]);
    models.set(path, got);
  }

  const status =
    newer || programStatus === 'readOnly'
      ? 'readOnly'
      : formatMigrated || programStatus === 'migrated'
        ? 'migrated'
        : 'ok';
  return {
    status,
    production,
    files: { audio, models },
    message: status === 'readOnly' ? NEWER : null,
    original: status === 'migrated' ? bytes : null,
  };
}
