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
 */
import { ARCHIVE_LIMITS } from './archive.ts';
import {
  openProduction,
  saveProduction,
  SaveRefused,
  type OpenedProduction,
  type ProductionFiles,
} from './file.ts';
import type { Production } from './types.ts';

/** What saving needs from a pupil's folder. `@storystage/host`'s `PupilFolder` fits it. */
export interface SaveFolder {
  read(key: string): Promise<Uint8Array>;
  write(
    key: string | null,
    name: string,
    bytes: Uint8Array,
    options?: { readonly backup?: boolean },
  ): Promise<{ readonly key: string; readonly savedAt: string }>;
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
  private running: Promise<unknown> = Promise.resolve();
  private waiting: {
    run: () => Promise<SaveOutcome>;
    settle: Array<(o: SaveOutcome) => void>;
  } | null = null;

  /**
   * `key` is `null` for a production not saved yet. `original` and `readOnly` come from
   * `openProduction`: the file as it was before migrating, and why it can't be changed.
   */
  constructor(
    folder: SaveFolder,
    opened: {
      readonly key: string | null;
      readonly original?: Uint8Array | null;
      readonly readOnly?: string | null;
    },
  ) {
    this.folder = folder;
    this.currentKey = opened.key;
    this.original = opened.original ?? null;
    this.readOnly = opened.readOnly ?? null;
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
    try {
      const bytes = saveProduction(production, files);
      if (bytes.length > ARCHIVE_LIMITS.fileBytes)
        return { ok: false, problem: { code: 'too_big', message: MESSAGES.too_big } };
      if (this.original !== null && this.currentKey !== null) {
        await this.folder.keepOriginal(this.currentKey, this.original);
        this.original = null;
      }
      const backup = !this.savedThisSession || kind === 'asked';
      const name = production.manifest.title.trim() || 'My film';
      const info = await this.folder.write(this.currentKey, name, bytes, { backup });
      this.currentKey = info.key;
      this.savedThisSession = true;
      return { ok: true, key: info.key, savedAt: info.savedAt };
    } catch (error) {
      return { ok: false, problem: problemOf(error) };
    }
  }
}

export type OpenedFromFolder =
  | (OpenedProduction & { readonly key: string })
  | { readonly status: 'unavailable'; readonly problem: SaveProblem };

/** Opens a production from a pupil's folder: the host reads it, `openProduction` checks it. */
export async function openFromFolder(folder: SaveFolder, key: string): Promise<OpenedFromFolder> {
  let bytes: Uint8Array;
  try {
    bytes = await folder.read(key);
  } catch (error) {
    return { status: 'unavailable', problem: problemOf(error) };
  }
  return { ...openProduction(bytes), key };
}

/** A name for a copy of the production, safe to suggest to the system's file picker. */
export function copyName(production: Production): string {
  return `${plainName(production.manifest.title, 'My film')}.storystage`;
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
