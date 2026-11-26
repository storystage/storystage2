/**
 * WP8.4: Collect and Hand back (decision 0065; `docs/spec/03-production-format.md`, section 1.5).
 *
 * At the end of a unit the teacher collects every pupil's productions into a folder they pick,
 * one folder per pupil, and later hands marked work back from the same layout. The class's folders
 * and the picker are the host's; as in `saving.ts`, this package says what it needs from them,
 * and the host's `ClassFolders` (with `folder(id)`, which doesn't change the current pupil) and
 * `FilePicker` fit.
 *
 * - **Names the teacher sees.** Each pupil's folder is their name, made safe for every system;
 *   two pupils with the same name get "Sam" and "Sam (2)", in class-list order, so Hand back finds
 *   the same pupil again. Productions with the same title get "Pip" and "Pip (2)".
 * - **Collect copies the films as saved,** whole: a version with its kept sounds put back, the
 *   same bytes `saveProduction` gave (spec 03, section 1.4.1, point 5).
 * - **Hand back checks every file** as any picked file is checked (`openProduction`, threat PS5),
 *   and writes each good one into its pupil's folder as a new production, "<title> (handed
 *   back)", so it never overwrites the pupil's own work. Its sounds are kept once in its own
 *   folder (point 6). Anything else is skipped, with the reason in plain words.
 */
import { openProduction, packVersion } from './file.ts';
import { fitName, nameSounds, plainName, readWholeFilm, type SaveFolder } from './saving.ts';

/** A pupil's folder, as Collect and Hand back need it. The host's `PupilFolder` fits. */
export interface CollectFolder extends SaveFolder {
  list(): Promise<readonly { readonly key: string; readonly name: string }[]>;
}

/** The class, as Collect and Hand back need it. The host's `ClassFolders` fits. */
export interface CollectClass {
  pupils(): Promise<readonly { readonly id: string; readonly name: string }[]>;
  /** A pupil's folder, without changing which pupil is current. */
  folder(id: string): Promise<CollectFolder>;
}

/** A file in the folder the teacher picked: `folder/file`. The host's `CollectedFile`. */
export interface CollectedFile {
  readonly folder: string;
  readonly file: string;
  readonly bytes: Uint8Array;
}

/** The picker's Collect and Hand back. The host's `FilePicker` fits. */
export interface CollectPicker {
  collect(files: readonly CollectedFile[]): Promise<number>;
  handBack(): Promise<readonly CollectedFile[]>;
}

const EXTENSION = '.storystage';

/**
 * `name`, or `name (2)`, `name (3)`, … whichever `taken` doesn't have yet, ignoring case, with
 * `ending` (a file's extension) after it. The whole, ending included, fits `NAME_LIMIT`: the name
 * is shortened to make room (`fitName`), so the host's Collect never finds one it would have cut.
 */
function unique(name: string, taken: Set<string>, ending = ''): string {
  for (let n = 1; ; n++) {
    const suffix = n === 1 ? '' : ` (${n})`;
    const candidate = fitName(name, `${suffix}${ending}`, name);
    if (!taken.has(candidate.toLowerCase())) {
      taken.add(candidate.toLowerCase());
      return candidate;
    }
  }
}

/** Each pupil's folder name, in class-list order: the same list always gives the same names. */
async function pupilFolders(classes: CollectClass): Promise<{ id: string; folder: string }[]> {
  const taken = new Set<string>();
  return (await classes.pupils()).map((p) => ({
    id: p.id,
    folder: unique(plainName(p.name, 'Pupil'), taken),
  }));
}

export type CollectOutcome =
  { readonly ok: true; readonly count: number } | { readonly ok: false; readonly code: string };

/** Collect: every pupil's productions, as saved, one folder per pupil. */
export async function collectClass(
  classes: CollectClass,
  picker: CollectPicker,
): Promise<CollectOutcome> {
  try {
    const files: CollectedFile[] = [];
    for (const { id, folder } of await pupilFolders(classes)) {
      const pupil = await classes.folder(id);
      const taken = new Set<string>();
      for (const { key, name } of await pupil.list()) {
        const file = unique(plainName(name, 'My film'), taken, EXTENSION);
        files.push({ folder, file, bytes: await readWholeFilm(pupil, key) });
      }
    }
    return { ok: true, count: await picker.collect(files) };
  } catch (error) {
    const code = (error as { code?: unknown } | null)?.code;
    return { ok: false, code: typeof code === 'string' ? code : 'internal' };
  }
}

export interface HandBackReport {
  /** How many productions were written into pupils' folders. */
  readonly written: number;
  /** Files not handed back, with the reason in plain words. */
  readonly skipped: readonly {
    readonly folder: string;
    readonly file: string;
    readonly reason: string;
  }[];
}

/**
 * Hand back: every `.storystage` file in the picked folder's pupil folders, checked, then written
 * into that pupil's folder as a new production.
 */
export async function handBackClass(
  classes: CollectClass,
  picker: CollectPicker,
): Promise<HandBackReport | { readonly ok: false; readonly code: string }> {
  let files: readonly CollectedFile[];
  try {
    files = await picker.handBack();
  } catch (error) {
    const code = (error as { code?: unknown } | null)?.code;
    return { ok: false, code: typeof code === 'string' ? code : 'internal' };
  }
  const byFolder = new Map(
    (await pupilFolders(classes)).map((p) => [p.folder.toLowerCase(), p.id]),
  );
  let written = 0;
  const skipped: { folder: string; file: string; reason: string }[] = [];
  for (const { folder, file, bytes } of files) {
    const skip = (reason: string) => skipped.push({ folder, file, reason });
    const pupil = byFolder.get(folder.toLowerCase());
    if (!pupil) {
      skip(`There's no pupil called ${folder} in this class.`);
      continue;
    }
    const opened = openProduction(bytes);
    if (opened.status === 'broken') {
      skip(opened.message);
      continue;
    }
    try {
      // Shortened to make room for the ending, so a title of the full 80 characters fits too.
      const name = fitName(opened.production.manifest.title, ' (handed back)');
      const into = await classes.folder(pupil);
      if (opened.status === 'ok' && (opened.production.manifest.sounds ?? []).length > 0) {
        // A new production writes all its sounds once into its own folder (spec 03, 1.4.1).
        const names = new Map<string, string>();
        await nameSounds(opened.production, opened.files, names);
        const packed = packVersion(opened.production, opened.files, names);
        await into.write(null, name, packed.bytes, {
          kept: {
            uses: packed.uses,
            add: [...packed.sounds].map(([n, b]) => ({ name: n, bytes: b })),
          },
        });
      } else {
        // As it was: a film without sounds is its own version. One that's older is migrated,
        // and one that's newer kept whole, when it's opened, as any saved in the folder.
        await into.write(null, name, bytes);
      }
      written++;
    } catch (error) {
      const code = (error as { code?: unknown } | null)?.code;
      skip(code === 'full' ? "There's no room left on this device." : "It couldn't be saved.");
    }
  }
  return { written, skipped };
}
