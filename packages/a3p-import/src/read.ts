/**
 * WP9.1: reading an Alice 3 world (`.a3p`), or a class saved on its own (`.a3c`).
 *
 * An `.a3p` is a zip holding `version.txt`, `programType.xml` (the program: Alice's own XML for
 * its AST), `thumbnail.png` and, if the world uses pictures or sounds of its own, `resources.xml`
 * and the files under `resources/`. A class file holds `type.xml` in place of `programType.xml`.
 *
 * It's read with spec 15's hardening: through the one archive reader (`readArchive`, WP8.4),
 * with its limits on sizes, names and unpacking; XML with a declaration is refused before
 * parsing; nesting stops at 256. Any problem refuses the whole file, in plain words that never
 * quote it. Mapping what's read onto the StoryStage program is WP9.2.
 */
import {
  ARCHIVE_LIMITS,
  readArchive,
  type ArchiveLimits,
  type ArchiveProblemCode,
} from '@storystage/production';
import { decodeText } from './text.ts';
import { childElements, parseXml, XmlRefused, type XmlElement } from './xml.ts';

/** Alice's version, from `version.txt`: "3.3.0.0.0" is 3.3. */
export interface AliceVersion {
  readonly text: string;
  readonly major: number;
  readonly minor: number;
}

/** A picture or sound the world carries, from `resources.xml`. */
export interface AliceResource {
  /** Its entry in the file, "resources/ice.png", which the program refers to. */
  readonly entryName: string;
  readonly name: string;
  /** "org.lgna.common.resources.ImageResource", or `AudioResource`. */
  readonly className: string;
  readonly contentType: string;
  readonly uuid: string;
  /** Every attribute, as `resources.xml` gives them (width, height, duration…). */
  readonly attributes: Readonly<Record<string, string>>;
  /** The file's bytes, or null if `resources.xml` names a file that isn't there (WP9.2 reports it). */
  readonly bytes: Uint8Array | null;
}

export interface AliceFile {
  /** A world (`programType.xml`) or a class on its own (`type.xml`). */
  readonly kind: 'world' | 'class';
  readonly version: AliceVersion;
  /** The root of `programType.xml` or `type.xml`: Alice's `<node>` for the program's type. */
  readonly program: XmlElement;
  readonly resources: readonly AliceResource[];
  readonly thumbnail: Uint8Array | null;
}

export type A3pProblemCode =
  ArchiveProblemCode | 'notAlice' | 'unknownVersion' | 'notText' | 'declaration' | 'badXml';

export interface A3pProblem {
  readonly code: A3pProblemCode;
  /** In plain words, for the learner. Never quotes the file. */
  readonly message: string;
}

export type ReadA3pResult =
  | { readonly ok: true; readonly file: AliceFile }
  | { readonly ok: false; readonly problem: A3pProblem };

const MESSAGES: Readonly<Record<Exclude<A3pProblemCode, ArchiveProblemCode>, string>> = {
  notAlice: 'This isn’t an Alice world StoryStage can open.',
  unknownVersion: 'This Alice world was made with a version of Alice StoryStage can’t read.',
  notText: 'Part of this Alice world can’t be read, so it wasn’t opened.',
  declaration: 'Something inside this Alice world isn’t safe to read, so it wasn’t opened.',
  badXml: 'This Alice world is damaged, so it wasn’t opened.',
};

const refuse = (code: Exclude<A3pProblemCode, ArchiveProblemCode>): ReadA3pResult => ({
  ok: false,
  problem: { code, message: MESSAGES[code] },
});

const FIXED = new Set([
  'version.txt',
  'programType.xml',
  'type.xml',
  'resources.xml',
  'thumbnail.png',
]);

/** The entries an Alice file names: its fixed parts, and its own pictures and sounds. */
const wanted = (name: string) => FIXED.has(name) || name.startsWith('resources/');

export interface ReadA3pOptions {
  /** Smaller limits, for tests. */
  readonly limits?: Partial<ArchiveLimits>;
}

/** Alice 3 only: Alice 2's worlds are another format altogether (`.a2w`). */
function versionOf(text: string): AliceVersion | null {
  const trimmed = text.trim();
  const match = /^(\d+)\.(\d+)(\.\d+)*$/.exec(trimmed);
  if (!match) return null;
  const major = Number(match[1]);
  const minor = Number(match[2]);
  return major === 3 ? { text: trimmed, major, minor } : null;
}

/** Reads an Alice 3 world or class file, or says in plain words why it can't. */
export function readA3p(bytes: Uint8Array, options: ReadA3pOptions = {}): ReadA3pResult {
  const limits = { ...ARCHIVE_LIMITS, ...options.limits };
  const archive = readArchive(bytes, { wanted, limits: options.limits ?? {} });
  if (!archive.ok) return { ok: false, problem: archive.problem };
  const { entries } = archive;

  const versionBytes = entries.get('version.txt');
  const programName = entries.has('programType.xml')
    ? 'programType.xml'
    : entries.has('type.xml')
      ? 'type.xml'
      : null;
  if (!versionBytes || !programName) return refuse('notAlice');
  const versionText = decodeText(versionBytes);
  if (versionText === null) return refuse('notText');
  const version = versionOf(versionText);
  if (!version) return refuse('unknownVersion');

  const xml = (name: string): XmlElement | ReadA3pResult => {
    const text = decodeText(entries.get(name)!);
    if (text === null) return refuse('notText');
    try {
      return parseXml(text, limits.jsonDepth);
    } catch (e) {
      if (!(e instanceof XmlRefused)) throw e;
      if (e.code === 'tooDeep')
        return {
          ok: false,
          problem: {
            code: 'tooDeep',
            message: 'Something inside this file is nested too deeply to open.',
          },
        };
      return refuse(e.code === 'declaration' ? 'declaration' : 'badXml');
    }
  };
  const isResult = (x: XmlElement | ReadA3pResult): x is ReadA3pResult => 'ok' in x;

  const program = xml(programName);
  if (isResult(program)) return program;
  // Alice's encoder writes the program's type as a `<node>`.
  if (program.name !== 'node') return refuse('notAlice');

  let resources: AliceResource[] = [];
  if (entries.has('resources.xml')) {
    const list = xml('resources.xml');
    if (isResult(list)) return list;
    resources = childElements(list)
      .filter((e) => e.name === 'resource')
      .map((e) => {
        const a = e.attributes;
        const entryName = a['entryName'] ?? '';
        return {
          entryName,
          name: a['name'] ?? '',
          className: a['className'] ?? '',
          contentType: a['contentType'] ?? '',
          uuid: a['uuid'] ?? '',
          attributes: a,
          bytes: entryName.startsWith('resources/') ? (entries.get(entryName) ?? null) : null,
        };
      });
  }

  return {
    ok: true,
    file: {
      kind: programName === 'programType.xml' ? 'world' : 'class',
      version,
      program,
      resources,
      thumbnail: entries.get('thumbnail.png') ?? null,
    },
  };
}
