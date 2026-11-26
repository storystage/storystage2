/**
 * WP8.4: saving a production into a pupil's folder, and opening it again (decision 0065;
 * `docs/spec/03-production-format.md`, section 1.4).
 *
 * The folders are the host's (`@storystage/host`'s `PupilFolder`, S8). This package can't depend
 * on the host, which depends on the Prompter, which depends on this, so it says what it needs
 * from a folder (`SaveFolder`) and from the system's file picker (`CopyPicker`) as interfaces of
 * its own. The host's types fit them as they are.
 *
 * A `ProductionSaver` holds one open production's saves:
 * - **Backups are working sessions.** The first save after opening keeps the version it replaces
 *   as a backup, and so does a save the learner asks for; autosaves in between don't, so the
 *   host's five backups go back five sessions, not five minutes.
 * - **A migrated production keeps its original** beside it, before its first save (spec 03, 1.2).
 * - **A read-only production is never written.**
 * - **Saves run one at a time.** An autosave asked for while another is running waits, and only
 *   the latest waiting one runs.
 * - **Problems come back in plain words,** never thrown.
 * - **Each sound is written once** (spec 03, section 1.4.1, point 3). A version is the film
 *   without its sounds; a save passes the bytes only of the sounds the folder doesn't have, by the
 *   folder's own list, which every write gives back. Each sound is hashed once while the film is
 *   open, as a clip file's bytes never change.
 */
import { ARCHIVE_LIMITS } from './archive.ts';
import {
  openProduction,
  packVersion,
  saveProduction,
  SaveRefused,
  versionSounds,
  wholeFilm,
  type OpenedProduction,
  type ProductionFiles,
} from './file.ts';
import { keptSoundName, soundHash } from './sound.ts';
import { ZIP_LAYOUT, type Production } from './types.ts';

/**
 * What saving needs from a pupil's folder. `@storystage/host`'s `PupilFolder` fits it. A version
 * in the folder is a film without its sounds, each kept once beside it (spec 03, section 1.4.1).
 */
export interface SaveFolder {
  /** The current version. */
  read(key: string): Promise<Uint8Array>;
  /** An earlier version, 0 the newest. */
  readBackup(key: string, index: number): Promise<Uint8Array>;
  /** The kept sounds the folder has for the production. */
  kept(key: string): Promise<readonly string[]>;
  /** One kept sound's bytes. */
  readKept(key: string, name: string): Promise<Uint8Array>;
  write(
    key: string | null,
    name: string,
    bytes: Uint8Array,
    options?: {
      readonly backup?: boolean;
      /** The kept sounds this version uses, and the bytes of those the folder lacks. */
      readonly kept?: {
        readonly uses: readonly string[];
        readonly add?: readonly { readonly name: string; readonly bytes: Uint8Array }[];
      };
    },
  ): Promise<{ readonly key: string; readonly savedAt: string; readonly kept: readonly string[] }>;
  keepOriginal(key: string, bytes: Uint8Array): Promise<void>;
}

/** What Save a copy and Open need from the system's file picker. The host's `FilePicker` fits it. */
export interface CopyPicker {
  saveCopy(suggestedName: string, bytes: Uint8Array): Promise<void>;
  open(): Promise<{ readonly name: string; readonly bytes: Uint8Array }>;
}

/** The host's `FileError` codes, and this package's own. */
export type SaveProblemCode =
  | 'full'
  | 'unreadable'
  | 'locked'
  | 'not_found'
  | 'invalid'
  | 'too_big'
  | 'cancelled'
  | 'internal'
  | 'readOnly'
  | 'refused';

const MESSAGES: Readonly<Record<SaveProblemCode, string>> = {
  full: "There's no room left on this device to save your film. Ask your teacher.",
  unreadable: "StoryStage couldn't save your film. Try again, or ask your teacher.",
  locked: 'Another program has your film open. Close it, and try again.',
  not_found: "Your film's folder is missing. Ask your teacher.",
  invalid: "Your film's name can't be used. Try a shorter one.",
  too_big: "Your film is too big to save. Try removing a recording or a model you don't use.",
  cancelled: 'Nothing was saved.',
  internal: "StoryStage couldn't save your film. Try again, or ask your teacher.",
  readOnly: 'This film opened read-only, so it can’t be saved. Save a copy to keep your changes.',
  refused: "Something in this film is broken, so it couldn't be saved. Ask your teacher.",
};

export interface SaveProblem {
  readonly code: SaveProblemCode;
  /** In plain words, for the learner. */
  readonly message: string;
}

export type SaveOutcome =
  | { readonly ok: true; readonly key: string; readonly savedAt: string }
  | { readonly ok: false; readonly problem: SaveProblem };

const KNOWN = new Set<string>(Object.keys(MESSAGES));

/** The host's `FileError`, or anything else thrown, as a problem in plain words. */
function problemOf(error: unknown): SaveProblem {
  if (error instanceof SaveRefused) return { code: 'refused', message: MESSAGES.refused };
  const code = (error as { code?: unknown } | null)?.code;
  const known =
    typeof code === 'string' && KNOWN.has(code) ? (code as SaveProblemCode) : 'internal';
  return { code: known, message: MESSAGES[known] };
}

/** `kind: 'asked'` is a save the learner asked for; `'auto'` is autosave. */
export type SaveKind = 'auto' | 'asked';

export class ProductionSaver {
  private readonly folder: SaveFolder;
  private currentKey: string | null;
  private original: Uint8Array | null;
  private readonly readOnly: string | null;
  private savedThisSession = false;
  /** Each clip file's kept name, worked out once (point 3). */
  private readonly names: Map<string, string>;
  /** The kept sounds the folder has, as its last write or `kept` said; `null` to ask again. */
  private have: Set<string> | null = null;
  private running: Promise<unknown> = Promise.resolve();
  private waiting: {
    run: () => Promise<SaveOutcome>;
    settle: Array<(o: SaveOutcome) => void>;
  } | null = null;

  /**
   * `key` is `null` for a production not saved yet. `original` and `readOnly` come from
   * `openProduction`: the file as it was before migrating, and why it can't be changed.
   * `soundNames` comes from `openFromFolder`, which checked each one, so they aren't hashed again.
   */
  constructor(
    folder: SaveFolder,
    opened: {
      readonly key: string | null;
      readonly original?: Uint8Array | null;
      readonly readOnly?: string | null;
      readonly soundNames?: ReadonlyMap<string, string>;
    },
  ) {
    this.folder = folder;
    this.currentKey = opened.key;
    this.original = opened.original ?? null;
    this.readOnly = opened.readOnly ?? null;
    this.names = new Map(opened.soundNames);
    if (opened.key === null) this.have = new Set();
  }

  /** The production's key in the folder, once it has one. */
  get key(): string | null {
    return this.currentKey;
  }

  /**
   * Saves the production. Saves run one at a time; of the autosaves waiting behind a running
   * save, only the latest runs, and every caller gets its outcome.
   */
  save(production: Production, files: ProductionFiles, kind: SaveKind): Promise<SaveOutcome> {
    if (this.readOnly !== null)
      return Promise.resolve({
        ok: false,
        problem: { code: 'readOnly', message: MESSAGES.readOnly },
      });
    const run = () => this.write(production, files, kind);
    if (kind === 'auto' && this.waiting) {
      // A newer autosave replaces the one waiting; both callers get this one's outcome.
      this.waiting.run = run;
      return new Promise((resolve) => this.waiting!.settle.push(resolve));
    }
    const entry = { run, settle: [] as Array<(o: SaveOutcome) => void> };
    const outcome = new Promise<SaveOutcome>((resolve) => entry.settle.push(resolve));
    if (kind === 'auto') this.waiting = entry;
    this.running = this.running.then(async () => {
      if (this.waiting === entry) this.waiting = null;
      const result = await entry.run();
      for (const settle of entry.settle) settle(result);
    });
    return outcome;
  }

  private async write(
    production: Production,
    files: ProductionFiles,
    kind: SaveKind,
  ): Promise<SaveOutcome> {
    let packed: ReturnType<typeof packVersion>;
    try {
      await nameSounds(production, files, this.names);
      packed = packVersion(production, files, this.names);
    } catch (error) {
      return { ok: false, problem: problemOf(error) };
    }
    // The whole film's limit, so Save a copy always fits (point 2).
    if (packed.wholeBytes > ARCHIVE_LIMITS.fileBytes)
      return { ok: false, problem: { code: 'too_big', message: MESSAGES.too_big } };
    try {
      if (this.original !== null && this.currentKey !== null) {
        await this.folder.keepOriginal(this.currentKey, this.original);
        this.original = null;
      }
      const backup = !this.savedThisSession || kind === 'asked';
      // A title from an opened file may be longer than the host keeps (S5's cross-check).
      const name = fitName(production.manifest.title, '', 'My film');
      const attempt = async () => {
        const key = this.currentKey;
        const have = (this.have ??=
          key === null ? new Set() : new Set(await this.folder.kept(key)));
        const add = packed.uses
          .filter((n) => !have.has(n))
          .map((n) => ({ name: n, bytes: packed.sounds.get(n)! }));
        return this.folder.write(key, name, packed.bytes, {
          backup,
          kept: { uses: packed.uses, add },
        });
      };
      let info: Awaited<ReturnType<SaveFolder['write']>>;
      try {
        info = await attempt();
      } catch (error) {
        // The folder lacks a sound this saver's list has: another window saved, or something
        // outside StoryStage changed the folder. Ask it again, and retry once (point 3).
        if (codeOf(error) !== 'not_found' || this.currentKey === null) throw error;
        this.have = null;
        info = await attempt();
      }
      this.currentKey = info.key;
      this.have = new Set(info.kept);
      this.savedThisSession = true;
      return { ok: true, key: info.key, savedAt: info.savedAt };
    } catch (error) {
      this.have = null;
      // A kept sound the folder refuses is StoryStage's fault, never the learner's (point 3):
      // the film's name always fits, so `invalid` here is a kept sound's.
      if (codeOf(error) === 'invalid' && packed.uses.length > 0)
        return { ok: false, problem: { code: 'internal', message: MESSAGES.internal } };
      return { ok: false, problem: problemOf(error) };
    }
  }
}

const codeOf = (error: unknown) => (error as { code?: unknown } | null)?.code;

/**
 * Gives each of the film's sounds its kept name in `names`, hashing only the ones not there yet.
 * A sound the manifest names but `files` hasn't is left for `packVersion` to refuse.
 */
export async function nameSounds(
  production: Production,
  files: ProductionFiles,
  names: Map<string, string>,
): Promise<void> {
  for (const c of production.manifest.sounds ?? []) {
    if (names.has(c.file)) continue;
    const bytes = files.sounds?.get(`${ZIP_LAYOUT.sounds}${c.file}`);
    if (bytes) names.set(c.file, await keptSoundName(c.file, bytes));
  }
}

export type OpenedFromFolder =
  | (OpenedProduction & {
      readonly key: string;
      /** Each clip file's kept name, checked, for `ProductionSaver`'s `soundNames`. */
      readonly soundNames?: ReadonlyMap<string, string>;
    })
  | { readonly status: 'unavailable'; readonly problem: SaveProblem };

const DAMAGED_SOUNDS = "This file can't be opened: part of it is damaged.";

type BrokenFromFolder = Extract<OpenedFromFolder, { status: 'broken' }>;

/**
 * A version and its kept sounds, read and checked (spec 03, section 1.4.1, point 4): each sound
 * the version names, by `sounds/<clip file>`, its SHA-256 matching its name. A kept sound that's
 * missing or doesn't match makes the version damaged. Anything else the folder says is thrown, as
 * the folder threw it.
 */
async function readVersion(
  folder: SaveFolder,
  key: string,
  backup: number | undefined,
): Promise<
  | {
      readonly ok: true;
      readonly bytes: Uint8Array;
      readonly sounds: ReadonlyMap<string, Uint8Array>;
      readonly names: ReadonlyMap<string, string>;
    }
  | { readonly ok: false; readonly bytes: Uint8Array; readonly broken: BrokenFromFolder }
> {
  const bytes =
    backup === undefined ? await folder.read(key) : await folder.readBackup(key, backup);
  const kept = versionSounds(bytes);
  if (!kept.ok) return { ok: false, bytes, broken: { ...(kept.opened as BrokenFromFolder), key } };
  const damaged = (problem: string) => ({
    ok: false as const,
    bytes,
    broken: { status: 'broken' as const, message: DAMAGED_SOUNDS, problems: [problem], key },
  });
  const sounds = new Map<string, Uint8Array>();
  const read = new Map<string, Uint8Array>();
  for (const [file, name] of kept.kept ?? []) {
    let got = read.get(name);
    if (got === undefined) {
      try {
        got = await folder.readKept(key, name);
      } catch (error) {
        if (codeOf(error) === 'not_found') return damaged(`The kept sound for ${file} is missing.`);
        throw error;
      }
      if (`sound-${await soundHash(got)}` !== name.slice(0, name.lastIndexOf('.')))
        return damaged(`The kept sound for ${file} isn't the one its name says.`);
      read.set(name, got);
    }
    sounds.set(`${ZIP_LAYOUT.sounds}${file}`, got);
  }
  return { ok: true, bytes, sounds, names: kept.kept ?? new Map() };
}

/**
 * Opens a production from a pupil's folder: the host reads the version and its kept sounds, and
 * `openProduction` checks the whole film. `{ backup: index }` opens an earlier version the same
 * way, with the same result (S5's request on #695).
 */
export async function openFromFolder(
  folder: SaveFolder,
  key: string,
  options: { readonly backup?: number } = {},
): Promise<OpenedFromFolder> {
  let version: Awaited<ReturnType<typeof readVersion>>;
  try {
    version = await readVersion(folder, key, options.backup);
  } catch (error) {
    return { status: 'unavailable', problem: problemOf(error) };
  }
  if (!version.ok) return version.broken;
  const opened = openProduction(version.bytes, { sounds: version.sounds });
  return opened.status === 'broken'
    ? { ...opened, key }
    : { ...opened, key, soundNames: version.names };
}

/**
 * The current version as a whole film, for Collect (spec 03, section 1.4.1, point 5): its sounds
 * put back, the same bytes `saveProduction` gave. A version whose sounds are damaged is given as
 * saved, so Collect never leaves out what the folder has: it opens as damaged anywhere, as here.
 * What the folder throws is thrown.
 */
export async function readWholeFilm(folder: SaveFolder, key: string): Promise<Uint8Array> {
  const version = await readVersion(folder, key, undefined);
  return version.ok ? wholeFilm(version.bytes, version.sounds) : version.bytes;
}

/** A name for a copy of the production, safe to suggest to the system's file picker. */
export function copyName(production: Production): string {
  return `${plainName(production.manifest.title, 'My film')}.storystage`;
}

/** The longest name the host keeps for a film or a file (`checkName`, `safeFileName`). */
export const NAME_LIMIT = 80;

/**
 * `text` (or `fallback`, if it's empty) with `ending` after it, the whole at most `NAME_LIMIT`
 * characters as the host counts them (UTF-16 units). Only `text` is shortened, never through the
 * middle of a character such as an emoji, and a shortened one loses its trailing spaces and dots.
 */
export function fitName(text: string, ending = '', fallback = 'My film'): string {
  let stem = text.trim() || fallback;
  const room = NAME_LIMIT - ending.length;
  if (stem.length > room) {
    stem = stem.slice(0, room);
    // A high surrogate left on its own is half a character.
    if (/[\uD800-\uDBFF]$/.test(stem)) stem = stem.slice(0, -1);
    while (stem.endsWith(' ') || stem.endsWith('.')) stem = stem.slice(0, -1);
    if (stem === '') stem = fallback.slice(0, room);
  }
  return `${stem}${ending}`;
}

const RESERVED = /^(con|prn|aux|nul|com[1-9]|lpt[1-9])$/i;

/**
 * Text as a file or folder name that works on every system, by the same rules as the host's
 * `safeFileName`: no control characters or characters Windows refuses, no part that is only
 * dots, nothing Windows reserves, no trailing dot or space, at most 80 characters. Never empty.
 */
export function plainName(text: string, fallback: string): string {
  let name = [...text.normalize('NFC')]
    .map((c) => {
      const code = c.codePointAt(0) ?? 0;
      return code < 32 || code === 127 || '<>:"/\\|?*'.includes(c) ? ' ' : c;
    })
    .join('')
    .split(/\s+/)
    .filter((word) => !/^\.+$/.test(word))
    .join(' ')
    .trim()
    .replace(/^\.+/, '')
    .slice(0, 80);
  while (name.endsWith('.') || name.endsWith(' ')) name = name.slice(0, -1);
  if (name === '') return fallback;
  // Windows reads any name whose part before the first dot is a device ("con.txt", "con .txt")
  // as the device, so the "_" goes straight after that part, spaces dropped: "con_.txt".
  const stem = name.split('.')[0] ?? '';
  if (!RESERVED.test(stem.trimEnd())) return name;
  name = `${stem.trimEnd()}_${name.slice(stem.length)}`.slice(0, 80);
  while (name.endsWith('.') || name.endsWith(' ')) name = name.slice(0, -1);
  return name;
}

/** Save a copy: the learner picks where (decision 0065). */
export async function saveCopy(
  picker: CopyPicker,
  production: Production,
  files: ProductionFiles,
): Promise<{ readonly ok: true } | { readonly ok: false; readonly problem: SaveProblem }> {
  try {
    await picker.saveCopy(copyName(production), saveProduction(production, files));
    return { ok: true };
  } catch (error) {
    return { ok: false, problem: problemOf(error) };
  }
}

/**
 * Open: the learner picks a file. Everything read this way is untrusted, so it goes through
 * `openProduction`'s checks like any other file (threat PS5).
 */
export async function openFromPicker(
  picker: CopyPicker,
): Promise<OpenedProduction | { readonly status: 'unavailable'; readonly problem: SaveProblem }> {
  let picked: { readonly bytes: Uint8Array };
  try {
    picked = await picker.open();
  } catch (error) {
    return { status: 'unavailable', problem: problemOf(error) };
  }
  return openProduction(picked.bytes);
}
