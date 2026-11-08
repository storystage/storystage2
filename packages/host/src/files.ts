/**
 * Contract: where productions are kept (decision 0065, WP24.4; save and open in WP8.4). Each
 * pupil has a folder in the app, inside the device user's own data. Work moves between devices
 * through files, with Collect and Hand back. Everything here is bytes in and bytes out:
 * `packages/production` reads and writes the `.storystage` file, so nothing here parses one.
 *
 * Owners: S8 (the Tauri and browser implementations) and S4 (`packages/production`, which saves
 * and opens through it). A change here is a `contract` pull request reviewed by both. Every
 * implementation passes `describeClassFoldersContract` (`@storystage/host/testing`).
 */

export type PupilId = string;
export type ProductionKey = string;

/** A pupil in the class list (screen 11). Kept on the device, never in a file (threat PS3). */
export interface Pupil {
  readonly id: PupilId;
  /** A first name, or a word the teacher chose. */
  readonly name: string;
  /** One of the studio's built-in pictures, by name: never a photo. */
  readonly picture: string | null;
}

export interface ProductionInfo {
  readonly key: ProductionKey;
  /** The production's title, for the list. */
  readonly name: string;
  /** When it was last written, as an ISO date and time. */
  readonly savedAt: string;
  readonly bytes: number;
  /** How many earlier versions are kept (at most `BACKUPS_KEPT`). */
  readonly backups: number;
  /** Whether the untouched original of a migrated production is kept beside it (spec 03 1.2). */
  readonly hasOriginal: boolean;
}

export interface BackupInfo {
  /** 0 is the most recent earlier version. */
  readonly index: number;
  readonly savedAt: string;
  readonly bytes: number;
}

export interface BinnedProduction extends ProductionInfo {
  readonly pupil: PupilId;
  readonly binnedAt: string;
}

/** How many earlier versions of each production are kept. */
/** A pupil removed from the class, kept until the bin is emptied. */
export interface BinnedPupil {
  readonly pupil: Pupil;
  readonly binnedAt: string;
}

export const BACKUPS_KEPT = 5;

/**
 * The largest file kept or read: spec 15 section 3.1, and `ARCHIVE_LIMITS.fileBytes` in
 * `@storystage/production`, which a test there keeps equal. Anything larger is `too_big`, refused
 * before it is read.
 */
export const FILE_LIMIT = 512 * 1024 * 1024;

/** One code per cause, each with a plain message in the studio's words. */
export const FILE_ERROR_CODES = [
  /** The device or the folder is full. */
  'full',
  /** The file is there but can't be read, or the system can't write it. */
  'unreadable',
  /** Another program has the file open. */
  'locked',
  /** No such pupil or production. */
  'not_found',
  /** A name that can't be used: empty, too long, or the same as another in a Collect. */
  'invalid',
  /** Larger than `FILE_LIMIT`. Nothing is read or written. */
  'too_big',
  /** The person closed the system's file picker. */
  'cancelled',
  'internal',
] as const;
export type FileErrorCode = (typeof FILE_ERROR_CODES)[number];

export class FileError extends Error {
  readonly code: FileErrorCode;

  constructor(code: FileErrorCode) {
    super(`Files: ${code}`);
    this.name = 'FileError';
    this.code = code;
  }
}

export interface WriteOptions {
  /**
   * Whether the version being replaced becomes a backup. `true` (the default) for the first save
   * after a production is opened, a save the learner asks for, and Collect. `false` for autosaves
   * within a session, so the backups are of sessions, not of the last few minutes (S4, #191).
   */
  readonly backup?: boolean;
}

/**
 * One pupil's productions (threat PS1: a folder shows only its own pupil's work). If two windows
 * write the same production, the last write wins.
 */
export interface PupilFolder {
  readonly pupil: Pupil;
  list(): Promise<readonly ProductionInfo[]>;
  read(key: ProductionKey): Promise<Uint8Array>;
  /**
   * Saves a production. `key` is `null` for a new one, which gets a key. The write is atomic: a
   * crash or power cut leaves the last whole version, never half a file (threat PS4). Unless
   * `backup` is false, the version it replaces becomes the newest backup, and only
   * `BACKUPS_KEPT` are kept.
   */
  write(
    key: ProductionKey | null,
    name: string,
    bytes: Uint8Array,
    options?: WriteOptions,
  ): Promise<ProductionInfo>;
  /** Newest first. */
  backups(key: ProductionKey): Promise<readonly BackupInfo[]>;
  /** `index` is as of the last `backups()`: a save since then moves every backup along by one. */
  readBackup(key: ProductionKey, index: number): Promise<Uint8Array>;
  /** Keeps the untouched original of a migrated production (spec 03 1.2). The first one stays. */
  keepOriginal(key: ProductionKey, bytes: Uint8Array): Promise<void>;
  readOriginal(key: ProductionKey): Promise<Uint8Array | null>;
  /** Moves a production, its backups and its original to the class's bin. */
  remove(key: ProductionKey): Promise<void>;
}

/** The device's own folder's pupil (`ClassFolders.openDevice`). No class pupil has this id. */
export const DEVICE_PUPIL: Pupil = { id: 'device', name: '', picture: null };

/** Who a class Backstage item belongs to: the class, or the one pupil who imported it. */
export type BackstageOwner = 'class' | PupilId;

/** One of an item's files, at a relative path the import chose (`models/<folder>/model.glb`). */
export interface BackstageFile {
  readonly path: string;
  readonly bytes: Uint8Array;
}

/** An item in the class Backstage (decision 0066, spec 17 section 5). */
export interface StoredModel {
  /** The import's id, such as `class/<Class>/<name>`. Never reused in the class. */
  readonly id: string;
  readonly owner: BackstageOwner;
  /** The item's Backstage record, kept exactly as given. The host never reads models. */
  readonly record: unknown;
  readonly addedAt: string;
  readonly files: readonly { readonly path: string; readonly bytes: number }[];
}

export interface BinnedStoredModel extends StoredModel {
  readonly binnedAt: string;
}

/** The most a class Backstage keeps on a device, all its items' files together. */
export const CLASS_BACKSTAGE_LIMIT = 2 * 1024 * 1024 * 1024;

/** The longest record, as JSON. */
export const BACKSTAGE_RECORD_LIMIT = 1024 * 1024;

/**
 * The class Backstage on this device (decision 0066): imported models, beside the pupil folders,
 * as records and bytes. Who may import, promote or restore is the studio's to check (policy
 * `backstage.import`); a pupil sees the class's items and their own.
 */
export interface ClassBackstage {
  list(): Promise<readonly StoredModel[]>;
  /**
   * Adds an item, all its files or none. An id already used in the class (live, in the bin, or
   * emptied from it), a path that isn't plain relative, or a path twice is `invalid`; a file
   * over `FILE_LIMIT` or a record over `BACKSTAGE_RECORD_LIMIT` is `too_big`; going over
   * `CLASS_BACKSTAGE_LIMIT` is `full`. An owner who isn't in the class list is `not_found`.
   */
  add(
    owner: BackstageOwner,
    id: string,
    record: unknown,
    files: readonly BackstageFile[],
  ): Promise<StoredModel>;
  /** One of an item's files. `not_found` for an id or path it doesn't have. */
  read(id: string, path: string): Promise<Uint8Array>;
  /** A pupil's item becomes the class's. For the teacher. */
  promote(id: string): Promise<void>;
  /** To the bin, as a production goes (decision 0065). */
  remove(id: string): Promise<void>;
  /** For the teacher only. */
  bin(): Promise<readonly BinnedStoredModel[]>;
  /** Back from the bin. If its pupil has since left the class, it comes back as the class's. */
  restore(id: string): Promise<void>;
  emptyBin(): Promise<void>;
}

/** The class on this device: its pupils, their folders, the bin and the class Backstage. */
export interface ClassFolders {
  pupils(): Promise<readonly Pupil[]>;
  addPupil(name: string, picture?: string | null): Promise<Pupil>;
  renamePupil(id: PupilId, name: string, picture?: string | null): Promise<Pupil>;
  /** Removes a pupil from the list. Their productions go to the bin, not away. */
  removePupil(id: PupilId): Promise<void>;
  /** Opens a pupil's folder, and makes it the current one, where autosave writes. */
  open(id: PupilId): Promise<PupilFolder>;
  /**
   * A pupil's folder, leaving `current()` as it is: for the teacher's Collect and Hand back,
   * which reach every pupil's folder in turn. `not_found` for a pupil who isn't in the class.
   */
  folder(id: PupilId): Promise<PupilFolder>;
  /**
   * The device's own folder, for a device with no class list, at home or in a club (07-ux
   * section 9.1). It's outside the class list: `pupils()` never lists it, `folder(id)` can't
   * reach it, so Collect leaves it out, and the Prompter counts against the device. It becomes
   * the current folder, as `open` does. Its pupil is `DEVICE_PUPIL`. A film removed there goes to
   * the bin as `pupil: 'device'`, so it can be restored. While the class list has pupils it's
   * `invalid`: a pupil on a class device can't step outside Collect or their own Prompter count.
   */
  openDevice(): Promise<PupilFolder>;
  /** The folder in use, if a pupil has chosen their name. */
  current(): PupilFolder | null;
  /** At the end of a lesson: waits for writes in progress, then nobody's folder is open. */
  close(): Promise<void>;
  /** For the teacher only (threat PS1): what pupils have deleted. */
  bin(): Promise<readonly BinnedProduction[]>;
  /**
   * Back from the bin. `not_found` while its pupil is out of the class list: `restorePupil`
   * first.
   */
  restore(pupil: PupilId, key: ProductionKey): Promise<void>;
  /** For the teacher only: pupils removed from the class, newest first, until the bin is emptied. */
  binnedPupils(): Promise<readonly BinnedPupil[]>;
  /**
   * Puts a removed pupil back in the class list, with the same id, name and picture, so their
   * films can be restored. `not_found` for one who isn't in the bin. The films stay in the bin
   * until each is restored.
   */
  restorePupil(id: PupilId): Promise<Pupil>;
  /** Empties the bin: removed pupils' films, and their records. */
  emptyBin(): Promise<void>;
  /**
   * The class Backstage on this device (decision 0066). Removing a pupil sends their own items
   * to its bin, with their productions.
   */
  backstage(): ClassBackstage;
}

/** A file for Collect or Hand back: `folder/file` inside the folder the teacher chose. */
export interface CollectedFile {
  /** One folder per pupil, named by `safeFileName`. */
  readonly folder: string;
  /** Ends in `.storystage`. */
  readonly file: string;
  readonly bytes: Uint8Array;
}

/**
 * The system's own file picker (decision 0065): the device, a school drive, OneDrive, Google
 * Drive. StoryStage has no sign-in of its own. Everything read here is untrusted, and goes
 * through `packages/production`'s import rules before it is used (threat PS5).
 */
export interface FilePicker {
  /** Save a copy: the person picks where. */
  saveCopy(suggestedName: string, bytes: Uint8Array): Promise<void>;
  /** Open a file the person picks. One over `FILE_LIMIT` is `too_big`, and isn't read. */
  open(): Promise<{ readonly name: string; readonly bytes: Uint8Array }>;
  /**
   * Collect: the teacher picks a folder, and every file is written into it. Gives the count. The
   * caller makes names unique ("The Owl (2)"): two files with the same `folder/file`, ignoring
   * case as Windows and macOS do (`collectedPath`), are `invalid`, and nothing is written.
   */
  collect(files: readonly CollectedFile[]): Promise<number>;
  /**
   * Hand back: the teacher picks a folder, and every `.storystage` one level down is read. Any
   * over `FILE_LIMIT` is `too_big`, and nothing is read.
   */
  handBack(): Promise<readonly CollectedFile[]>;
}

/**
 * Where a collected file lands, as a folder on Windows or macOS sees it: case and Unicode form
 * don't count, so "Sam/Pip" and "sam/pip" are the same file (S4's review of #211).
 */
export function collectedPath(file: Pick<CollectedFile, 'folder' | 'file'>): string {
  return `${file.folder}/${file.file}`.normalize('NFC').toLowerCase();
}

const RESERVED = /^(con|prn|aux|nul|com[1-9]|lpt[1-9])$/i;
const REFUSED = new Set('<>:"/\\|?*');
const NAME_LIMIT = 80;

/** Control characters, and the characters Windows refuses in a name, become spaces. */
const plain = (character: string) => {
  const code = character.codePointAt(0) ?? 0;
  return code < 32 || code === 127 || REFUSED.has(character) ? ' ' : character;
};

/**
 * A pupil's or production's name as a file or folder name that works on every system: no path
 * parts, no characters Windows refuses, nothing reserved, no trailing dot or space, and at most
 * 80 characters. Never empty.
 */
export function safeFileName(text: string): string {
  const cleaned = [...text.normalize('NFC')]
    .map(plain)
    .join('')
    // `.` and `..` were path parts: drop any run of dots standing on its own.
    .replace(/(^|\s)\.+(?=\s|$)/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .replace(/^\.+/, '')
    .trim()
    .slice(0, NAME_LIMIT)
    .replace(/[. ]+$/, '');
  if (cleaned === '') return 'file';
  const stem = cleaned.split('.')[0] ?? '';
  if (!RESERVED.test(stem.trimEnd())) return cleaned;
  // Windows takes any name whose stem is a device as the device, whatever follows the dot, so
  // the mark goes after the stem: "con.txt" becomes "con_.txt" (S4's review of #218).
  return `${stem.trimEnd()}_${cleaned.slice(stem.length)}`
    .slice(0, NAME_LIMIT)
    .replace(/[. ]+$/, '');
}
